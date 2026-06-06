#!/usr/bin/env bash
# Capture a redacted production HA config snapshot.
#
# This intentionally writes only sanitized configuration and runtime state:
# no live secret values, password hashes, TLS private keys, or provider creds.

set -euo pipefail

OUT_DIR="${1:-docs/production-config-backups/$(date -u +%Y-%m-%d-ha-cutover)}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/rawdrive_hostinger}"
KNOWN_HOSTS="${KNOWN_HOSTS:-deploy/known_hosts}"

NODES=(
  "42:187.127.142.42"
  "44:187.127.142.44"
  "46:187.127.142.46"
)

REMOTE_FILES=(
  /opt/rawdrive/app/deploy/docker-compose.patroni.yml
  /opt/rawdrive/app/deploy/docker-compose.prod-app.yml
  /opt/rawdrive/app/deploy/docker-compose.prod-db.yml
  /opt/rawdrive/app/deploy/etcd/etcd.conf.yml.template
  /opt/rawdrive/app/deploy/haproxy/haproxy.cfg
  /opt/rawdrive/app/deploy/patroni/patroni.yml.template
  /opt/rawdrive/app/deploy/pgbouncer/databases.ini
  /opt/rawdrive/app/deploy/pgbouncer/pgbouncer.ini
  /opt/rawdrive/app/deploy/pgbackrest/pgbackrest.conf
  /opt/rawdrive/app/deploy/nginx/templates/rawdrive.conf.template
  /opt/rawdrive/app/deploy/nginx/nginx.conf
  /opt/rawdrive/app/deploy/nginx/cloudflare-real-ip.conf
  /etc/patroni/patroni.yml
  /var/lib/postgresql/data/pg_hba.conf
  /var/lib/postgresql/data/pg_ident.conf
)

SANITIZE_PERL='s/(password|passwd|secret|key_secret|application_key|cipher_pass|token|access_key_id|secret_access_key|POSTGRES_PASSWORD|POSTGRES_REPLICATION_PASSWORD|PGBACKREST_REPO1_S3_KEY|PGBACKREST_REPO1_S3_KEY_SECRET|PGBACKREST_REPO1_CIPHER_PASS|B2_KEY_ID|B2_APPLICATION_KEY|VALKEY_PASSWORD|JWT_SECRET|SESSION_SECRET|SMTP_PASSWORD)([[:space:]]*[:=][[:space:]]*)[^[:space:]#]+/${1}${2}<REDACTED>/ig; s/\b[A-Fa-f0-9]{32,}\b/<REDACTED_HEX>/g; s/("[^"\n]*")[[:space:]]+"[^"\n]+"/${1} "<REDACTED_HASH>"/g'

ssh_node() {
  local host="$1"
  shift
  ssh -i "$SSH_KEY" \
    -o UserKnownHostsFile="$KNOWN_HOSTS" \
    -o StrictHostKeyChecking=yes \
    "root@$host" "$@"
}

sanitize() {
  perl -pe "$SANITIZE_PERL"
}

safe_name() {
  printf '%s' "$1" | sed 's#^/##; s#[/.]#_#g'
}

write_readme() {
  cat >"$OUT_DIR/README.md" <<'EOF'
# RawDrive Production HA Config Backup - 2026-06-06

Sanitized production configuration snapshot captured after the Patroni HA
cutover and C6 switchover drill.

This directory is intended to rebuild the production topology without copying
live secrets into git. Files that can contain secrets are redacted; restore
operators must source real secret values from the approved secret store/provider
dashboards and `/opt/rawdrive/app/.env` on the live hosts if still available.

Nodes:
- `187.127.142.42` - app node, etcd member, HAProxy, PgBouncer.
- `187.127.142.44` - app + DB node, etcd member, Patroni sync standby, HAProxy, PgBouncer.
- `187.127.142.46` - DB node, etcd member, Patroni leader, pgBackRest archive/check source.

Captured scope:
- Rendered service/topology state: Docker containers, listeners, networks, UFW, DOCKER-USER.
- HA state: Patroni list/show-config, HAProxy backend status, PgBouncer routing smoke test.
- Database/backup state: active `pg_hba.conf`, `pg_ident.conf`, pgBackRest info, restore-verify script config.
- Sanitized deploy config files and required `.env` key manifests.

Not captured:
- Secret values, password hashes, provider credentials, TLS private keys, B2 application keys, database role passwords.
- Full data backups. Use pgBackRest/B2 for physical restores and `pg-globals-backup.sh` output for roles/globals.
EOF
}

capture_runtime() {
  local label="$1"
  local host="$2"
  local out="$OUT_DIR/node-$label/runtime-snapshot.txt"

  {
    echo "# Node $label ($host) runtime snapshot"
    echo "captured_at_utc=$(date -u +%FT%TZ)"
    echo

    echo "## hostname"
    ssh_node "$host" 'hostname; date -u +%FT%TZ; uname -a' 2>/dev/null | sanitize
    echo

    echo "## docker ps"
    ssh_node "$host" 'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"' 2>/dev/null | sanitize
    echo

    echo "## listeners"
    ssh_node "$host" 'ss -ltnp | grep -E ":(80|443|3000|8080|5432|5433|6432|7000|8008|2379|2380|4222|6222|8222|6379)" || true' 2>/dev/null | sanitize
    echo

    echo "## ufw status numbered"
    ssh_node "$host" 'ufw status numbered' 2>/dev/null | sanitize
    echo

    echo "## iptables DOCKER-USER"
    ssh_node "$host" 'iptables -S DOCKER-USER' 2>/dev/null | sanitize
    echo

    echo "## docker networks"
    ssh_node "$host" 'docker network ls; for n in rawdrive-app_default rawdrive-app_rawdrive-network rawdrive-patroni rawdrive_default; do docker network inspect "$n" --format "{{.Name}} {{range .IPAM.Config}}{{.Subnet}} gateway={{.Gateway}}{{end}}" 2>/dev/null || true; done' 2>/dev/null | sanitize
    echo

    echo "## root crontab"
    ssh_node "$host" 'crontab -l 2>/dev/null || true' 2>/dev/null | sanitize
    echo

    echo "## systemd rawdrive units"
    ssh_node "$host" 'systemctl list-units --all "rawdrive*" --no-pager 2>/dev/null || true; systemctl list-timers --all --no-pager | grep -i rawdrive || true' 2>/dev/null | sanitize
  } >"$out"
}

capture_env_keys() {
  local label="$1"
  local host="$2"

  ssh_node "$host" \
    "if [ -f /opt/rawdrive/app/.env ]; then sed -n 's/^\\([A-Za-z_][A-Za-z0-9_]*\\)=.*/\\1=<REDACTED>/p' /opt/rawdrive/app/.env | sort; fi" \
    2>/dev/null >"$OUT_DIR/node-$label/env-key-manifest.env"
}

capture_remote_files() {
  local label="$1"
  local host="$2"
  local file name

  for file in "${REMOTE_FILES[@]}"; do
    name="$(safe_name "$file")"
    ssh_node "$host" "if [ -f '$file' ]; then sed -n '1,320p' '$file'; fi" 2>/dev/null \
      | sanitize >"$OUT_DIR/node-$label/${name}.txt" || true
    if [ ! -s "$OUT_DIR/node-$label/${name}.txt" ]; then
      rm -f "$OUT_DIR/node-$label/${name}.txt"
    fi
  done
}

capture_container_files() {
  local label="$1"
  local host="$2"
  local out="$OUT_DIR/node-$label"

  ssh_node "$host" 'docker ps --format "{{.Names}}" | grep -qx deploy-patroni-1' >/dev/null 2>&1 && {
    ssh_node "$host" 'docker exec deploy-patroni-1 sh -lc "sed -n '\''1,360p'\'' /etc/patroni/patroni.yml"' 2>/dev/null \
      | sanitize >"$out/container_deploy-patroni-1_etc_patroni_patroni_yml.txt" || true
    ssh_node "$host" 'docker exec deploy-patroni-1 sh -lc '"'"'sed -n "1,220p" "$(printenv PGDATA)/pg_hba.conf"'"'" 2>/dev/null \
      | sanitize >"$out/container_deploy-patroni-1_pgdata_pg_hba_conf.txt" || true
    ssh_node "$host" 'docker exec deploy-patroni-1 sh -lc '"'"'sed -n "1,120p" "$(printenv PGDATA)/pg_ident.conf"'"'" 2>/dev/null \
      | sanitize >"$out/container_deploy-patroni-1_pgdata_pg_ident_conf.txt" || true
  }

  ssh_node "$host" 'docker ps --format "{{.Names}}" | grep -qx deploy-haproxy-1' >/dev/null 2>&1 && {
    ssh_node "$host" 'docker exec deploy-haproxy-1 sh -lc "sed -n '\''1,260p'\'' /usr/local/etc/haproxy/haproxy.cfg"' 2>/dev/null \
      | sanitize >"$out/container_deploy-haproxy-1_usr_local_etc_haproxy_haproxy_cfg.txt" || true
  }

  ssh_node "$host" 'docker ps --format "{{.Names}}" | grep -qx deploy-pgbouncer-1' >/dev/null 2>&1 && {
    ssh_node "$host" 'docker exec deploy-pgbouncer-1 sh -lc "sed -n '\''1,220p'\'' /etc/pgbouncer/pgbouncer.ini"' 2>/dev/null \
      | sanitize >"$out/container_deploy-pgbouncer-1_etc_pgbouncer_pgbouncer_ini.txt" || true
    ssh_node "$host" 'docker exec deploy-pgbouncer-1 sh -lc "sed -n '\''1,80p'\'' /etc/pgbouncer/databases.ini"' 2>/dev/null \
      | sanitize >"$out/container_deploy-pgbouncer-1_etc_pgbouncer_databases_ini.txt" || true
  }

  ssh_node "$host" 'docker ps --format "{{.Names}}" | grep -qx deploy-nginx-1' >/dev/null 2>&1 && {
    ssh_node "$host" 'docker exec deploy-nginx-1 sh -lc "nginx -T 2>/dev/null | sed -n '\''1,360p'\''"' 2>/dev/null \
      | sanitize >"$out/container_deploy-nginx-1_nginx_T_head.txt" || true
  }

  find "$out" -type f -name 'container_*' -size 0 -delete
}

capture_shared_validation() {
  local out="$OUT_DIR/shared/ha-validation-snapshot.txt"
  local host

  {
    echo "# Shared HA Validation Snapshot"
    echo "captured_at_utc=$(date -u +%FT%TZ)"
    echo

    echo "## Patroni cluster list (.46)"
    ssh_node 187.127.142.46 'docker exec deploy-patroni-1 patronictl -c /etc/patroni/patroni.yml list' 2>/dev/null | sanitize
    echo

    echo "## Patroni DCS config (.46, sanitized)"
    ssh_node 187.127.142.46 'docker exec deploy-patroni-1 patronictl -c /etc/patroni/patroni.yml show-config' 2>/dev/null | sanitize
    echo

    echo "## pgBackRest info (.46)"
    ssh_node 187.127.142.46 'docker exec deploy-patroni-1 pgbackrest --stanza=rawdrive info' 2>/dev/null | sanitize
    echo

    echo "## HAProxy backend states"
    for host in 187.127.142.42 187.127.142.44; do
      echo "### $host"
      ssh_node "$host" 'curl -fsS "http://127.0.0.1:7000/;csv;norefresh" | awk -F, '"'"'$1 ~ /^pg_(primary|replica)_backend$/ && $2 ~ /^pg-/ {print $1, $2, $18, $37, $57}'"'" 2>/dev/null | sanitize
    done
    echo

    echo "## PgBouncer routing smoke"
    for host in 187.127.142.42 187.127.142.44; do
      echo "### $host"
      ssh_node "$host" 'docker exec deploy-pgbouncer-1 sh -lc '"'"'psql "$DATABASE_URL" -tAc "SELECT inet_server_addr(), pg_is_in_recovery()"'"'" 2>/dev/null | sanitize
    done
    echo

    echo "## API deep health via each app node local Nginx"
    for host in 187.127.142.42 187.127.142.44; do
      echo "### $host"
      ssh_node "$host" 'curl -kfsS --resolve api.rawdrive.in:443:127.0.0.1 https://api.rawdrive.in/health/deep' 2>/dev/null | sanitize
      echo
    done
    echo

    echo "## Fresh Patroni auth errors since 60s"
    for host in 187.127.142.46 187.127.142.44; do
      echo "### $host"
      ssh_node "$host" 'docker logs --since 60s deploy-patroni-1 2>&1 | grep -E "no pg_hba|password authentication failed|FATAL" || true' 2>/dev/null | sanitize
    done
  } >"$out"
}

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"/{node-42,node-44,node-46,shared}
write_readme

for node in "${NODES[@]}"; do
  label="${node%%:*}"
  host="${node#*:}"
  echo "capturing node-$label ($host)" >&2
  capture_runtime "$label" "$host"
  capture_env_keys "$label" "$host"
  capture_remote_files "$label" "$host"
  capture_container_files "$label" "$host"
done

echo "capturing shared validation" >&2
capture_shared_validation

find "$OUT_DIR" -maxdepth 3 -type f -print | sort
