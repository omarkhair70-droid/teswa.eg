#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; BUCKET=teswa-backups; STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"; ARCHIVE="$WORK/offers-listings-core.tar.gz"; CONTENT="$WORK/content.json"; TARGET="$WORK/target.json"; UPLOADED=false
cleanup(){ rm -rf "$WORK"; if [ "$UPLOADED" = true ]; then oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null 2>&1 || true; fi; }; trap cleanup EXIT
for f in runtime-offers-listings-core.sql verify-runtime-offers-listings-core.sql offers-listings-core-guest-apply.sh; do [ -f "$ROOT/scripts/oci-migration/$f" ] || { echo "offers_listings_operator=FAIL reason=missing_$f" >&2; exit 2; }; done
mkdir -p "$WORK/stage"
cp "$ROOT/scripts/oci-migration/runtime-offers-listings-core.sql" "$WORK/stage/"
cp "$ROOT/scripts/oci-migration/verify-runtime-offers-listings-core.sql" "$WORK/stage/"
cp "$ROOT/scripts/oci-migration/offers-listings-core-guest-apply.sh" "$WORK/stage/guest-apply.sh"
chmod 700 "$WORK/stage/guest-apply.sh"
tar -C "$WORK/stage" -czf "$ARCHIVE" runtime-offers-listings-core.sql verify-runtime-offers-listings-core.sql guest-apply.sh
SHA="$(sha256sum "$ARCHIVE"|awk '{print $1}')"; OBJECT="lane4-rehearsal/offers-listings-core/$STAMP-$SHA.tar.gz"
INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'offers_listings_operator=FAIL reason=core_instance_not_found'; exit 3; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"; STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo 'offers_listings_operator=FAIL reason=target_not_running'; exit 4; }
oci os object put --bucket-name "$BUCKET" --name "$OBJECT" --file "$ARCHIVE" --force >/dev/null; UPLOADED=true
echo 'TESWA LANE 4 OFFERS LISTINGS CORE OPERATOR'; echo 'database=teswa_rehearsal'; echo 'functions=10'; echo 'policies=15'; echo 'supabase_mutation=none'; echo 'production_cutover=none'; echo 'app_traffic_switch=none'; echo "artifact_sha256=$SHA"
SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
OBJ='__OBJECT__'; SHA='__SHA__'; D="$(mktemp -d /var/tmp/teswa-offers-listings-XXXXXX)"; trap 'rm -rf "$D"' EXIT
sudo -n true || { echo 'offers_listings_operator=FAIL reason=no_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'offers_listings_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
python3 - "$OBJ" "$D/a.tgz" <<'PY'
import oci,sys
s=oci.auth.signers.InstancePrincipalsSecurityTokenSigner(); c=oci.object_storage.ObjectStorageClient({},signer=s); ns=c.get_namespace().data; r=c.get_object(ns,'teswa-backups',sys.argv[1]); open(sys.argv[2],'wb').write(r.data.content)
PY
printf '%s  %s\n' "$SHA" "$D/a.tgz"|sha256sum -c - >/dev/null || { echo 'offers_listings_operator=FAIL reason=artifact_sha'; exit 12; }
tar -xzf "$D/a.tgz" -C "$D"
chmod 700 "$D/guest-apply.sh"
bash "$D/guest-apply.sh" "$D"
GUEST
)"
SCRIPT_TEXT="${SCRIPT_TEXT//__OBJECT__/$OBJECT}"; SCRIPT_TEXT="${SCRIPT_TEXT//__SHA__/$SHA}"; BYTES="$(printf '%s' "$SCRIPT_TEXT"|wc -c|tr -d ' ')"; echo "guest_script_bytes=$BYTES"; [ "$BYTES" -le 4096 ] || { echo 'offers_listings_operator=FAIL reason=run_command_text_limit'; exit 5; }
python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys; json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys; json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY
CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 300 --display-name 'teswa-lane4-offers-listings-core' --query 'data.id' --raw-output)"; echo "command_id=$CID"
while true; do J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"; S="$(printf '%s' "$J"|python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"; echo "state=$S"; case "$S" in SUCCEEDED|FAILED|TIMED_OUT|CANCELED) printf '%s' "$J"|python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'; [ "$S" = SUCCEEDED ] || exit 6; break;; esac; sleep 3; done
oci os object delete --bucket-name "$BUCKET" --object-name "$OBJECT" --force >/dev/null; UPLOADED=false
echo 'offers_listings_artifact_cleanup=PASS'; echo 'offers_listings_operator_cloudshell=PASS'
