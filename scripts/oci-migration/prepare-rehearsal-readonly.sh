#!/usr/bin/env bash
set -Eeuo pipefail

# Prepare Lane 4 rehearsal evidence without transferring or mutating application data.
#
# Source actions are PostgreSQL read-only. Target actions: none.
# This intentionally does NOT run pg_dump --data-only, pg_restore, Storage copy,
# credential creation, or any production cutover action.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-/tmp/teswa-rehearsal-readonly-${STAMP}}"
SOURCE_DIR="$OUT/source"
BASELINE_DIR="$OUT/portable-baseline"

if [[ -z "${TESWA_SOURCE_DATABASE_URL:-}" ]]; then
  echo "Set TESWA_SOURCE_DATABASE_URL to the current Supabase PostgreSQL source." >&2
  exit 2
fi

mkdir -p "$OUT"

echo "TESWA LANE 4 READ-ONLY REHEARSAL PREPARATION"
echo "source_mutation=none"
echo "target_mutation=none"
echo "data_transfer=none"
echo "production_cutover=none"
echo

echo "[1/5] Capture current source schema/catalog baseline (read-only)..."
TESWA_DEEP_CHECKSUMS=0 \
  bash "$ROOT/scripts/oci-migration/capture-current-state-baseline.sh" "$SOURCE_DIR"

echo "[2/5] Fail-close on raw provider-specific baseline hazards..."
python3 "$ROOT/scripts/oci-migration/check-portable-baseline.py" \
  "$SOURCE_DIR/public-schema.raw.sql" \
  --report "$OUT/portable-safety-report.json" || true

echo "[3/5] Compile provider-neutral structural baseline offline..."
python3 "$ROOT/scripts/oci-migration/compile-portable-baseline.py" \
  "$SOURCE_DIR/source-manifest.json" \
  --output-dir "$BASELINE_DIR"

echo "[4/5] Build FK-aware public data dependency plan offline..."
python3 "$ROOT/scripts/oci-migration/plan-data-copy.py" \
  "$SOURCE_DIR/source-manifest.json" \
  --output "$OUT/data-copy-plan.json"

echo "[5/5] Classify provider/runtime dependencies offline..."
python3 "$ROOT/scripts/oci-migration/classify-runtime-dependencies.py" \
  "$SOURCE_DIR/source-manifest.json" \
  --output "$OUT/runtime-dependency-review.json"

python3 - "$OUT" <<'PY'
import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1])
manifest=json.loads((root/"source"/"source-manifest.json").read_text(encoding="utf-8"))
catalog=manifest.get("catalog",{})
summary={
  "format_version":1,
  "mode":"read_only_rehearsal_preparation",
  "source_mutation":False,
  "target_mutation":False,
  "data_transfer":False,
  "production_cutover":False,
  "source_manifest_format":manifest.get("format_version"),
  "public_tables":len([x for x in catalog.get("tables",[]) if x.get("schema_name")=="public"]),
  "public_views":len([x for x in catalog.get("views",[]) if x.get("schema_name")=="public"]),
  "public_foreign_keys":len([x for x in catalog.get("foreign_keys",[]) if x.get("target_schema")=="public"]),
  "external_foreign_keys":len([x for x in catalog.get("foreign_keys",[]) if x.get("target_schema")!="public"]),
  "files":[],
}
for p in sorted(x for x in root.rglob("*") if x.is_file()):
    rel=p.relative_to(root).as_posix()
    if rel=="readonly-rehearsal-summary.json":
        continue
    h=hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    summary["files"].append({"path":rel,"bytes":p.stat().st_size,"sha256":h.hexdigest()})
(root/"readonly-rehearsal-summary.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
print(json.dumps({k:v for k,v in summary.items() if k!="files"},indent=2))
PY

echo
echo "READ-ONLY REHEARSAL PREPARATION COMPLETE"
echo "Evidence: $OUT"
echo "No source or target rows were transferred or modified."
echo "Do not commit generated evidence; it can contain production schema/resource metadata."
