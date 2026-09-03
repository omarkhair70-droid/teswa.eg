#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
KEY="${TESWA_CORE_BOOTSTRAP_SSH_PRIVATE_KEY:-$HOME/.ssh/teswa_core_bootstrap_rsa}"
OUT_PS1="${TESWA_PHASE4_CORE_VNC_PS1:-$HOME/teswa-core-vnc-tunnel.ps1}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$KEY" ] || {
  echo "vnc_prepare=FAIL reason=bootstrap_private_key_missing" >&2
  exit 2
}
chmod 600 "$KEY"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "vnc_prepare=FAIL reason=core_not_running" >&2
  exit 3
}

CONN_ID="$(oci compute instance-console-connection list   --compartment-id "$COMPARTMENT"   --instance-id "$CORE_ID"   --all   --query 'data[?("lifecycle-state"==`ACTIVE`)].id | [0]'   --raw-output)"

[ -n "$CONN_ID" ] && [ "$CONN_ID" != "null" ] && [ "$CONN_ID" != "None" ] || {
  echo "vnc_prepare=FAIL reason=no_active_console_connection" >&2
  exit 4
}

VNC="$(oci compute instance-console-connection get   --instance-console-connection-id "$CONN_ID"   --query 'data."vnc-connection-string"'   --raw-output)"

[ -n "$VNC" ] && [ "$VNC" != "null" ] && [ "$VNC" != "None" ] || {
  echo "vnc_prepare=FAIL reason=vnc_connection_string_missing" >&2
  exit 5
}

python3 - "$VNC" "$OUT_PS1" <<'PY'
import sys
raw,out=sys.argv[1:]

ps = r'''$ErrorActionPreference = "Stop"
$KeyPath = Join-Path $env:USERPROFILE "Downloads\teswa_core_bootstrap_rsa"

if (-not (Test-Path $KeyPath)) {
  throw "Missing private key: $KeyPath"
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "Windows OpenSSH client is not installed or not on PATH."
}

# Restrict the downloaded private key to the current Windows user.
& icacls $KeyPath /inheritance:r | Out-Null
& icacls $KeyPath /grant:r "$($env:USERNAME):(R)" | Out-Null

$Raw = @'
__RAW_VNC__
'@

$QuotedKey = '"' + $KeyPath + '"'
$Command = $Raw
foreach ($token in @(
  "private_SSH_key_path",
  "private_key_file",
  "<private_key_file>",
  "<private_SSH_key_path>",
  "public_SSH_key_path"
)) {
  $Command = $Command.Replace($token, $QuotedKey)
}

Write-Host "TESWA OCI VNC tunnel"
Write-Host "local_vnc=localhost:5900"
Write-Host "Press Ctrl+C here only after the VNC recovery is finished."
Invoke-Expression $Command
'''
ps=ps.replace("__RAW_VNC__", raw)
with open(out,"w",encoding="utf-8",newline="\r\n") as f:
    f.write(ps)
PY

chmod 600 "$OUT_PS1"

echo "TESWA PHASE 4 CORE VNC CONSOLE PREPARE"
echo "mutation=none"
echo "core_running=true"
echo "active_console_connection=true"
echo "vnc_connection_string_present=true"
echo "cloud_shell_private_key_download_path=.ssh/teswa_core_bootstrap_rsa"
echo "cloud_shell_powershell_download_file=$(basename "$OUT_PS1")"
echo "powershell_file_permissions=$(stat -c '%a' "$OUT_PS1")"
echo "local_vnc_target=localhost:5900"
echo "vnc_prepare=PASS"
echo "No OCI resource or guest OS state was changed."
