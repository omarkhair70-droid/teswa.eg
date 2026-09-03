#!/usr/bin/env bash
set -Eeuo pipefail

# Run the first real Teswa Storage migration rehearsal:
# Supabase metadata -> source byte export/hash -> OCI upload ->
# OCI byte re-download/hash -> exact parity report.
#
# Source is read-only. OCI teswa-media is target-mutating.
# No target deletions are performed.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-/tmp/teswa-storage-rehearsal-${STAMP}}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need python3
need psql
need oci

for name in   TESWA_SOURCE_DATABASE_URL   TESWA_SUPABASE_URL   TESWA_SUPABASE_SERVICE_ROLE_KEY   TESWA_OCI_COMPARTMENT_OCID
do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

if [[ "${TESWA_ALLOW_TARGET_WRITE:-}" != "YES" ]]; then
  echo "Refusing OCI target writes. Set TESWA_ALLOW_TARGET_WRITE=YES." >&2
  exit 2
fi

if [[ "${TESWA_OCI_STORAGE_ASSERTION:-}" != "YES" ]]; then
  echo "Refusing OCI Storage writes. Set TESWA_OCI_STORAGE_ASSERTION=YES." >&2
  exit 2
fi

MAP="${TESWA_OCI_STORAGE_BUCKET_MAP:-$ROOT/scripts/oci-migration/oci-storage-bucket-map.phase2.json}"
[[ -f "$MAP" ]] || {
  echo "Missing OCI bucket map: $MAP" >&2
  exit 3
}

mkdir -p "$OUT"

echo "[1/5] Capture read-only Supabase Storage metadata..."
python3 "$ROOT/scripts/oci-migration/capture-supabase-storage-manifest.py"   --database-url-env TESWA_SOURCE_DATABASE_URL   --output "$OUT/source-storage.json"

echo "[2/5] Download and hash source bytes..."
python3 "$ROOT/scripts/oci-migration/export-supabase-storage-bytes.py"   "$OUT/source-storage.json"   --output-dir "$OUT/source-bytes"   --output-manifest "$OUT/source-storage-hashed.json"

echo "[3/5] Upload verified source bytes to OCI teswa-media..."
python3 "$ROOT/scripts/oci-migration/upload-storage-to-oci.py"   "$OUT/source-storage-hashed.json"   --export-dir "$OUT/source-bytes"   --bucket-map "$MAP"   --output-manifest "$OUT/oci-upload-record.json"

echo "[4/5] Re-download and hash actual OCI target bytes..."
python3 "$ROOT/scripts/oci-migration/export-oci-storage-bytes.py"   "$OUT/oci-upload-record.json"   --output-dir "$OUT/oci-bytes"   --output-manifest "$OUT/oci-storage-hashed.json"

echo "[5/5] Require exact source/target byte parity..."
python3 "$ROOT/scripts/oci-migration/compare-storage-manifests.py"   "$OUT/source-storage-hashed.json"   "$OUT/oci-storage-hashed.json"   --require-content-sha256   --report "$OUT/storage-parity-report.json"

python3 - "$OUT" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
files = []
for path in sorted(p for p in root.rglob("*") if p.is_file()):
    rel = path.relative_to(root).as_posix()
    if rel.startswith("source-bytes/") or rel.startswith("oci-bytes/"):
        continue
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    files.append({"path": rel, "bytes": path.stat().st_size, "sha256": h.hexdigest()})
(root / "rehearsal-evidence.json").write_text(
    json.dumps({"format_version": 1, "files": files}, indent=2) + "\n",
    encoding="utf-8",
)
PY

echo
echo "STORAGE REHEARSAL GREEN"
echo "Evidence: $OUT"
echo "Supabase source mutations: none"
echo "OCI target deletions: none"
echo "Do not commit this directory; it contains production media bytes."
