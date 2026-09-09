#!/usr/bin/env python3
"""Promote the verified temporary HTTPS site to the existing Core API."""
import argparse,datetime,json,os,socket,subprocess,time,uuid
from pathlib import Path

IP='130.110.122.142'; PRIVATE='10.20.0.218'; CORE='10.20.10.176:3100'
HOST='130-110-122-142.sslip.io'; ROOT=Path.home()/'teswa-migration-evidence'

def cli(*args):
    p=subprocess.run(['oci',*args,'--output','json'],text=True,capture_output=True,timeout=45)
    if p.returncode: raise RuntimeError(p.stderr.strip() or p.stdout.strip() or 'OCI command failed')
    return json.loads(p.stdout)

def main():
    ap=argparse.ArgumentParser(description=__doc__); ap.add_argument('--apply',action='store_true'); a=ap.parse_args()
    os.umask(0o077)
    script=GUEST.replace('__HOST__',HOST).replace('__PRIVATE__',PRIVATE).replace('__CORE__',CORE)
    if len(script.encode())>4096: raise SystemExit('run_command_text=TOO_LARGE')
    subprocess.run(['bash','-n'],input=script,text=True,check=True)
    cfg=json.loads((ROOT/'lane4-target.json').read_text())
    iid=json.loads((ROOT/'edge-version-ci29m6in'/'target.json').read_text())['instanceId']
    edge=cli('compute','instance','get','--instance-id',iid)['data']
    if not(edge['display-name']=='teswa-edge-01' and edge['compartment-id']==cfg['compartment'] and edge['lifecycle-state']=='RUNNING'):
        raise SystemExit('edge_identity=FAILED')
    if {x[4][0] for x in socket.getaddrinfo(HOST,443,socket.AF_INET,socket.SOCK_STREAM)}!={IP}:
        raise SystemExit('temporary_dns=UNEXPECTED_ADDRESS')
    out=ROOT/('edge-api-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]); out.mkdir(mode=0o700)
    (out/'receipt.json').write_text(json.dumps({'instance':iid,'host':HOST,'core':CORE,'productionCutover':False},indent=2)+'\n')
    (out/'content.json').write_text(json.dumps({'source':{'sourceType':'TEXT','text':script},'output':{'outputType':'TEXT'}}))
    (out/'target.json').write_text(json.dumps({'instanceId':iid}))
    print('run_dir='+str(out),flush=True)
    if not a.apply: print('apply=false; no changes made'); return
    result=cli('instance-agent','command','create','--compartment-id',cfg['compartment'],'--content','file://'+str(out/'content.json'),'--target','file://'+str(out/'target.json'),'--timeout-in-seconds','300','--display-name','teswa-edge-api-rehearsal')
    (out/'command.json').write_text(json.dumps(result,indent=2)+'\n'); cid=result['data']['id']
    for _ in range(60):
        result=cli('instance-agent','command-execution','get','--command-id',cid,'--instance-id',iid); (out/'execution.json').write_text(json.dumps(result,indent=2)+'\n')
        data=result['data']
        if data['lifecycle-state'] in ('SUCCEEDED','FAILED','TIMED_OUT','CANCELED'):
            content=data.get('content') or {}; print('state='+data['lifecycle-state']); print('exit_code='+str(content.get('exit-code'))); print(content.get('text') or content.get('message') or '')
            if data['lifecycle-state']!='SUCCEEDED' or content.get('exit-code')!=0: raise SystemExit(2)
            break
        time.sleep(5)
    else: print('pending_run='+str(out)); return
    checks=[(['curl','--noproxy','*','-fsS','https://'+HOST+'/healthz'],'teswa-https-rehearsal'),
            (['curl','--noproxy','*','-fsS','https://'+HOST+'/v1/auth/healthz'],'"status":"ok"'),
            (['curl','--noproxy','*','-sS','-o',str(out/'session.json'),'-w','%{http_code}','https://'+HOST+'/v1/auth/session'],'401')]
    for command,expected in checks:
        p=subprocess.run(command,text=True,capture_output=True,timeout=20)
        if p.returncode or expected not in p.stdout: raise SystemExit('public_api_verification=FAILED')
    print('public_api_verified=true'); print('api_url=https://'+HOST)

GUEST=r'''#!/usr/bin/env bash
set -Eeuo pipefail
[ "$(hostname -s)" = edge01 ] || exit 10
H=__HOST__; P=__PRIVATE__; U=http://__CORE__; L=/etc/caddy/Caddyfile
sudo -n systemctl is-active --quiet caddy; sudo -n test -f "$L"
D=$(sudo -n mktemp -d /var/lib/teswa/ingress-backups/api-XXXXXX); B="$D/Caddyfile.before"; N="$D/Caddyfile.next"
sudo -n cp -p "$L" "$B"; OK=false
rollback(){ if [ "$OK" != true ]; then sudo -n cp -p "$B" "$L"||true; command -v restorecon >/dev/null 2>&1&&sudo -n restorecon "$L"||true; sudo -n systemctl restart caddy >/dev/null 2>&1||true; fi; }
trap rollback EXIT
sudo -n python3 - "$L" "$N" "$H" "$U" <<'PY'
import json,os,stat,subprocess,sys
from pathlib import Path
l,n,h,u=Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3],sys.argv[4]; s=l.read_text()
m='# teswa-public-https-rehearsal'
if s.count(m)!=1 or s.count('https://'+h)!=1: raise SystemExit('https_rehearsal_site_missing')
tail=s.split(m,1)[1]; needle=' handle {\n  respond "Not found" 404\n }\n}'
route=' handle /v1/* {\n  reverse_proxy '+u+'\n }\n'
if 'reverse_proxy '+u in tail:
 p=s
elif tail.count(needle)==1:
 p=s.replace(m+tail,m+tail.replace(needle,route+needle,1))
else: raise SystemExit('https_rehearsal_shape_changed')
st=l.stat(); n.write_text(p); os.chown(n,st.st_uid,st.st_gid); os.chmod(n,stat.S_IMODE(st.st_mode))
def adapt(x):
 q=subprocess.run(['/usr/bin/caddy','adapt','--config',str(x),'--adapter','caddyfile'],capture_output=True,text=True,check=True); return json.loads(q.stdout)
def server(c,listen):
 x=[v for v in c.get('apps',{}).get('http',{}).get('servers',{}).values() if listen in v.get('listen',[])]
 if len(x)!=1: raise SystemExit('server_ambiguous')
 return x[0]
def canon(x,g=None):
 g={} if g is None else g
 if type(x)==dict:return{k:(g.setdefault(v,str(len(g))) if k=='group' else canon(v,g))for k,v in x.items()}
 if type(x)==list:return[canon(v,g)for v in x]
 return x
a,b=adapt(l),adapt(n)
if canon(server(a,':8080'))!=canon(server(b,':8080')):raise SystemExit('existing_edge_routes_changed')
if p.split(m,1)[1].count('reverse_proxy '+u)!=1:raise SystemExit('api_upstream_ambiguous')
PY
V=$(sudo -n caddy validate --config "$N" --adapter caddyfile 2>&1) || { printf '%s\n' "$V" | tail -n 5; exit 14; }
sudo -n cp -p "$N" "$L"; command -v restorecon >/dev/null 2>&1&&sudo -n restorecon "$L"||true
sudo -n systemctl restart caddy
sudo -n systemctl is-active --quiet caddy
sudo -n ss -H -ltn 'sport = :8080' | grep -q .
R=(--noproxy "*" --resolve "$H:443:$P" --connect-timeout 3 --max-time 10)
for _ in $(seq 1 8);do A=$(curl "${R[@]}" -fsS "https://$H/v1/auth/healthz" 2>/dev/null||true);echo "$A"|grep -q '"status":"ok"'&&break;sleep 3;done
echo "$A"|grep -q '"supabaseRuntimeDependency":false' || exit 20
S=$(curl "${R[@]}" -sS -o /dev/null -w '%{http_code}' "https://$H/v1/auth/session") || { echo session_transport_failed; exit 21; }
echo "session_http=$S"; [ "$S" = 401 ] || exit 21
S=$(curl "${R[@]}" -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' --data '{"email":"rehearsal@teswa.invalid","password":"not-used"}' "https://$H/v1/auth/sign-up") || { echo signup_transport_failed; exit 22; }
echo "signup_http=$S"; [ "$S" = 503 ] || exit 22
OK=true; echo 'edge_public_api=PASS routes=/v1/* production_cutover=false'; echo "edge_backup=$B"
'''

if __name__=='__main__': main()
