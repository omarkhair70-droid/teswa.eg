#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo 'push_post_rls_v2_stage=bridge'
bash scripts/oci-migration/apply-push-worker-post-rls-bridge.sh

echo 'push_post_rls_v2_stage=worker_redeploy'
bash scripts/oci-migration/deploy-runtime-push-shadow-worker.sh

echo 'push_post_rls_v2_stage=compatibility_check'
bash scripts/oci-migration/check-push-worker-post-rls-compat.sh

echo 'push_post_rls_v2=PASS'
