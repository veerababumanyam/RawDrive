# =============================================================================
# RawDrive — Patroni-capable Postgres image (deploy/patroni/Dockerfile)
# =============================================================================
#
# ⚠️  PLANNED CUTOVER — INERT UNTIL DELIBERATELY ACTIVATED  ⚠️
#
# This image is part of the Patroni automatic-failover subsystem that REPLACES
# the current MANUAL Postgres failover (deploy/scripts/promote-postgres-replica.sh
# + a hand-edited deploy/pgbouncer/databases.ini flip). It is built and run ONLY
# during the maintenance-window cutover described in
# docs/runbooks/patroni-failover.md.
#
# Converting a live standalone primary (deploy-postgres-1 on .46) to Patroni
# control is NOT hot-swappable. Patroni takes ownership of the Postgres process
# lifecycle (start/stop/promote/reinit) and of postgresql.conf / pg_hba.conf —
# you cannot bolt it onto a running, manually-started container. The cutover
# needs a maintenance window. Until then, the manual model in
# docs/runbooks/postgres-failover.md remains in force and this image is unused.
#
# -----------------------------------------------------------------------------
# What this image is
# -----------------------------------------------------------------------------
# Patroni is a Python supervisor that runs *alongside* Postgres in the SAME
# container: it owns the data directory, writes postgresql.conf / pg_hba.conf,
# starts/stops postgres, runs leader election via etcd (the DCS), and exposes a
# REST API on :8008 that HAProxy health-checks to route the leader.
#
# We FROM the pgBackRest image produced by deploy/postgres/Dockerfile
# (= pgvector/pgvector:pg17 + pgbackrest, tagged `rawdrive-postgres:local`) so
# that:
#   • pgvector + Postgres 17 are identical to the standalone primary, and
#   • pgbackrest is already present, so Patroni can use it as a
#     create_replica_method (rebuild a standby from the PITR backup repo instead
#     of a full pg_basebackup over the wire) and as the archive_command.
#
# That base image is built by the parallel pgBackRest PITR work. We do NOT
# recreate deploy/postgres/Dockerfile or deploy/pgbackrest/pgbackrest.conf here —
# we depend on them.
#
# If `rawdrive-postgres:local` is not available at cutover time, fall back to the
# upstream base and add pgbackrest yourself — see the commented FROM block below.
# =============================================================================

# --- Primary path: build on top of the pgBackRest image (preferred) ----------
# `rawdrive-postgres:local` is produced by `docker build deploy/postgres` in the
# PITR pipeline. Pinned to the repo-local tag (NEVER :latest) exactly like every
# other image in deploy/docker-compose.prod-*.yml.
FROM rawdrive-postgres:local

# --- Fallback path (uncomment ONLY if rawdrive-postgres:local is unavailable) -
# The pinned pg17 digest-style tag matches the standalone primary so the data
# directory format is byte-compatible. pgbackrest from Debian bookworm matches
# the version deploy/pgbackrest/pgbackrest.conf was written against.
# FROM pgvector/pgvector:pg17
# RUN set -eux; \
#     apt-get update; \
#     apt-get install -y --no-install-recommends pgbackrest; \
#     rm -rf /var/lib/apt/lists/*

# Patroni runs as root inside the container only to install; it drops to the
# `postgres` user to manage the cluster (PATRONI runs postgres as that user).
USER root

# -----------------------------------------------------------------------------
# Install Patroni + its etcd3 driver and Postgres client lib.
#
# Pins (NEVER float — a floating Patroni could change failover semantics under
# you between deploys, exactly the supply-chain risk the pgbouncer comment in
# docker-compose.prod-app.yml calls out):
#   • patroni 4.0.4          — current stable; etcd3 (v3 gRPC-gateway API) extra
#   • python3-etcd3 deps come in via the [etcd3] extra (urllib3, etc.)
#   • psycopg2-binary 2.9.10 — Patroni's Postgres driver (binary wheel: no build
#                              toolchain needed in the final image)
#   • PyYAML 6.0.2           — config parsing (pinned to avoid a surprise major)
#
# We install via pip into a venv-free system location. The base is Debian
# (bookworm) under pgvector/pgvector:pg17, so python3 + pip are apt-provided and
# pinned to the distro. `--break-system-packages` is required on bookworm's
# PEP-668-marked interpreter; this image is single-purpose so that is safe.
# -----------------------------------------------------------------------------
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-setuptools \
        ca-certificates \
        gettext-base \
        curl; \
    pip3 install --no-cache-dir --break-system-packages \
        "patroni[etcd3]==4.0.4" \
        "psycopg2-binary==2.9.10" \
        "PyYAML==6.0.2"; \
    apt-get purge -y --auto-remove; \
    rm -rf /var/lib/apt/lists/*; \
    # Sanity check the install at build time so a broken pin fails the build,
    # not the 3 a.m. failover.
    patroni --version; \
    pgbackrest version

# Patroni renders its own postgresql.conf / pg_hba.conf into the PGDATA dir from
# patroni.yml; it does NOT read the standalone deploy/postgres/*.conf files. The
# tuning is mirrored into patroni.yml.template's bootstrap.dcs.postgresql.parameters
# instead (see that file). We still copy nothing here — config is bind-mounted at
# runtime by deploy/docker-compose.patroni.yml so it can be edited without a rebuild.

# Patroni is launched by the compose `command:` as the postgres user with the
# rendered /etc/patroni/patroni.yml. We do not set an ENTRYPOINT that would fight
# the upstream postgres entrypoint — the patroni compose service overrides
# entrypoint/command entirely (see deploy/docker-compose.patroni.yml).
#
# No HEALTHCHECK here — the compose file owns the healthcheck (GET /health on the
# Patroni REST API) so it can be tuned without an image rebuild, matching the
# house pattern in docker-compose.prod-*.yml.

# The compose entrypoint runs as the `postgres` user (USER below) and renders the
# config with `envsubst … > /etc/patroni/patroni.yml`. /etc/patroni is root-owned
# by default, so that write fails with EACCES and Patroni never starts. Pre-create
# it owned by postgres so the unprivileged entrypoint can render its config.
RUN mkdir -p /etc/patroni && chown -R postgres:postgres /etc/patroni

USER postgres
