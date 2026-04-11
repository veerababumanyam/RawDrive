# Known Issues from Production Bootstrap (2026-04-11)

## 🚨 P0 — R2 backup credentials are DEAD

**Symptom:** `rclone lsf r2:rawdrive` returns `401 Unauthorized`. boto3 `list_objects_v2` returns the same.

**Tested during:** Phase B Task B.6 (Configure rclone for R2).

**Tested with:** Both the bucket-scoped `rclone` config and a direct `python3 -c "import boto3; ..."` call with SigV4 signing. Both fail identically. Curl to the endpoint root returns 400 Bad Request which confirms network connectivity is fine — the issue is the credentials themselves.

**Credentials used (from `HostingerServerDetails.md` §Cloudflare R2 S3 Credentials):**
- Access Key ID: `4ca4360fd0e7125714183681de63dcb6`
- Secret Access Key: `94c9f722d05e4b5ac0b1cf9b25e4631b13f18560a02d61b0bb819a8dcb312e2c`
- Endpoint: `https://1b62424aa3b6d960f5c0d2588eb576f5.r2.cloudflarestorage.com`
- Bucket: `rawdrive`

**Likely cause:** API token rotated / revoked since the doc was written (2026-04-02).

**Impact on bootstrap:**
- Nightly backup cron (`0 2 * * *` on `.46` → `/opt/rawdrive/backup-db.sh`) will fail every night and email root with the failure. The local `pg_dump` step succeeds — only the R2 upload fails. Local dumps accumulate under `/opt/rawdrive/backups/` for 7 days then get pruned by the script.
- The restore rehearsal (Phase B Task B.9) was skipped because there's no backup in R2 to restore from.
- The app nodes' `.env` `R2_*` variables point at dead credentials too — backend R2 operations (photo uploads, presigned URLs) WILL ALSO FAIL at runtime until rotated.

**What to do next (when you return to this):**

1. **Log into Cloudflare dashboard** → R2 → Manage R2 API Tokens.
2. **Create a new R2 Token** with scope `Admin Read & Write` on buckets `rawdrive` + `rawdrive-backups`. Do not reuse the old token; revoke it.
3. **Update `/opt/rawdrive/app/.env` on all three VPSes** with the new `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Use:
   ```bash
   ssh root@187.127.142.42 "sed -i 's|R2_ACCESS_KEY_ID=.*|R2_ACCESS_KEY_ID=<NEW>|' /opt/rawdrive/app/.env"
   # Same for .44 and .46
   ```
4. **Update `/root/.config/rclone/rclone.conf` on `.46`** with the new `access_key_id` and `secret_access_key` fields.
5. **Restart backend containers on `.42` and `.44`** to pick up the new env:
   ```bash
   ssh root@187.127.142.42 "cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml restart backend"
   ssh root@187.127.142.44 "cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml restart backend"
   ```
6. **Run a manual backup + verify R2 upload:**
   ```bash
   ssh root@187.127.142.46 "set -a; source /opt/rawdrive/app/.env; set +a; /opt/rawdrive/backup-db.sh"
   ssh root@187.127.142.46 "rclone lsf r2:rawdrive-backups/daily/"
   ```
7. **Run the restore rehearsal** (see Phase B Task B.9 in the plan for the exact commands).
8. **Also rotate the Cloudflare API Token** while you're there (`cfat_REDACTED_ROTATE_IN_CLOUDFLARE`) — if the R2 creds were silently revoked, the CF zone token may also be compromised.

---

## Other deferred items from the bootstrap

- **SMTP + MoonShot credentials** are still as-shipped in `HostingerServerDetails.md`. These should also be rotated — same principle as R2. The bootstrap did not test SMTP egress or MoonShot API calls, so their validity is unknown.
- **SSH key passphrase.** `~/.ssh/id_ed25519` has no passphrase. Post-bootstrap follow-up: add one and load via `ssh-agent`.
- **Inter-VPS TLS.** Postgres / Valkey / NATS traffic between the three VPSes is plaintext behind UFW IP allowlisting. WireGuard mesh recommended for regulated-data workloads — see spec §12 S4.
- **Observability stack** not yet wired. `docker-compose.observability.yml.example` is in the repo; needs a Grafana Cloud / Datadog target to be deployed.
- **`HostingerServerDetails.md` git history purge** — file is gitignored as of Phase E but still lives in commit history. `git filter-repo` or BFG removal is a separate destructive operation that should be scheduled.
