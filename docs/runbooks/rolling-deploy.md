# Rolling Deployment Runbook

**When to use:** Shipping new application code to production without downtime.

**Pattern:** Deploy to `.42` first → verify healthy → deploy to `.44` → verify healthy. At any moment during the deploy, one node is always serving traffic; the other's nginx peer-backup upstream covers the gap.

## Procedure

### 1. Local pre-flight

```bash
# Run backend tests
cd backend && go test ./... -count=1 -timeout 120s

# Run frontend tests + lint
cd frontend && pnpm test && pnpm lint
```

Do not proceed if anything fails.

### 2. Deploy to .42

```bash
./deploy/scripts/deploy-app.sh 187.127.142.42
```

The script:
1. Tars source (excluding `node_modules`, `.git`, `.next`, `deploy/.env`, `.env*`)
2. Pipes to `tar -xf` on `.42`
3. Runs `docker compose build --no-cache`
4. Runs `docker compose up -d` (respects `depends_on` ordering: pgbouncer → migrate one-shot → backend → frontend → nginx)
5. Verifies `http://127.0.0.1:8080/health` returns 2xx

If the healthcheck fails, `.42` is unhealthy but `.44` continues serving traffic via its local containers. Fix forward: inspect `docker logs deploy-backend-1`, fix, re-run deploy.

### 3. Smoke test .42

```bash
# Hit .42 directly via --resolve
curl -fsS --resolve rawdrive.in:443:187.127.142.42 https://rawdrive.in/
curl -fsS --resolve api.rawdrive.in:443:187.127.142.42 https://api.rawdrive.in/health
```

Both must return 2xx. If not, STOP and investigate before touching `.44`.

### 4. Deploy to .44

```bash
./deploy/scripts/deploy-app.sh 187.127.142.44
```

During this step, `.42` has the new code and `.44` is being redeployed. Cloudflare DNS round-robins both IPs — requests hitting `.44` during redeploy may get 502 from old upstream briefly. That's acceptable for ≤60s.

### 5. Smoke test .44

```bash
curl -fsS --resolve rawdrive.in:443:187.127.142.44 https://rawdrive.in/
curl -fsS --resolve api.rawdrive.in:443:187.127.142.44 https://api.rawdrive.in/health
```

### 6. Final end-to-end test via public DNS

```bash
curl -fsS https://rawdrive.in/
curl -fsS https://api.rawdrive.in/health
```

## Migrations

The `migrate` one-shot Compose service runs BEFORE `backend` starts via `depends_on: service_completed_successfully`. Schema migrations are idempotent (tracked in `schema_migrations` table via `pg_advisory_lock` to prevent concurrent runs across both app nodes).

**⚠️ Destructive migrations (DROP TABLE, ALTER COLUMN TYPE) are not handled by the rolling deploy pattern.** If you ship one:
1. Schedule a maintenance window
2. Deploy to `.42`, let migrate run, verify healthy
3. Immediately deploy to `.44` (if you leave `.44` on old code for long, its backend will hit column types that no longer exist)
4. Or: pre-deploy a backwards-compat shim, migrate, then deploy removing the shim

## Rollback

Rolling forward is almost always better than rolling back. If you must roll back:

```bash
# Check the commit you want to restore to
git log --oneline -10

# On your workstation
git checkout <OLD_COMMIT>
./deploy/scripts/deploy-app.sh 187.127.142.42
./deploy/scripts/deploy-app.sh 187.127.142.44
```

Database migrations are NOT automatically rolled back. If the new deploy applied a destructive migration, rolling back code alone leaves the database in the new state and the old code will fail. In that case: restore from the nightly R2 backup and replay non-destructive writes.
