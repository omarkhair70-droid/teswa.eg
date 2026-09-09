#!/usr/bin/env bash
set -Eeuo pipefail

# Execute Lane 4 entry gates after Lane 3 PostgreSQL handoff.
#
# This is intentionally read-only with respect to both Supabase data and the
# OCI PostgreSQL target. It does not create credentials, restore data, copy
# Storage objects, switch traffic, or perform production cutover.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-/tmp/teswa-lane4-entry-${STAMP}}"
SOURCE_PREP="$OUT/source-prep"

if [[ -z "${TESWA_SOURCE_DATABASE_URL:-}" ]]; then
  echo "Missing TESWA_SOURCE_DATABASE_URL (read-only Supabase PostgreSQL source)." >&2
  exit 2
fi

# Fail closed if write opt-ins happen to be present in the shell. This command
# is an entry/readiness gate, not a data-load command.
for name in TESWA_ALLOW_TARGET_WRITE TESWA_ALLOW_REHEARSAL_DATA_LOAD TESWA_ALLOW_PRODUCTION_CUTOVER; do
  if [[ "${!name:-}" == "YES" ]]; then
    echo "Refusing read-only entry gate while $name=YES is set. Unset it first." >&2
    exit 3
  fi
done

mkdir -p "$OUT"

cat >"$OUT/README.txt" <<EOF
Teswa Lane 4 read-only entry evidence
Captured UTC: $STAMP

Safety:
- Supabase source mutation: none
- OCI PostgreSQL schema/data mutation: none
- application data transfer: none
- credential creation: none
- production cutover: none

Do not commit this directory. It may contain production schema/resource metadata.
EOF

echo "TESWA LANE 4 ENTRY — READ-ONLY GATES"
echo "source_mutation=none"
echo "target_mutation=none"
echo "data_transfer=none"
echo "credentials_created=false"
echo "production_cutover=none"
echo

echo "[1/3] Independently verify Lane 3 PostgreSQL handoff in place..."
bash "$ROOT/scripts/oci-migration/run-target-preflight-via-oci.sh" \
  | tee "$OUT/target-preflight.log"

grep -q '^lane4_postgres_target_preflight=PASS$' "$OUT/target-preflight.log" || {
  echo "lane4_entry_readonly_gates=FAIL reason=target_preflight_not_green" >&2
  exit 10
}

echo
echo "[2/3] Capture and compile current source rehearsal evidence (read-only)..."
bash "$ROOT/scripts/oci-migration/prepare-rehearsal-readonly.sh" "$SOURCE_PREP" \
  | tee "$OUT/source-preparation.log"

echo
echo "[3/3] Require audited structural invariants before any rehearsal mutation..."
python3 "$ROOT/scripts/oci-migration/verify-source-structural-invariants.py" \
  "$SOURCE_PREP/source/source-manifest.json" \
  --report "$OUT/source-structural-gate.json" \
  | tee "$OUT/source-structural-gate.log"

python3 - "$OUT" <<'PY'
import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1])
files=[]
for path in sorted(p for p in root.rglob("*") if p.is_file()):
    rel=path.relative_to(root).as_posix()
    if rel=="entry-gate-evidence.json":
        continue
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    files.append({"path":rel,"bytes":path.stat().st_size,"sha256":h.hexdigest()})
summary={
    "format_version":1,
    "mode":"lane4_entry_readonly_gates",
    "source_mutation":False,
    "target_mutation":False,
    "data_transfer":False,
    "credentials_created":False,
    "production_cutover":False,
    "target_preflight":"PASS",
    "source_structural_gate":"PASS",
    "files":files,
}
(root/"entry-gate-evidence.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
PY

echo
echo "lane4_entry_readonly_gates=PASS"
echo "Evidence: $OUT"
echo "Next mutation remains blocked pending explicit review of this evidence."
