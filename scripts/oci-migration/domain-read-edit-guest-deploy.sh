#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
STAGE="${1:?stage directory required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal
APP=/opt/teswa/domain-shadow
MARK=/etc/teswa/lane4-domain-shadow-owned

# Only extend the already-owned rehearsal service; never provision or switch production.
[ "$(hostname -s)" = core01 ] || { echo 'marketplace_edit_deploy=FAIL wrong_host'; exit 10; }
sudo -n true
sudo test -e "$MARK" || { echo 'marketplace_edit_deploy=FAIL unowned_service'; exit 11; }
systemctl is-active --quiet postgresql-17
for file in oracle_marketplace_edit.py runtime-marketplace-edit.sql domain-read-shadow-guest-deploy.sh; do
  [ -f "$STAGE/$file" ] || { echo "marketplace_edit_deploy=FAIL missing_$file"; exit 12; }
done
[ "$(sudo -u postgres "$P" -X -qAt -d "$DB" -c 'SELECT current_database()')" = "$DB" ] || exit 13
sudo test -d "$APP" || exit 14

# The editor function is SECURITY INVOKER and uses the existing authenticated RLS role.
# Install its module before the existing deploy starts the updated domain service.
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-marketplace-edit.sql"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_marketplace_edit.py" "$APP/oracle_marketplace_edit.py"
bash "$STAGE/domain-read-shadow-guest-deploy.sh" "$STAGE"
echo 'marketplace_edit_deploy=PASS production_traffic=false source_mutation=none'
