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

readarray -t IDS < <(python3 - "$CLOUD_CONFIG" "$CLOUD_PROFILE" <<'PY'
import configparser, sys
path, profile = sys.argv[1], sys.argv[2]
c = configparser.ConfigParser()
c.read(path)
if profile not in c:
    raise SystemExit(f"profile [{profile}] not found in {path}")
sec = c[profile]
print(sec.get("user", ""))
print(sec.get("tenancy", ""))
PY
)

USER_OCID="${IDS[0]:-}"
TENANCY_OCID="${IDS[1]:-}"

if [ -z "$USER_OCID" ] || [ -z "$TENANCY_OCID" ]; then
  echo "Cloud Shell profile does not expose user/tenancy values needed for an API-key profile." >&2
  echo "Do not paste OCIDs into chat. Use OCI Console > User settings > API keys as the fallback." >&2
  exit 2
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

FINGERPRINT="$(openssl rsa -pubout -outform DER -in "$PRIVATE_KEY" 2>/dev/null | openssl md5 -c | sed -E 's/^.*= //')"

KEYS_JSON="$(oci iam user api-key list --user-id "$USER_OCID" --all --output json)"
readarray -t KEY_INFO < <(printf '%s' "$KEYS_JSON" | python3 -c 'import json,sys; fp=sys.argv[1]; d=json.load(sys.stdin).get("data",[]); print(len(d)); print("yes" if any(x.get("fingerprint")==fp for x in d) else "no")' "$FINGERPRINT")

KEY_COUNT="${KEY_INFO[0]}"
REGISTERED="${KEY_INFO[1]}"

echo "existing_api_key_count=$KEY_COUNT"

if [ "$REGISTERED" != "yes" ]; then
  if [ "$KEY_COUNT" -ge 3 ]; then
    echo "OCI user already has the maximum 3 API signing keys. Nothing was uploaded." >&2
    exit 3
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
echo "The private key remains only in ~/.oci and was not printed."
