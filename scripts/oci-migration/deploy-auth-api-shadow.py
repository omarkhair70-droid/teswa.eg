#!/usr/bin/env python3
"""Deploy only the private API-to-Auth rehearsal gateway; keep a durable receipt.

Submit once, then inspect --status RUN_DIR. An uncertain create never triggers
an automatic retry or deletion of the artifact needed by the original command.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile


def cli(*args):
    r = subprocess.run(['oci', *args, '--output', 'json'], text=True, capture_output=True, timeout=45)
    if r.returncode:
        raise SystemExit('OCI '+ ' '.join(args[:3])+' failed (exit '+str(r.returncode)+'): '+(r.stderr.strip() or r.stdout.strip()))
    return json.loads(r.stdout or '{"data":[]}')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--submit', action='store_true')
    group.add_argument('--status', metavar='RUN_DIR')
    a = p.parse_args()
    if a.status:
        out = Path(a.status).resolve()
        receipt = json.loads((out/'receipt.json').read_text())
        command = json.loads((out/'command.json').read_text())['data']['id']
        result = cli('instance-agent', 'command-execution', 'get', '--command-id', command,
                     '--instance-id', receipt['instance'])
        (out/'execution.json').write_text(json.dumps(result, indent=2)+'\n')
        data = result['data']; state = data['lifecycle-state']
        print('state='+state)
        if state in ('SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELED'):
            content = data.get('content') or {}
            print(content.get('text', ''))
            print('exit_code='+str(content.get('exit-code')))
            raise SystemExit(0 if state == 'SUCCEEDED' and content.get('exit-code') == 0 else 2)
        return
    os.umask(0o077)
    root = Path(__file__).resolve().parent
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out = Path.home()/'teswa-migration-evidence'/('auth-gateway-'+stamp)
    out.mkdir(parents=True, exist_ok=False)
    matches = cli('search', 'resource', 'structured-search', '--query-text',
                  "query instance resources where displayName = 'teswa-core-01'")['data']['items']
    assert len(matches) == 1, 'Expected one Core instance'
    info = cli('compute', 'instance', 'get', '--instance-id', matches[0]['identifier'])['data']
    assert info['lifecycle-state'] == 'RUNNING' and info['display-name'] == 'teswa-core-01'
    compartment = info['compartment-id']
    assert cli('iam', 'compartment', 'get', '--compartment-id', compartment)['data']['name'] == 'teswa-platform'
    bucket = cli('os', 'bucket', 'get', '--bucket-name', 'teswa-backups')['data']
    assert bucket['compartment-id'] == compartment and bucket['public-access-type'] == 'NoPublicAccess'
    assert bucket['versioning'] == 'Enabled'
    archive = out/'gateway.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        for name in ('auth-api-shadow-gateway.py', 'auth-api-shadow-guest-deploy.sh'):
            tar.add(root/name, arcname=name)
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    obj = 'lane4-rehearsal/auth-gateway/'+stamp+'-'+sha+'.tar.gz'
    cli('os', 'object', 'put', '--bucket-name', 'teswa-backups', '--name', obj,
        '--file', str(archive), '--no-overwrite')
    script = '''set -Eeuo pipefail
umask 077
[ "$(hostname -s)" = core01 ]
sudo -n true
D="$(mktemp -d /var/tmp/teswa-auth-gateway.XXXXXXXX)"
python3 - "$D/bundle.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
c=oci.object_storage.ObjectStorageClient({},signer=s)
data=c.get_object(c.get_namespace().data,'teswa-backups','__OBJECT__').data.content
open(sys.argv[1],'wb').write(data)
PY
printf '%s  %s\\n' '__SHA__' "$D/bundle.tgz" | sha256sum -c - >/dev/null
tar -xzf "$D/bundle.tgz" -C "$D"
bash "$D/auth-api-shadow-guest-deploy.sh" "$D" > "$D/deploy.log" 2>&1 || { tail -c 800 "$D/deploy.log"; exit 20; }
tail -c 800 "$D/deploy.log"
echo "guest_evidence=$D"
'''.replace('__OBJECT__', obj).replace('__SHA__', sha)
    assert len(script.encode()) <= 4096
    receipt = {'instance': info['id'], 'compartment': compartment, 'object': obj,
               'artifact_sha256': sha, 'production_cutover': False}
    (out/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
    (out/'content.json').write_text(json.dumps({'source': {'sourceType': 'TEXT', 'text': script}, 'output': {'outputType': 'TEXT'}}))
    (out/'target.json').write_text(json.dumps({'instanceId': info['id']}))
    print('run_dir='+str(out), flush=True)
    (out/'submission-started').touch()
    result = cli('instance-agent', 'command', 'create', '--compartment-id', compartment,
                 '--content', 'file://'+str(out/'content.json'), '--target', 'file://'+str(out/'target.json'),
                 '--timeout-in-seconds', '180', '--display-name', 'teswa-auth-gateway-'+stamp)
    (out/'command.json').write_text(json.dumps(result, indent=2)+'\n')
    print('gateway_command_submitted=true')


if __name__ == '__main__':
    main()
