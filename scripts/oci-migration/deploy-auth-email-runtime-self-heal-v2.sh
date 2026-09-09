#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_SELF_HEAL="$ROOT/scripts/oci-migration/deploy-auth-email-runtime-self-heal.sh"
ORIGINAL_GUEST="$ROOT/scripts/oci-migration/auth-email-runtime-guest-deploy.sh"

for f in "$BASE_SELF_HEAL" "$ORIGINAL_GUEST"; do
  [ -f "$f" ] || { echo "auth_email_self_heal_v2=FAIL reason=missing_repo_asset path=$f" >&2; exit 2; }
done

TMP_GUEST="$(mktemp "$ROOT/scripts/oci-migration/.auth-email-runtime-guest-boolfix.XXXXXX.sh")"
TMP_SELF_HEAL="$(mktemp "$ROOT/scripts/oci-migration/.auth-email-self-heal-v2.XXXXXX.sh")"
cleanup() { rm -f "$TMP_GUEST" "$TMP_SELF_HEAL"; }
trap cleanup EXIT

# PostgreSQL boolean cast-to-text returns "true"/"false", while uncast boolean
# psql output is "t"/"f". The previous runtime guards compared a ::text result
# only to "t", so a healthy foundation was falsely reported as missing.
python3 - "$ORIGINAL_GUEST" "$TMP_GUEST" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text(encoding='utf-8')
old = '''[ "$EMAIL_IDENTITY_OK" = t ] || { echo 'auth_email_runtime=FAIL reason=legacy_email_identity_mapping'; exit 16; }'''
new = '''[[ "$EMAIL_IDENTITY_OK" = t || "$EMAIL_IDENTITY_OK" = true ]] || { echo 'auth_email_runtime=FAIL reason=legacy_email_identity_mapping'; exit 16; }'''
if old not in src:
    raise SystemExit('auth_email_self_heal_v2=FAIL reason=email_identity_guard_shape_changed')
src = src.replace(old, new, 1)
Path(sys.argv[2]).write_text(src, encoding='utf-8')
PY
chmod 700 "$TMP_GUEST"

python3 - "$BASE_SELF_HEAL" "$TMP_SELF_HEAL" "$TMP_GUEST" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text(encoding='utf-8')
out = Path(sys.argv[2])
patched_guest = sys.argv[3]

old_guest = 'GUEST="$ROOT/scripts/oci-migration/auth-email-runtime-guest-deploy.sh"'
new_guest = f'GUEST="{patched_guest}"'
if old_guest not in src:
    raise SystemExit('auth_email_self_heal_v2=FAIL reason=self_heal_guest_path_shape_changed')
src = src.replace(old_guest, new_guest, 1)

old_guard = '''[ "$BASE_OK" = t ] || { echo 'auth_email_runtime=FAIL reason=auth_foundation_missing_after_same_command_repair'; exit 14; }'''
new_guard = '''[[ "$BASE_OK" = t || "$BASE_OK" = true ]] || { echo "auth_email_runtime=FAIL reason=auth_foundation_missing_after_same_command_repair value=$BASE_OK"; exit 14; }'''
if old_guard not in src:
    raise SystemExit('auth_email_self_heal_v2=FAIL reason=self_heal_boolean_guard_shape_changed')
src = src.replace(old_guard, new_guard, 1)

out.write_text(src, encoding='utf-8')
PY
chmod 700 "$TMP_SELF_HEAL"

echo 'auth_email_self_heal_v2_fix=POSTGRES_BOOLEAN_TEXT_SEMANTICS'
echo 'previous_false_negative=auth_foundation_missing_after_same_command_repair'
echo 'supabase_source_access=READ_ONLY'
echo 'oci_mutation_scope=TESWA_REHEARSAL_ONLY'
bash "$TMP_SELF_HEAL"
echo 'auth_email_runtime_self_heal_v2_full_operator=PASS'
