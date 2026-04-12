# Rolling Deployment Runbook

**When to use:** Shipping new application code to production without downtime.

**Pattern:** Deploy to `.42` first, verify healthy, deploy to `.44`, verify
healthy. At any moment during the deploy, one node is always serving traffic;
the other node's nginx peer-backup upstream covers the gap.

**Windows operator rule:** use the PowerShell wrapper so the deploy always runs
under Git Bash, not WSL/System32 bash:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod.ps1
```

The wrapper accepts `-SkipPush`, `-NoCache`, and `-Pull`. Normal deploys should
not use `-NoCache`; keep Docker cache enabled so dependency layers are reused.

## Procedure

### 1. Local Pre-Flight

```bash
# Run backend tests
cd backend && go test ./... -count=1 -timeout 120s

# Run frontend tests + lint + production build
cd frontend && pnpm test && pnpm lint && pnpm build
```

Do not proceed if anything fails.

### 2. Preferred Full Rolling Deploy

```powershell
powershell -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod.ps1
```

The script:

1. Tars source while excluding local-only/runtime artifacts (`node_modules`,
   `.git`, `.next`, `.env*`, agent caches, test reports, e2e/test folders, and
   `_cobolt-output`).
2. Pipes the release source to each app node.
3. Runs `docker compose build` with cache enabled by default.
4. Runs `docker compose up -d` (respects `depends_on` ordering: pgbouncer ->
   migrate one-shot -> backend -> frontend -> nginx).
5. Verifies `http://127.0.0.1:8080/health` on each node before continuing.

Use `-Pull` when you intentionally want newer pinned-base-image metadata. Use
`-NoCache` only when a corrupted Docker cache is suspected.

### 3. Manual Deploy To .42

```bash
./deploy/scripts/deploy-app.sh 187.127.142.42
```

The script:

1. Tars source while excluding local-only/runtime artifacts.
2. Pipes to `tar -xf` on `.42`.
3. Runs `docker compose build` with cache enabled by default.
4. Runs `docker compose up -d`.
5. Verifies `http://127.0.0.1:8080/health` returns 2xx.

If the healthcheck fails, `.42` is unhealthy but `.44` continues serving traffic
via its local containers. Fix forward: inspect `docker logs deploy-backend-1`,
fix, re-run deploy.

### 4. Smoke Test .42

```bash
curl -fsS --resolve rawdrive.in:443:187.127.142.42 https://rawdrive.in/
curl -fsS --resolve api.rawdrive.in:443:187.127.142.42 https://api.rawdrive.in/health
```

Both must return 2xx. If not, stop and investigate before touching `.44`.

### 5. Deploy To .44

```bash
./deploy/scripts/deploy-app.sh 187.127.142.44
```

During this step, `.42` has the new code and `.44` is being redeployed.
Cloudflare DNS round-robins both IPs; requests hitting `.44` during redeploy may
get 502 from old upstream briefly. That is acceptable for short deploy windows.

### 6. Smoke Test .44

```bash
curl -fsS --resolve rawdrive.in:443:187.127.142.44 https://rawdrive.in/
curl -fsS --resolve api.rawdrive.in:443:187.127.142.44 https://api.rawdrive.in/health
```

### 7. Final End-To-End Test Via Public DNS

```bash
curl -fsS https://rawdrive.in/
curl -fsS https://api.rawdrive.in/health
```

## Migrations

The `migrate` one-shot Compose service runs before `backend` starts via
`depends_on: service_completed_successfully`. Schema migrations are idempotent
and tracked in `schema_migrations`; the migrator also uses `pg_advisory_lock` to
prevent concurrent migration runs across both app nodes.

Destructive migrations (`DROP TABLE`, incompatible `ALTER COLUMN TYPE`, etc.)
are not handled by the rolling deploy pattern. If you ship one:

1. Schedule a maintenance window.
2. Deploy to `.42`, let migrate run, verify healthy.
3. Immediately deploy to `.44`.
4. Or pre-deploy a backwards-compatible shim, migrate, then deploy the code that
   removes the shim.

## Rollback

Rolling forward is almost always better than rolling back. If you must roll
back:

```bash
git log --oneline -10
git checkout <OLD_COMMIT>
./deploy/scripts/deploy-app.sh 187.127.142.42
./deploy/scripts/deploy-app.sh 187.127.142.44
```

Database migrations are not automatically rolled back. If the new deploy applied
a destructive migration, rolling back code alone leaves the database in the new
state and the old code can fail. In that case, restore from the nightly R2
backup and replay non-destructive writes.

## Performance Notes

Current production deploys still push source and build locally on both app
nodes. The scripts now preserve Docker cache for normal deploys and keep
non-production artifacts out of the tar stream.

The next architecture step is registry-based deployment: build backend/frontend
images once in CI, tag them with the git SHA, push to a registry, then have each
node run `docker compose pull && docker compose up -d`. That requires registry
credentials and image names in production env/config before it can replace
source-push deploys.
