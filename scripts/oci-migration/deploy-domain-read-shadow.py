#!/usr/bin/env python3
"""Submit or inspect the guarded Oracle marketplace read deployment."""
import argparse, datetime, hashlib, json, os, subprocess, tarfile
from pathlib import Path


def cli(*args):
    run = subprocess.run(['oci', *args, '--output', 'json'], capture_output=True, text=True, timeout=45)
    if run.returncode:
        raise SystemExit('OCI command failed: '+(run.stderr.strip() or run.stdout.strip()))
    return json.loads(run.stdout or '{"data":[]}')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--submit',action='store_true'); group.add_argument('--status')
    args=parser.parse_args()
    if args.status:
        out=Path(args.status).resolve(); receipt=json.loads((out/'receipt.json').read_text())
        cid=json.loads((out/'command.json').read_text())['data']['id']
        result=cli('instance-agent','command-execution','get','--command-id',cid,'--instance-id',receipt['instance'])
        (out/'execution.json').write_text(json.dumps(result,indent=2)+'\n')
        data=result['data']; print('state='+data['lifecycle-state']); print('delivery_state='+str(data.get('delivery-state')))
        if data['lifecycle-state'] in ('SUCCEEDED','FAILED','TIMED_OUT','CANCELED'):
            content=data.get('content') or {}; print(content.get('text','')); print('exit_code='+str(content.get('exit-code')))
            raise SystemExit(0 if data['lifecycle-state']=='SUCCEEDED' and content.get('exit-code')==0 else 2)
        raise SystemExit(3)
    os.umask(0o077); root=Path(__file__).resolve().parent
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out=Path.home()/'teswa-migration-evidence'/('domain-read-'+stamp); out.mkdir(parents=True)
    matches=cli('search','resource','structured-search','--query-text',"query instance resources where displayName = 'teswa-core-01'")['data']['items']
    assert len(matches)==1; info=cli('compute','instance','get','--instance-id',matches[0]['identifier'])['data']
    assert info['lifecycle-state']=='RUNNING'; compartment=info['compartment-id']
    names=('oracle_domain_read.py','oracle_marketplace_write.py','oracle_marketplace_lifecycle.py','oracle_exchange.py','oracle_exchange_read.py',
           'oracle_exchange_read_extra.py','oracle_media.py','oracle_domain_service.py','auth-api-shadow-gateway.py',
           'oracle_profiles.py','oracle_notifications.py','oracle_reviews.py','runtime-domain-api-grants.sql','domain-read-shadow-guest-deploy.sh')
    names=names+('domain_exchange_e2e.py',)
    archive=out/'bundle.tar.gz'
    with tarfile.open(archive,'w:gz') as tar:
        for name in names: tar.add(root/name,arcname=name)
    sha=hashlib.sha256(archive.read_bytes()).hexdigest(); obj=f'lane4-rehearsal/domain-read/{stamp}-{sha}.tar.gz'
    cli('os','object','put','--bucket-name','teswa-backups','--name',obj,'--file',str(archive),'--no-overwrite')
    script='''set -Eeuo pipefail
D="$(mktemp -d /var/tmp/teswa-domain-read.XXXXXXXX)"
python3 - "$D/bundle.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s)
open(sys.argv[1],'wb').write(c.get_object(c.get_namespace().data,'teswa-backups','__OBJ__').data.content)
PY
printf '%s  %s\n' '__SHA__' "$D/bundle.tgz" | sha256sum -c - >/dev/null
tar -xzf "$D/bundle.tgz" -C "$D"
bash "$D/domain-read-shadow-guest-deploy.sh" "$D" > "$D/deploy.log" 2>&1 || { tail -c 900 "$D/deploy.log"; exit 20; }
tail -c 900 "$D/deploy.log"; echo "guest_evidence=$D"
'''.replace('__OBJ__',obj).replace('__SHA__',sha)
    assert len(script.encode())<=4096
    receipt={'instance':info['id'],'compartment':compartment,'object':obj,'sha256':sha,'productionCutover':False}
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    (out/'content.json').write_text(json.dumps({'source':{'sourceType':'TEXT','text':script},'output':{'outputType':'TEXT'}}))
    (out/'target.json').write_text(json.dumps({'instanceId':info['id']}))
    print('run_dir='+str(out),flush=True)
    result=cli('instance-agent','command','create','--compartment-id',compartment,'--content','file://'+str(out/'content.json'),'--target','file://'+str(out/'target.json'),'--timeout-in-seconds','240','--display-name','teswa-domain-read-'+stamp)
    (out/'command.json').write_text(json.dumps(result,indent=2)+'\n'); print('submitted=true')


if __name__=='__main__': main()
