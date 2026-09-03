#!/usr/bin/env bash
set -Eeuo pipefail

TF_VERSION="${TF_VERSION:-1.16.0}"
OS="linux"

case "$(uname -m)" in
  aarch64|arm64) ARCH="arm64" ;;
  x86_64|amd64) ARCH="amd64" ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

BASE="https://releases.hashicorp.com/terraform/${TF_VERSION}"
ZIP="terraform_${TF_VERSION}_${OS}_${ARCH}.zip"
SUMS="terraform_${TF_VERSION}_SHA256SUMS"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Downloading official HashiCorp Terraform ${TF_VERSION} for ${OS}_${ARCH}..."
curl -fsSL "${BASE}/${ZIP}" -o "${WORK}/${ZIP}"
curl -fsSL "${BASE}/${SUMS}" -o "${WORK}/${SUMS}"

(
  cd "$WORK"
  grep "  ${ZIP}$" "$SUMS" | sha256sum -c -
)

mkdir -p "$HOME/.local/bin"
unzip -qo "${WORK}/${ZIP}" -d "$HOME/.local/bin"

echo
"$HOME/.local/bin/terraform" version
echo
echo "terraform_bin=$HOME/.local/bin/terraform"
