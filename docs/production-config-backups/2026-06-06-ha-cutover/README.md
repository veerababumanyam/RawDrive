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
