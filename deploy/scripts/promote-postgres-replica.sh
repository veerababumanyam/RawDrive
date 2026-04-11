#!/usr/bin/env bash
# Emergency: promote the .44 postgres replica to primary.
# Run on .44 after primary .46 is confirmed dead.
# Does NOT update pgbouncer — see docs/runbooks/postgres-failover.md
# for the full procedure including the pgbouncer databases.ini flip.

set -euo pipefail

echo "==> PRE-FLIGHT CHECKS"
docker exec deploy-postgres-replica-1 pg_isready -U rawdrive -d rawdrive \
    || { echo "FATAL: replica is not ready"; exit 1; }

echo "==> Current replication status (should show we are a standby):"
docker exec deploy-postgres-replica-1 \
    psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();" 2>&1

read -rp "Proceed with promotion? This is IRREVERSIBLE without rebuilding. [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."
    exit 1
fi

echo "==> Promoting replica"
docker exec deploy-postgres-replica-1 pg_ctl promote -D /var/lib/postgresql/data

echo "==> Verifying promotion"
sleep 3
docker exec deploy-postgres-replica-1 \
    psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();" 2>&1

echo "==> Promotion complete. NEXT STEPS:"
echo "  1. On .42: edit /opt/rawdrive/app/deploy/pgbouncer/databases.ini → host=187.127.142.44"
echo "  2. On .42: docker compose -f docker-compose.prod-app.yml restart pgbouncer"
echo "  3. On .44: edit /opt/rawdrive/app/deploy/pgbouncer/databases.ini → host=127.0.0.1"
echo "  4. On .44: docker compose -f docker-compose.prod-app.yml restart pgbouncer"
echo "  5. Verify writes work: curl https://api.rawdrive.in/api/v1/health/ready"
echo ""
echo "Full runbook: docs/runbooks/postgres-failover.md"
