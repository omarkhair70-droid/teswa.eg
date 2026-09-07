#!/usr/bin/env bash
set -Eeuo pipefail

# Capture a final/rehearsal source evidence bundle from Supabase.
# Source operations are read-only. No cutover or OCI write is performed here.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-/tmp/teswa-cutover-bundle-${STAMP}}"

if [[ -z "${TESWA_SOURCE_DATABASE_URL:-}" ]]; then
  echo "Set TESWA_SOURCE_DATABASE_URL." >&2
  exit 2
fi

mkdir -p "${OUT}"

echo "[1/4] Capturing source schema/catalog baseline..."
TESWA_DEEP_CHECKSUMS=1   bash "${ROOT}/scripts/oci-migration/capture-current-state-baseline.sh"   "${OUT}/source-baseline"

echo "[2/4] Capturing transaction-consistent public-data archive..."
bash "${ROOT}/scripts/oci-migration/capture-public-data-snapshot.sh"   "${OUT}/public-data"

echo "[3/4] Capturing identity UUID-set fingerprint..."
TESWA_DATABASE_URL="${TESWA_SOURCE_DATABASE_URL}" python3 "${ROOT}/scripts/oci-migration/capture-identity-anchor.py"   --database-url-env TESWA_DATABASE_URL   --schema auth   --table users   --column id   --label supabase-auth-users   --output "${OUT}/identity-source.json"

echo "[4/4] Capturing Storage metadata manifest..."
python3 "${ROOT}/scripts/oci-migration/capture-supabase-storage-manifest.py"   --database-url-env TESWA_SOURCE_DATABASE_URL   --output "${OUT}/storage-source.json"

if [[ "${TESWA_CAPTURE_STORAGE_BYTES:-0}" == "1" ]]; then
  echo "[optional] Downloading + hashing source Storage bytes..."
  if [[ -z "${TESWA_SUPABASE_URL:-}" || -z "${TESWA_SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "TESWA_CAPTURE_STORAGE_BYTES=1 requires TESWA_SUPABASE_URL and TESWA_SUPABASE_SERVICE_ROLE_KEY." >&2
    exit 3
  fi
  python3 "${ROOT}/scripts/oci-migration/export-supabase-storage-bytes.py"     "${OUT}/storage-source.json"     --output-dir "${OUT}/storage-bytes"     --output-manifest "${OUT}/storage-source-hashed.json"
fi

python3 - "${OUT}" "${STAMP}" <<'PY'
import hashlib, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
stamp = sys.argv[2]
files = []
for path in sorted(p for p in out.rglob("*") if p.is_file()):
    rel = path.relative_to(out).as_posix()
    if rel == "bundle-manifest.json":
        continue
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    files.append({"path": rel, "bytes": path.stat().st_size, "sha256": h.hexdigest()})
payload = {
    "format_version": 1,
    "captured_utc": stamp,
    "source_authority": "supabase",
    "source_mutations": False,
    "storage_bytes_included": (out / "storage-source-hashed.json").exists(),
    "files": files,
}
(out / "bundle-manifest.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "output": str(out),
    "files": len(files),
    "storage_bytes_included": payload["storage_bytes_included"],
}, indent=2))
PY

echo
echo "Cutover evidence bundle complete: ${OUT}"
echo "This command performed source reads only."
echo "Do not commit this directory; it can contain production application data."
