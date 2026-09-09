#!/usr/bin/env python3
"""Guarded health-only HTTPS bootstrap for the existing Teswa Edge.

No source database access, production cutover, or public domain API routes.
Run from Cloud Shell with --apply. Preserve the execution directory for recovery.
"""
import argparse
import datetime
import ipaddress
import json
import os
import socket
import subprocess
import time
import uuid
from pathlib import Path

IP = '130.110.122.142'
PRIVATE = '10.20.0.218'
HOST = '130-110-122-142.sslip.io'
ROOT = Path.home() / 'teswa-migration-evidence'


def cli(*args):
    p = subprocess.run(['oci', *args, '--output', 'json'], text=True,
                       capture_output=True, timeout=45)
    if p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip() or 'OCI command failed')
    return json.loads(p.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    cfg = json.loads((ROOT / 'lane4-target.json').read_text())
    previous = ROOT / 'edge-version-ci29m6in' / 'target.json'
    iid = json.loads(previous.read_text())['instanceId']
    edge = cli('compute', 'instance', 'get', '--instance-id', iid)['data']
    if not (edge['display-name'] == 'teswa-edge-01' and
            edge['compartment-id'] == cfg['compartment'] and
            edge['lifecycle-state'] == 'RUNNING'):
        raise SystemExit('edge_identity=FAILED')
    addresses = {x[4][0] for x in socket.getaddrinfo(HOST, 443, socket.AF_INET, socket.SOCK_STREAM)}
    if addresses != {IP}:
        raise SystemExit('temporary_dns=UNEXPECTED_ADDRESS')
    attachments = cli('compute', 'vnic-attachment', 'list', '--compartment-id',
                      cfg['compartment'], '--instance-id', iid, '--all')['data']
    vnics = [cli('network', 'vnic', 'get', '--vnic-id', a['vnic-id'])['data']
             for a in attachments if a['lifecycle-state'] == 'ATTACHED']
    matches = [v for v in vnics if v.get('public-ip') == IP and v.get('private-ip') == PRIVATE]
    if len(matches) != 1:
        raise SystemExit('edge_address=UNEXPECTED')
    vnic = matches[0]
    groups = [cli('network', 'nsg', 'get', '--nsg-id', n)['data']
              for n in vnic.get('nsg-ids', [])]
    groups = [g for g in groups if g['compartment-id'] == cfg['compartment']
              and 'edge' in g['display-name'].lower()]
    if len(groups) != 1:
        raise SystemExit('edge_nsg=AMBIGUOUS_OR_UNAVAILABLE')
    nsg = groups[0]
    existing = cli('network', 'nsg', 'rules', 'list', '--nsg-id', nsg['id'],
                   '--direction', 'INGRESS', '--all')['data']
    def covers(rule, port):
        if rule.get('protocol') != '6' or rule.get('source') != '0.0.0.0/0':
            return False
        opts = rule.get('tcp-options') or {}
        rng = opts.get('destination-port-range')
        return rng is None or rng['min'] <= port <= rng['max']
    missing = [p for p in (80, 443) if not any(covers(r, p) for r in existing)]
    out = ROOT / ('edge-https-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6])
    out.mkdir(mode=0o700)
    receipt = {'instance': iid, 'compartment': cfg['compartment'], 'host': HOST,
               'nsg': nsg['id'], 'portsToAdd': missing, 'productionCutover': False}
    (out / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('run_dir=' + str(out), flush=True)
    print('temporary_dns=PASS', flush=True)
    print('edge_nsg=' + nsg['display-name'], flush=True)
    print('ports_to_add=' + ','.join(map(str, missing)), flush=True)
    if not args.apply:
        print('apply=false; no changes made')
        return
    if missing:
        rules = [{'direction': 'INGRESS', 'protocol': '6', 'source': '0.0.0.0/0',
                  'sourceType': 'CIDR_BLOCK', 'isStateless': False,
                  'description': 'Teswa Edge public HTTPS rehearsal',
                  'tcpOptions': {'destinationPortRange': {'min': p, 'max': p}}}
                 for p in missing]
        cli('network', 'nsg', 'rules', 'add', '--nsg-id', nsg['id'],
            '--security-rules', json.dumps(rules))
        print('edge_ingress_rules=ADDED', flush=True)
    script = GUEST.replace('__HOST__', HOST).replace('__PRIVATE__', PRIVATE)
    if len(script.encode()) > 4096:
        raise SystemExit('run_command_text=TOO_LARGE')
    (out / 'content.json').write_text(json.dumps({'source': {'sourceType': 'TEXT', 'text': script},
                                                   'output': {'outputType': 'TEXT'}}))
    (out / 'target.json').write_text(json.dumps({'instanceId': iid}))
    result = cli('instance-agent', 'command', 'create', '--compartment-id', cfg['compartment'],
                 '--content', 'file://' + str(out / 'content.json'), '--target', 'file://' + str(out / 'target.json'),
                 '--timeout-in-seconds', '480', '--display-name', 'teswa-edge-https-rehearsal')
    (out / 'command.json').write_text(json.dumps(result, indent=2) + '\n')
    cid = result['data']['id']
    print('command_submitted=true', flush=True)
    for _ in range(90):
        result = cli('instance-agent', 'command-execution', 'get', '--command-id', cid, '--instance-id', iid)
        (out / 'execution.json').write_text(json.dumps(result, indent=2) + '\n')
        data = result['data']
        state = data['lifecycle-state']
        if state in ('SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELED'):
            content = data.get('content') or {}
            print('state=' + state)
            print('exit_code=' + str(content.get('exit-code')))
            print(content.get('text') or content.get('message') or '')
            if state != 'SUCCEEDED' or content.get('exit-code') != 0:
                raise SystemExit(2)
            break
        time.sleep(5)
    else:
        print('pending_run=' + str(out))
        return
    expected = 'teswa-https-rehearsal'
    for _ in range(6):
        p = subprocess.run(['curl', '--noproxy', '*', '--connect-timeout', '5', '--max-time', '15',
                            '-fsS', 'https://' + HOST + '/healthz'], text=True, capture_output=True)
        if p.returncode == 0 and p.stdout.strip() == expected:
            print('public_https_verified=true')
            print('https_url=https://' + HOST)
            return
        time.sleep(3)
    print('public_https_verified=false; inspect the existing run, do not resubmit')
    raise SystemExit(2)


GUEST = r'''#!/usr/bin/env bash
set -Eeuo pipefail
[ "$(hostname -s)" = edge01 ] || exit 10
HOST=__HOST__
PRIVATE=__PRIVATE__
LIVE=/etc/caddy/Caddyfile
sudo -n systemctl is-active --quiet caddy
sudo -n test -f "$LIVE"
# Touch only the active Edge firewall zone; never disable the firewall.
if command -v firewall-cmd >/dev/null 2>&1 && sudo -n firewall-cmd --state >/dev/null 2>&1; then
  IFACE=$(ip -o -4 addr show | awk -v ip="$PRIVATE" '$4 ~ "^"ip"/" {print $2; exit}')
  ZONE=$(sudo -n firewall-cmd --get-zone-of-interface="$IFACE" 2>/dev/null || true)
  [ -n "$ZONE" ] || ZONE=$(sudo -n firewall-cmd --get-default-zone)
  for PORT in 80 443; do
    sudo -n firewall-cmd --zone="$ZONE" --add-port="$PORT/tcp" >/dev/null
    sudo -n firewall-cmd --permanent --zone="$ZONE" --add-port="$PORT/tcp" >/dev/null
  done
fi
sudo -n mkdir -p /var/lib/teswa/ingress-backups
sudo -n install -d -o root -g root -m 0700 /var/lib/teswa/ingress-backups
D=$(sudo -n mktemp -d /var/lib/teswa/ingress-backups/https-XXXXXX)
BACKUP="$D/Caddyfile.before"
sudo -n cp -p "$LIVE" "$BACKUP"
DONE=false
cleanup() {
  if [ "$DONE" != true ]; then
    sudo -n cp -p "$BACKUP" "$LIVE" || true
    if command -v restorecon >/dev/null 2>&1; then sudo -n restorecon "$LIVE" || true; fi
    sudo -n caddy reload --config "$LIVE" --adapter caddyfile >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
sudo -n python3 - "$LIVE" "$D/Caddyfile.next" "$HOST" <<'PY'
import os,re,stat,subprocess,sys
from pathlib import Path
live,candidate,host=map(Path,sys.argv[1:3])+[] if False else (Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3])
s=live.read_text(); marker='# teswa-public-https-rehearsal'
if marker not in s:
    if 'https://'+host in s: raise SystemExit('https_site_conflict')
    m=re.match(r'\A(\s*(?:#[^\n]*\n\s*)*\{\s*\n)(.*?)(^\}\s*$)',s,re.M|re.S)
    if m:
        block=m.group(2)
        block,n=re.subn(r'(?m)^\s*auto_https\s+off\s*\n','',block)
        s=s[:m.start(2)]+block+s[m.end(2):]
    s+='\n'+marker+'\nhttps://'+host+' {\n tls {\n  issuer acme https://acme-v02.api.letsencrypt.org/directory\n }\n handle /healthz {\n  respond "teswa-https-rehearsal" 200\n }\n handle {\n  respond "Not found" 404\n }\n}\n'
st=live.stat(); candidate.write_text(s)
os.chown(candidate,st.st_uid,st.st_gid); os.chmod(candidate,stat.S_IMODE(st.st_mode))
PY
sudo -n caddy validate --config "$D/Caddyfile.next" --adapter caddyfile >/dev/null
sudo -n cp -p "$D/Caddyfile.next" "$LIVE"
if command -v restorecon >/dev/null 2>&1; then sudo -n restorecon "$LIVE"; fi
sudo -n caddy reload --config "$LIVE" --adapter caddyfile >/dev/null
READY=false
for _ in $(seq 1 24); do
  if BODY=$(curl --noproxy '*' --resolve "$HOST:443:$PRIVATE" --connect-timeout 3 --max-time 8 -fsS "https://$HOST/healthz" 2>/dev/null); then
    if [ "$BODY" = teswa-https-rehearsal ]; then READY=true; break; fi
  fi
  sleep 5
done
if [ "$READY" != true ]; then
  echo 'edge_https=FAIL certificate_or_health'
  sudo -n journalctl -u caddy -n 12 --no-pager -o cat || true
  exit 20
fi
DONE=true
printf 'edge_https=PASS host=%s\n' "$HOST"
echo 'public_routes=health_only production_cutover=false'
echo "edge_backup=$BACKUP"
'''


if __name__ == '__main__':
    main()
