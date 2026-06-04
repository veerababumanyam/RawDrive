# RawDrive production Postgres image — pgvector/pgvector:pg17 + pgBackRest.
# =========================================================================
# WHY a custom image at all:
#   The stock pgvector/pgvector:pg17 image gives us Postgres 17 + the pgvector
#   extension, but it has NO physical-backup / WAL-archive tooling. PITR
#   requires the SAME pgBackRest binary to live INSIDE the postgres container
#   for two reasons:
#     1. archive_command runs in the postgres backend's process space, so the
#        `pgbackrest archive-push` binary it shells out to must be on PATH in
#        THIS container — not on the host.
#     2. `pgbackrest backup`/`restore` read & write the live $PGDATA directory
#        and talk to the running cluster over the local socket, so they must
#        share the container's filesystem + Postgres version exactly.
#   We therefore bake a pinned pgBackRest into a thin layer on top of the base
#   image and keep the base image's default ENTRYPOINT/CMD untouched so
#   Postgres still boots normally (the compose `command:` override still wins).
#
# WHY PGDG and a pinned version:
#   Backups are a last line of defence; a silent pgBackRest upgrade could
#   change the on-repo format or CLI behaviour out from under our cron drivers
#   and restore runbooks. We install from the official PostgreSQL APT (PGDG)
#   repo — the same source PostgreSQL itself recommends — and PIN the exact
#   package revision so every rebuild is byte-reproducible. Bump this
#   deliberately (and re-run deploy/scripts/pgbackrest-restore-verify.sh after)
#   rather than floating to the newest release.
#
# WHY the base is Debian bookworm:
#   pgvector/pgvector:pg17 derives from the official `postgres:17-bookworm`
#   image, so we target the `pgdg12+1` (Debian 12 / bookworm) build of the
#   pgBackRest package below.
FROM pgvector/pgvector:pg17

# Pinned pgBackRest version from the PGDG bookworm pool
# (https://apt.postgresql.org/pub/repos/apt/pool/main/p/pgbackrest/).
# Bump this ONLY deliberately, then re-verify restores.
ARG PGBACKREST_VERSION=2.58.0-1.pgdg12+1

# Add the official PGDG apt repo, install the pinned pgBackRest, then strip the
# apt lists + the PGDG repo definition so the running image carries no extra
# package sources or cache. ca-certificates/gnupg/curl are pulled in only for
# the keyring step and removed again to keep the attack surface minimal.
#
# NOTE: pgBackRest creates its log dir (/var/log/pgbackrest) and async spool
# dir (/var/spool/pgbackrest) lazily, but we pre-create them with the postgres
# uid so a read-only-rootfs or fresh-volume start never trips on permissions.
# In compose these two paths are mounted as named volumes (see deliverable B).
RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg lsb-release; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        "pgbackrest=${PGBACKREST_VERSION}"; \
    # Confirm the binary is on PATH for archive_command to call.
    pgbackrest version; \
    # Pre-create runtime dirs owned by the postgres user (uid 999 in the base image).
    install -d -o postgres -g postgres -m 0750 /var/log/pgbackrest /var/spool/pgbackrest; \
    # Trim build-only deps and apt state to keep the image lean.
    DEBIAN_FRONTEND=noninteractive apt-get purge -y curl gnupg lsb-release; \
    DEBIAN_FRONTEND=noninteractive apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/* /etc/apt/sources.list.d/pgdg.list

# Deliberately NO ENTRYPOINT/CMD here: we inherit the base image's
# docker-entrypoint.sh + `postgres` CMD so the cluster still initialises and
# starts exactly as the stock image does. docker-compose.prod-db.yml further
# overrides `command:` to point at our mounted postgresql.conf/pg_hba.conf.
