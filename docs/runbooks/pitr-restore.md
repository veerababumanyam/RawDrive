# PITR & pgBackRest Operations Runbook

**Subsystem:** Continuous WAL archiving + incremental physical backups + Point-In-Time-Recovery, on the `.46` Postgres 17 primary, with the repository on Backblaze B2 (S3-compatible API).

**Why this exists:** Before this subsystem, RawDrive's only backup was the nightly logical `pg_dump` (`deploy/scripts/backup-db.sh`), giving an **RPO of up to 24 hours** — everything written between the 02:00 IST dump and a failure was permanently lost (see "Write loss accounting" in [`disaster-recovery-from-r2.md`](./disaster-recovery-from-r2.md)). pgBackRest closes that gap: continuous WAL archiving brings the achievable RPO down to **≈60 seconds** (`archive_timeout`-bounded) and lets us recover to *any* point in time, not just the last nightly snapshot.

**Relationship to existing DR docs:**
- [`disaster-recovery-from-r2.md`](./disaster-recovery-from-r2.md) — full-rebuild-from-the-nightly-logical-dump (title says "R2" but storage is **B2** now). That is the **logical** restore path and remains the belt-and-suspenders secondary. See §(f) below for how the two layers compose.
- [`postgres-failover.md`](./postgres-failover.md) — promoting the `.44` streaming standby when the primary dies. PITR is the *third* leg: standby = seconds-RPO HA failover; pgBackRest = arbitrary-point recovery + offsite copy; nightly pg_dump = logical safety net.

> **EVERYTHING in this subsystem is INERT until the deliberate activation in §(a).** `archive_mode` ships **off**; no WAL is archived and no pgBackRest command runs until an operator performs the cutover. A half-deployed PITR pipeline never silently changes primary behaviour.

---

## (a) ACTIVATION — enabling archiving (one-time cutover)

Do this during a low-traffic window. It requires a **Postgres restart** (`archive_mode` is not reloadable).

### Step 1 — Provision the dedicated backup bucket & credentials

PITR backups live in a **separate B2 bucket** (`rawdriveadminfiles`) from the media bucket (`rawdriveclientfiles`), so a media-bucket compromise can't reach the backups, and under a separate repo path (`/pgbackrest`).

In the B2 console create (or reuse) the `rawdriveadminfiles` bucket and an application key scoped to it, then add these to **`/opt/rawdrive/app/.env` on `.46` only** (see §(c) of `.env.example` additions):

```
PGBACKREST_REPO1_S3_KEY=<B2 S3 keyID for the backup bucket>
PGBACKREST_REPO1_S3_KEY_SECRET=<B2 S3 applicationKey for the backup bucket>
PGBACKREST_REPO1_CIPHER_PASS=<openssl rand -hex 32>   # repo encryption — STASH IN PASSWORD MANAGER
```

> **Losing `PGBACKREST_REPO1_CIPHER_PASS` makes every physical backup unrecoverable** — exactly like `BACKUP_GPG_PASSPHRASE`. Store a copy off-box immediately.

Confirm the `repo1-s3-endpoint` / `repo1-s3-region` / `repo1-s3-bucket` in `deploy/pgbackrest/pgbackrest.conf` match your actual B2 values before continuing.

### Step 2 — Build the pgBackRest-enabled Postgres image

The stock `pgvector/pgvector:pg17` has no pgBackRest. Apply the compose change in deliverable **B** (build the local image, mount the config, add the spool/log volumes + `PGBACKREST_*` passthrough), then:

```bash
ssh root@187.127.142.46 'cd /opt/rawdrive/app && docker compose -f deploy/docker-compose.prod-db.yml build postgres'
```

### Step 3 — Turn on archiving in postgresql.conf and RESTART

Append the archiving block from deliverable **A** to `deploy/postgres/postgresql.conf`, push it to `.46`, then recreate the container (a restart, not a reload — `archive_mode` needs a fresh start, and we're also swapping to the new image):

```bash
ssh root@187.127.142.46 'cd /opt/rawdrive/app && docker compose -f deploy/docker-compose.prod-db.yml up -d postgres'
# Confirm archiving is armed (NOT yet that segments are landing):
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SHOW archive_mode; SHOW archive_command;"'
# Expected: archive_mode = on; archive_command = pgbackrest ... archive-push %p
```

### Step 4 — Create the stanza and verify the archive chain

```bash
ssh root@187.127.142.46 '/opt/rawdrive/app/deploy/scripts/pgbackrest-init.sh'
```

This runs `stanza-create` then `check` (which forces a WAL switch and confirms the segment reaches B2). A green `check` is your proof that `archive_command` actually works end-to-end.

### Step 5 — Take the first full backup

```bash
ssh root@187.127.142.46 '/opt/rawdrive/app/deploy/scripts/pgbackrest-backup.sh --type=full'
```

### Step 6 — Install the cron schedule

Install on `.46` (`crontab -e` as root). Set `MAILTO` so failures page the on-call:

```cron
MAILTO=ops@rawdrive.in
# Existing nightly LOGICAL dump (belt-and-suspenders secondary) stays as-is:
0  2 * * *  /opt/rawdrive/app/deploy/scripts/backup-db.sh           >> /opt/rawdrive/backups/backup-cron.log 2>&1
# Globals (roles/grants) for the logical restore path — pair with the dump:
5  2 * * *  /opt/rawdrive/app/deploy/scripts/pg-globals-backup.sh   >> /opt/rawdrive/backups/globals-cron.log 2>&1
# PHYSICAL full (Sun) / diff (Mon–Sat), offset 30m from the logical dump:
30 2 * * *  /opt/rawdrive/app/deploy/scripts/pgbackrest-backup.sh             >> /opt/rawdrive/backups/pgbackrest-cron.log 2>&1
# Hourly INCREMENTAL, every hour except 02:00 (the daily run owns it):
15 0-1,3-23 * * *  /opt/rawdrive/app/deploy/scripts/pgbackrest-backup.sh --type=incr >> /opt/rawdrive/backups/pgbackrest-cron.log 2>&1
# Weekly restore DRILL (proves backups are restorable), Mon 04:00 IST:
0  4 * * 1  /opt/rawdrive/app/deploy/scripts/pgbackrest-restore-verify.sh     >> /opt/rawdrive/backups/pgbackrest-restore-verify.log 2>&1
```

Activation complete. WAL is now continuously archived and physical backups roll automatically.

---

## (b) Monitoring

### Backup set & WAL archive health

```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 pgbackrest --stanza=rawdrive info'
```
Read: the list of `full`/`diff`/`incr` backups with timestamps + sizes, and the `wal archive min/max` range. A growing gap between "now" and the newest backup, or a stalled `wal archive max`, means archiving has broken.

### archive_command success/failure (the canonical signal)

```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -x -c \
  "SELECT archived_count, last_archived_wal, last_archived_time, failed_count, last_failed_wal, last_failed_time FROM pg_stat_archiver;"'
```
- `failed_count` climbing or `last_failed_time` recent → `archive_command` is erroring (B2 down, bad creds, repo full). Because we run `archive-async=y`, transient failures retry from the spool without blocking writes — but a *persistent* failure will eventually fill the spool and then back-pressure the primary. Treat any sustained `failed_count` growth as a page.
- Inspect the async spool depth and pgBackRest's own log:
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 sh -c "ls -1 /var/spool/pgbackrest/archive/rawdrive/out 2>/dev/null | wc -l; tail -n 50 /var/log/pgbackrest/rawdrive-archive-push-async.log"'
```

### Replication lag (the .44 standby — orthogonal but watch together)

```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -x -c \
  "SELECT application_name, state, write_lag, flush_lag, replay_lag FROM pg_stat_replication;"'
```

### Weekly restore-drill result

The cron in §(a) Step 6 runs `pgbackrest-restore-verify.sh`; check `/opt/rawdrive/backups/pgbackrest-restore-verify.log` for a trailing `restore-verify PASSED`. A `FAILED` there is a **sev-2**: backups exist but may not restore.

---

## (c) PITR restore to a timestamp or LSN

Use when you must recover the cluster to a **specific moment** (e.g. just before a bad migration or an accidental mass-delete) rather than the latest state. This is destructive to the target cluster's current data dir — do it on a replacement/throwaway primary, or after stopping the live one.

### 1. Stop the target Postgres and clear (or delta over) its data dir

```bash
ssh root@<TARGET_IP> 'cd /opt/rawdrive/app && docker compose -f deploy/docker-compose.prod-db.yml stop postgres'
```

### 2. Restore with a recovery target

`--delta` only fetches blocks that differ from what's on disk (fast when restoring over an existing datadir); drop it for a clean/empty datadir. Pick **one** target form:

**To a timestamp** (IST; pgBackRest passes it straight into `recovery_target_time`):
```bash
ssh root@<TARGET_IP> 'docker exec deploy-postgres-1 pgbackrest --stanza=rawdrive \
  --type=time "--target=2026-06-04 14:30:00+05:30" --delta --target-action=promote restore'
```

**To an LSN** (e.g. recovered from logs / `pg_waldump`):
```bash
ssh root@<TARGET_IP> 'docker exec deploy-postgres-1 pgbackrest --stanza=rawdrive \
  --type=lsn "--target=0/1A2B3C4D" --delta --target-action=promote restore'
```

pgBackRest writes `restore_command` + the recovery target into `postgresql.auto.conf` and creates `recovery.signal`. `--target-action=promote` makes the cluster come up read/write once it reaches the target (instead of pausing).

> **Pick the earliest restore point that contains a backup ≤ the target time.** `pgbackrest info` shows each backup's timestamp; recovery replays WAL forward from the chosen base backup to the target, so the target must be *after* the base backup.

### 3. Start and confirm it reached the target

```bash
ssh root@<TARGET_IP> 'cd /opt/rawdrive/app && docker compose -f deploy/docker-compose.prod-db.yml up -d postgres'
# Watch recovery converge, then confirm it's a live primary (not in recovery):
ssh root@<TARGET_IP> 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();"'
# Expected after promote: f
```

### 4. Re-point the app + rebuild the standby

Follow [`postgres-failover.md`](./postgres-failover.md) §3 to flip pgbouncer at the recovered primary, then rebuild the `.44` standby per §(d) below (a PITR rewind diverges the timeline, so the old standby MUST be rebuilt — do not let it re-attach).

---

## (d) Rebuild the .44 standby from pgBackRest

Far faster and lower-impact on the primary than `pg_basebackup` (it streams from B2, not from the live primary), and it's the supported path after any PITR/timeline change.

On `.44`, with the replica container stopped and its data dir empty:

```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app && docker compose -f deploy/docker-compose.prod-db.yml --profile postgres-replica stop postgres-replica'
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 pgbackrest --stanza=rawdrive --type=standby --delta restore'
```

`--type=standby` writes `standby.signal` + the `restore_command` so the node first replays archived WAL from B2, then connects to the primary and switches to streaming replication (using `primary_conninfo` from the replica's existing config). Start it and confirm it's streaming:

```bash
ssh root@187.127.142.44 'cd /opt/rawdrive/app && docker compose -f deploy/docker-compose.prod-db.yml --profile postgres-replica up -d postgres-replica'
ssh root@187.127.142.44 'docker exec deploy-postgres-replica-1 psql -U rawdrive -d rawdrive -c "SELECT pg_is_in_recovery();"'   # expect: t
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT application_name, state FROM pg_stat_replication;"'   # expect a streaming row
```

---

## (e) Retention & expire

Retention is declarative in `deploy/pgbackrest/pgbackrest.conf`: `repo1-retention-full=4` (keep 4 fulls ≈ 1 month at weekly cadence) and `repo1-retention-diff=14`. pgBackRest auto-expires when a backup runs, but you can force it:

```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 pgbackrest --stanza=rawdrive expire'
```

Expiring a full automatically removes the diffs/incrementals that depended on it and the WAL no longer needed to reach the oldest retained full. To change retention, edit the conf and the next backup/expire applies it. **B2 lifecycle rules should NOT independently delete objects under `/pgbackrest`** — let pgBackRest own that path's lifecycle, or you'll orphan a backup set mid-chain.

---

## (f) How this layers with the nightly logical pg_dump

Three independent layers, by design — each covers the others' failure modes:

| Layer | Tool | What it protects against | RPO | Restore path |
|---|---|---|---|---|
| **Streaming standby** (`.44`) | Postgres physical replication | Primary host/disk death | ≤5s (async lag) | `postgres-failover.md` |
| **Physical PITR** (this doc) | pgBackRest → B2 | Logical corruption, bad migration, ransomware, offsite loss; recover to any instant | **≈60s** (`archive_timeout`) | §(c) |
| **Logical dump** (nightly) | `pg_dump` + `pg-globals-backup.sh` → B2 | pgBackRest repo corruption, catalog/version-mismatch, cross-version/portable restore | ≤24h | `disaster-recovery-from-r2.md` |

**Why keep the logical dump after adding PITR:** a physical backup is byte-tied to the Postgres major version and the exact storage format; if the pgBackRest repo itself is corrupt or you must restore onto a different major version, the logical `pg_dump` + `pg_dumpall --globals-only` is the version-portable fallback. They fail for *different* reasons, so we keep both. The physical layer is now PRIMARY for routine recovery (tighter RPO, faster delta restore); the logical layer is the last-resort secondary.

---

## (g) RTO / RPO targets (updated)

| Scenario | Before PITR | After PITR |
|---|---|---|
| **RPO (primary loss, fail to standby)** | ≤5s | ≤5s (unchanged — async replication) |
| **RPO (both primary+standby lost, restore offsite)** | **≤24h** (last nightly dump) | **≈60s** (`archive_timeout` — last archived WAL) |
| **RTO (PITR to a point-in-time on a replacement node)** | N/A (not possible) | ~20–45 min (download from B2 + delta restore + WAL replay; scales with DB size & target distance) |
| **RTO (logical full rebuild)** | 30–60 min | 30–60 min (unchanged — secondary path) |

`archive_timeout=60s` (deliverable A) forces a WAL segment switch at least once a minute even on a quiet cluster, which is what bounds the offsite RPO to ~60s. Tighten it (at the cost of more, smaller WAL segments shipped to B2) only if a sub-minute RPO is contractually required.

---

## Cross-references

- [`disaster-recovery-from-r2.md`](./disaster-recovery-from-r2.md) — logical full-rebuild from the nightly B2 dump (the secondary path).
- [`postgres-failover.md`](./postgres-failover.md) — promoting the `.44` standby (the HA path) + the pgbouncer flip.
- `deploy/pgbackrest/pgbackrest.conf` — repo/stanza config (no secrets; env-driven).
- `deploy/postgres/Dockerfile` — the pgBackRest-enabled Postgres image.
- `deploy/scripts/pgbackrest-init.sh` / `pgbackrest-backup.sh` / `pgbackrest-restore-verify.sh` / `pg-globals-backup.sh`.
