#!/usr/bin/env bash
set -Eeuo pipefail

PROFILE="${TESWA_TF_PROFILE:-teswa-terraform}"
REGION="${TESWA_TF_REGION:-me-jeddah-1}"
CLOUD_CONFIG="${OCI_CLI_CONFIG_FILE:-/etc/oci/config}"
CLOUD_PROFILE="${OCI_CLI_PROFILE:-DEFAULT}"
USER_CONFIG="$HOME/.oci/config"
PRIVATE_KEY="$HOME/.oci/teswa_terraform_api_key.pem"
PUBLIC_KEY="$HOME/.oci/teswa_terraform_api_key_public.pem"

if [ ! -f "$CLOUD_CONFIG" ]; then
  echo "Cloud Shell OCI config not found: $CLOUD_CONFIG" >&2
  exit 1
fi

# Discover tenancy/user without printing either OCID.
# Cloud Shell's instance_obo_user profile can omit classic API-key fields,
# so use multiple local sources in a strict order.
readarray -t IDS < <(python3 - "$CLOUD_CONFIG" "$CLOUD_PROFILE" <<'PY'
import base64, configparser, json, os, re, sys
from pathlib import Path

config_path, requested_profile = sys.argv[1], sys.argv[2]
user = os.environ.get("OCI_CLI_USER", "").strip()
tenancy = os.environ.get("OCI_CLI_TENANCY", "").strip()

c = configparser.ConfigParser()
c.read(config_path)

sections = []
if requested_profile in c:
    sections.append(requested_profile)
sections.extend(s for s in c.sections() if s not in sections)

delegation_paths = []
for section in sections:
    sec = c[section]
    user = user or sec.get("user", "").strip()
    tenancy = tenancy or sec.get("tenancy", "").strip()
    p = sec.get("delegation_token_file", "").strip()
    if p:
        delegation_paths.append(os.path.expanduser(p))

# The Terraform tfvars already contains the tenancy used to build the
# verified Teswa compartment. Read it locally if Cloud Shell omits tenancy.
if not tenancy:
    tfvars = Path("terraform.tfvars")
    if tfvars.exists():
        m = re.search(r'^\s*tenancy_ocid\s*=\s*"([^"]+)"', tfvars.read_text(), re.M)
        if m:
            tenancy = m.group(1)

# Final tenancy fallback: the read-only inventory captured before provisioning.
if not tenancy:
    inv_root = Path("../inventory/out")
    if inv_root.exists():
        for p in sorted(inv_root.glob("*/tenancy.json"), reverse=True):
            try:
                data = json.loads(p.read_text())
                candidate = data.get("data", {}).get("id", "")
                if candidate.startswith("ocid1.tenancy."):
                    tenancy = candidate
                    break
            except Exception:
                pass

# Cloud Shell delegation token carries the delegated user identity. Inspect it
# locally and extract an OCI user OCID if the classic config omitted "user".
if not user:
    rx = re.compile(rb'ocid1\.user\.[A-Za-z0-9._-]+')
    for token_path in delegation_paths + ["/etc/oci/delegation_token"]:
        try:
            raw = Path(token_path).read_bytes().strip()
        except Exception:
            continue

        candidates = [raw]
        # Tokens can contain JWT/JWT-like base64url segments.
        for part in raw.split(b"."):
            try:
                padded = part + b"=" * ((4 - len(part) % 4) % 4)
                candidates.append(base64.urlsafe_b64decode(padded))
            except Exception:
                pass

        for blob in candidates:
            m = rx.search(blob)
            if m:
                user = m.group(0).decode("ascii")
                break
        if user:
            break

print(user)
print(tenancy)
PY
)

USER_OCID="${IDS[0]:-}"
TENANCY_OCID="${IDS[1]:-}"

if [ -z "$TENANCY_OCID" ]; then
  echo "Could not discover the tenancy OCID locally." >&2
  echo "No OCI changes were made." >&2
  exit 2
fi

if [ -z "$USER_OCID" ]; then
  echo "Could not discover the delegated user OCID from Cloud Shell metadata." >&2
  echo "No OCI changes were made." >&2
  echo "Fallback will be manual API-key registration from OCI User settings." >&2
  exit 3
fi

mkdir -p "$HOME/.oci"
chmod 700 "$HOME/.oci"

if [ ! -f "$PRIVATE_KEY" ]; then
  echo "Generating a dedicated 2048-bit RSA API signing key..."
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIVATE_KEY" >/dev/null 2>&1
  chmod 600 "$PRIVATE_KEY"
  openssl rsa -pubout -in "$PRIVATE_KEY" -out "$PUBLIC_KEY" >/dev/null 2>&1
  chmod 644 "$PUBLIC_KEY"
else
  echo "Reusing existing local Teswa Terraform API signing key."
  if [ ! -f "$PUBLIC_KEY" ]; then
    openssl rsa -pubout -in "$PRIVATE_KEY" -out "$PUBLIC_KEY" >/dev/null 2>&1
    chmod 644 "$PUBLIC_KEY"
  fi
fi

# Verify that the discovered user identity is valid for this delegated session
# before attempting any credential mutation.
set +e
KEYS_JSON="$(oci iam user api-key list --user-id "$USER_OCID" --all --output json 2>/tmp/teswa-api-key-list.err)"
KEY_LIST_RC=$?
set -e

if [ "$KEY_LIST_RC" -ne 0 ]; then
  echo "Discovered a user identity, but OCI would not authorize API-key inspection for it." >&2
  cat /tmp/teswa-api-key-list.err >&2
  echo "No API key was uploaded." >&2
  exit 4
fi

FINGERPRINT="$(python3 - "$PRIVATE_KEY" <<'PY'
import hashlib, subprocess, sys

key = sys.argv[1]
der = subprocess.check_output(
    ["openssl", "rsa", "-pubout", "-outform", "DER", "-in", key],
    stderr=subprocess.DEVNULL,
)

# OCI API key fingerprints are MD5 identifiers. In FIPS-enabled Cloud Shell,
# OpenSSL blocks the MD5 command; Python's non-security checksum mode is the
# correct compatibility path because the digest is used only as an identifier.
digest = hashlib.md5(der, usedforsecurity=False).hexdigest()
print(":".join(digest[i:i+2] for i in range(0, len(digest), 2)))
PY
)"

if [ -z "$(printf '%s' "$KEYS_JSON" | tr -d '[:space:]')" ]; then
  KEY_COUNT=0
  REGISTERED=no
else
  readarray -t KEY_INFO < <(printf '%s' "$KEYS_JSON" | python3 -c 'import json,sys; fp=sys.argv[1]; d=json.load(sys.stdin).get("data",[]); print(len(d)); print("yes" if any(x.get("fingerprint")==fp for x in d) else "no")' "$FINGERPRINT")
  KEY_COUNT="${KEY_INFO[0]:-}"
  REGISTERED="${KEY_INFO[1]:-}"

  if [ -z "$KEY_COUNT" ] || [ -z "$REGISTERED" ]; then
    echo "Could not parse OCI API-key list response. No API key was uploaded." >&2
    exit 5
  fi
fi

echo "identity_discovery=ok"
echo "existing_api_key_count=$KEY_COUNT"

if [ "$REGISTERED" != "yes" ]; then
  if [ "$KEY_COUNT" -ge 3 ]; then
    echo "OCI user already has the maximum 3 API signing keys. Nothing was uploaded." >&2
    exit 5
  fi

  echo "Uploading only the public half of the dedicated signing key to OCI IAM..."
  oci iam user api-key upload     --user-id "$USER_OCID"     --key-file "$PUBLIC_KEY"     --query 'data.{fingerprint:fingerprint,state:"lifecycle-state"}'
else
  echo "api_key_action=reuse_registered_key"
fi

python3 - "$USER_CONFIG" "$PROFILE" "$USER_OCID" "$TENANCY_OCID" "$FINGERPRINT" "$PRIVATE_KEY" "$REGION" <<'PY'
import configparser, os, sys
path, profile, user, tenancy, fingerprint, key_file, region = sys.argv[1:]
c = configparser.ConfigParser()
if os.path.exists(path):
    c.read(path)
if profile not in c:
    c.add_section(profile)
s = c[profile]
s["user"] = user
s["tenancy"] = tenancy
s["fingerprint"] = fingerprint
s["key_file"] = key_file
s["region"] = region
with open(path, "w", encoding="utf-8") as f:
    c.write(f)
os.chmod(path, 0o600)
PY

echo "Testing the new API-key profile against Object Storage..."
oci os ns get   --config-file "$USER_CONFIG"   --profile "$PROFILE"   --auth api_key   --query data   --raw-output >/dev/null

echo "profile=$PROFILE"
echo "api_key_profile_ready=true"
echo "private_key_permissions=$(stat -c '%a' "$PRIVATE_KEY")"
echo
echo "The private key remains only in ~/.oci and no OCIDs were printed."
