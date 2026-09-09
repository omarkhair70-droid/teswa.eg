#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$ROOT/scripts/oci-migration/deploy-runtime-push-shadow-worker.sh"
CHECK="$ROOT/scripts/oci-migration/check-push-worker-post-rls-compat.sh"

[ -f "$DEPLOY" ] || { echo 'push_post_rls_repair=FAIL reason=deploy_operator_missing' >&2; exit 2; }
[ -f "$CHECK" ] || { echo 'push_post_rls_repair=FAIL reason=compat_operator_missing' >&2; exit 3; }

echo 'TESWA LANE 4 PUSH POST-RLS REPAIR + COMPAT'
echo 'scope=teswa_rehearsal_only'
echo 'outbound_push_enabled=false'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'repair_strategy=redeploy_owned_shadow_worker_then_recheck'

bash "$DEPLOY"
echo 'push_shadow_worker_repair=PASS'

bash "$CHECK"
echo 'push_post_rls_repair_and_check=PASS'
