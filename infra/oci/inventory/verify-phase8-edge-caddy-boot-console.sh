#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-15}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-480}"
DISPLAY_NAME="teswa-phase8-caddy-boot-verify"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
EDGE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-edge-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$EDGE_ID" ] && [ "$EDGE_ID" != "null" ] && [ "$EDGE_ID" != "None" ] || {
  echo "phase8_caddy_boot_console_verify=FAIL reason=edge_not_running" >&2
  exit 2
}

echo "TESWA PHASE 8 EDGE CADDY BOOT CONSOLE VERIFY"
echo "target=teswa-edge-01"
echo "guest_command_created=false"
echo "run_command_dependency=none"
echo "console_history_transport=python_sdk"
echo "max_wait_seconds=$MAX_WAIT_SECONDS"

python3 - "$COMPARTMENT" "$EDGE_ID" "$DISPLAY_NAME" "$POLL_SECONDS" "$MAX_WAIT_SECONDS" <<'PY'
import os
import sys
import time
from pathlib import Path

try:
    import oci
except Exception as exc:
    print(f"phase8_caddy_boot_console_verify=FAIL reason=oci_python_sdk_unavailable detail={type(exc).__name__}")
    raise SystemExit(10)

compartment_id, instance_id, display_name, poll_s, max_wait_s = sys.argv[1:]
poll_s = int(poll_s)
max_wait_s = int(max_wait_s)


def build_client():
    cfg_path = os.path.expanduser(os.environ.get("OCI_CLI_CONFIG_FILE", "~/.oci/config"))
    profile = os.environ.get("OCI_CLI_PROFILE", "DEFAULT")
    auth = os.environ.get("OCI_CLI_AUTH", "").strip().lower()
    cfg = oci.config.from_file(file_location=cfg_path, profile_name=profile)

    if auth == "instance_principal":
        signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
        return oci.core.ComputeClient({"region": cfg.get("region")}, signer=signer), "instance_principal"

    token_file = cfg.get("security_token_file")
    if auth == "security_token" or token_file:
        if not token_file:
            raise RuntimeError("security_token auth requested but security_token_file is missing")
        token = Path(os.path.expanduser(token_file)).read_text(encoding="utf-8").strip()
        key = oci.signer.load_private_key_from_file(
            os.path.expanduser(cfg["key_file"]),
            pass_phrase=cfg.get("pass_phrase"),
        )
        signer = oci.auth.signers.SecurityTokenSigner(token, key)
        return oci.core.ComputeClient({"region": cfg["region"]}, signer=signer), "security_token"

    return oci.core.ComputeClient(cfg), "api_key"


def content_bytes(response):
    data = response.data
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if hasattr(data, "content"):
        value = data.content
        if isinstance(value, bytes):
            return value
    if hasattr(data, "raw"):
        return data.raw.read()
    if hasattr(data, "read"):
        return data.read()
    return str(data).encode("utf-8", errors="replace")


try:
    client, auth_mode = build_client()
    print(f"sdk_auth_mode={auth_mode}")

    histories = oci.pagination.list_call_get_all_results(
        client.list_console_histories,
        compartment_id,
        instance_id=instance_id,
    ).data

    stale = [h for h in histories if getattr(h, "display_name", None) == display_name]
    deleted = 0
    for history in stale:
        hid = getattr(history, "id", None)
        if not hid:
            continue
        client.delete_console_history(hid)
        deleted += 1
    print(f"stale_verifier_histories_deleted={deleted}")
except Exception as exc:
    print(f"phase8_caddy_boot_console_verify=FAIL reason=sdk_controlplane_setup_failed detail={type(exc).__name__}:{str(exc)[:240]}")
    raise SystemExit(11)

elapsed = 0
last_text = ""
while True:
    history_id = None
    try:
        details = oci.core.models.CaptureConsoleHistoryDetails(
            instance_id=instance_id,
            display_name=display_name,
        )
        response = client.capture_console_history(details)
        history_id = response.data.id

        deadline = time.time() + 90
        state = None
        while time.time() < deadline:
            meta = client.get_console_history(history_id).data
            state = getattr(meta, "lifecycle_state", None)
            if state == "SUCCEEDED":
                break
            if state == "FAILED":
                print("phase8_caddy_boot_console_verify=FAIL reason=console_capture_failed")
                raise SystemExit(12)
            time.sleep(3)
        else:
            print(f"phase8_caddy_boot_console_verify=FAIL reason=console_capture_timeout state={state}")
            raise SystemExit(13)

        raw = content_bytes(client.get_console_history_content(history_id))
        text = raw.decode("utf-8", errors="replace")
        last_text = text

        markers = [line for line in text.splitlines() if "TESWA_PHASE8_CADDY_BOOT=" in line]
        if markers:
            print(f"boot_marker={markers[-1]}")
        else:
            print(f"boot_marker=not_yet_visible elapsed_seconds={elapsed}")

        pass_lines = [line for line in markers if "TESWA_PHASE8_CADDY_BOOT=PASS" in line]
        if pass_lines:
            print(pass_lines[-1])
            print("run_command_dependency=none")
            print("production_cutover=none")
            print("dns_change=none")
            print("phase8_caddy_boot_console_verify=PASS")
            raise SystemExit(0)

        fail_lines = [line for line in markers if "TESWA_PHASE8_CADDY_BOOT=FAIL" in line]
        if fail_lines:
            print(fail_lines[-1])
            print("phase8_caddy_boot_console_verify=FAIL reason=guest_bootstrap_failed")
            raise SystemExit(14)
    except SystemExit:
        raise
    except Exception as exc:
        print(f"phase8_caddy_boot_console_verify=FAIL reason=sdk_console_operation_failed detail={type(exc).__name__}:{str(exc)[:240]}")
        raise SystemExit(15)
    finally:
        if history_id:
            try:
                client.delete_console_history(history_id)
            except Exception:
                pass

    if elapsed >= max_wait_s:
        print("--- console_tail ---")
        tail = "\n".join(last_text.splitlines()[-80:])
        print("".join(ch for ch in tail if ch in "\n\r\t" or 32 <= ord(ch) <= 126))
        print("--- end_console_tail ---")
        print("phase8_caddy_boot_console_verify=FAIL reason=boot_marker_not_found_after_wait")
        raise SystemExit(16)

    time.sleep(poll_s)
    elapsed += poll_s
PY
