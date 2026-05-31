# ADR: Database-Level RLS Backstop (audit S2-G1)

- **Status:** Accepted — scaffolding shipped; full enforcement DEFERRED (requires a connection-scoping refactor, out of scope for this session).
- **Date:** 2026-05-31
- **Audit finding:** S2-G1 (HIGH, force-multiplier)
- **Scope of this change:** non-breaking scaffolding + manual ops SQL + live-DB proof + this ADR/runbook. **No default runtime behavior changed.**

---

## 1. Context — the finding

Migrations `008_create_rls` and `061_rls_extension_f009` enable Row Level Security
(RLS) and define `*_isolation` policies on the tenant-scoped tables. Each policy is:

```sql
USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR workspace_id::text = current_setting('app.workspace_id', true)
)
```

**In production these policies are INERT — the database provides ZERO tenant
isolation today.** Two independent reasons:

1. **Owner bypass.** The API connects via `DATABASE_URL` as the role that OWNS
   the tables. In Postgres, a table owner (and any `BYPASSRLS`/superuser role)
   **bypasses RLS** unless the table is also set to `FORCE ROW LEVEL SECURITY`.
   No table in the schema is forced, and the only place that switches to the
   non-owner `rawdrive_app` role is the test harness
   (`internal/database/test_helpers.go`, and the streaming RLS tests). The
   production pool (`cmd/api/main.go` ~L1026–1037) opens the pool with no
   `AfterConnect`/`SET ROLE`, so every request runs as the bypassing owner role.

2. **The GUC is not bound to the query connection.** Even if we switched to a
   non-owner role, isolation would still not work as currently wired.
   `middleware.PgDBContext.SetWorkspaceID` (`internal/middleware/db_context.go`)
   does:

   ```go
   d.pool.Exec(ctx, "SELECT set_config('app.workspace_id', $1, false)", workspaceID)
   ```

   The third arg `false` means **session-scoped**, set on whatever connection
   `pool.Exec` happened to acquire — which is then returned to the pool. The
   64 repositories all hold `*pgxpool.Pool` directly (e.g. `AssetRepo{pool}`)
   and each `pool.Query/Exec` acquires an **arbitrary, different** pooled
   connection. So the GUC the middleware set is almost never present on the
   connection the repo query actually runs on. Worse, because it is
   session-scoped (`is_local=false`) on a pooled connection, the value can
   **leak across requests/tenants** if RLS ever did consult it.

Net effect: DB-level isolation is a no-op. **Isolation depends entirely on the
application-layer `workspace_id` checks** (hardened comprehensively by a
parallel effort). This ADR restores the DB-level *backstop* so a single missed
app-layer check is not a cross-tenant data breach.

---

## 2. Why this is GATED and NOT auto-applied

> **Activating RLS enforcement without a correct per-request GUC mechanism is a
> total outage.** Under `FORCE ROW LEVEL SECURITY` (or a non-owner role), every
> query returns **zero rows** unless `app.workspace_id` is set **on the same
> connection that runs the query**. Since the app does not yet bind the GUC to
> the repo query connection (reason 2 above), turning on enforcement today would
> make the entire application return no data.

Therefore:

- **No auto-applied migration.** A regular numbered migration under
  `backend/internal/database/migrations/` is **`//go:embed`-ed and run
  automatically by the production `Migrator.Up()` on every deploy**
  (`internal/database/database.go:16`). If FORCE RLS were a numbered migration,
  it would activate on the next prod deploy — before the role/GUC are in place —
  and break everything. **This is explicitly forbidden.**
- **FORCE RLS ships as a MANUAL ops file**, `backend/ops/rls/enable_force_rls.sql`,
  deliberately placed **outside** the embedded `migrations/` directory so the
  Migrator never picks it up. Ops applies it by hand as the **last** step of the
  staged rollout.
- **`RLS_ENFORCED` env flag** (read into `config.Config.RLSEnforced`, default
  `false`) is the operator's single declared-intent signal. It is **scaffolding,
  not a code switch** — the app does not branch on it yet, so setting it changes
  nothing and adds no per-query overhead. It exists so the rollout has one
  discoverable, default-off knob, and so a future enforcement path (the
  connection-scoping refactor) has a flag to gate on.

**Why app-layer checks remain the PRIMARY control:** RLS is a *backstop*, not a
replacement. The application's explicit `workspace_id` comparisons remain the
first line of defense because (a) they produce correct HTTP semantics (403 vs.
an empty result set), (b) they cover tables RLS does not (FK-only and
non-`workspace_id` tables — see §6), and (c) they work today without the
connection-scoping refactor. RLS exists to catch the *one* handler that forgets
the check.

---

## 3. What shipped in this change (non-breaking)

| Artifact | Purpose | Default effect |
| --- | --- | --- |
| `backend/ops/rls/enable_force_rls.sql` | Manual ops SQL: `FORCE ROW LEVEL SECURITY` on all 22 tenant tables from migrations 008 + 061. NOT embedded → never auto-applied. | None (never runs automatically) |
| `backend/ops/rls/disable_force_rls.sql` | Rollback: `NO FORCE ROW LEVEL SECURITY`. Leaves ENABLE + policies intact. | None |
| `config.Config.RLSEnforced` (+ `envBoolOrDefault`) | Operator declared-intent flag from `RLS_ENFORCED`. | `false`; app does not branch on it → byte-for-byte identical behavior |
| `internal/database/rls_backstop_integration_test.go` | Live-DB proof (testcontainer, skips without Docker): non-owner role denies cross-tenant + allows own; FORCE constrains a non-superuser owner. | Test only |

No production code path reads `RLSEnforced` and no schema object is forced by
default. `go build ./...`, `go vet`, and
`go test ./internal/middleware/ ./internal/database/... ./cmd/api/...` all pass
with default (unchanged) behavior.

---

## 4. Why FULL enforcement is deferred (the refactor that is OUT OF SCOPE)

Making enforcement actually correct requires **binding `app.workspace_id` to the
exact connection each repo query uses** — a connection-scoping refactor across
64 repositories. The leak-safe options, in increasing order of invasiveness:

1. **Per-request transaction with `SET LOCAL`.** Wrap each request's DB work in a
   tx, `SET LOCAL app.workspace_id = $1` at the top, run all repo calls on that
   tx. `SET LOCAL` is transaction-scoped and auto-resets on commit/rollback —
   leak-safe. Requires repos to accept a `pgx.Tx`/querier interface instead of
   holding `*pgxpool.Pool` directly. Largest blast radius; most correct.
2. **Pool `BeforeAcquire`/`AfterRelease` hooks.** Stamp the acquired connection
   with the request's workspace via `SET` in `BeforeAcquire` and `RESET ALL`
   (or `DISCARD ALL`) in `AfterRelease`. Needs a way to thread the request
   workspace into `BeforeAcquire` (e.g. a context-keyed value), and an
   absolutely reliable reset to prevent cross-request leakage. Smaller code
   change but subtle; a missed reset is a cross-tenant leak.
3. **A request-scoped `*pgxpool.Conn` checked out per request** and threaded to
   repos, with `SET LOCAL` inside a tx on that conn.

> **What we explicitly did NOT do:** a bare `SET` (session-scoped) on a pooled
> connection that persists across requests. That is the current (broken) shape
> and is a cross-tenant leak waiting to happen. The shipped scaffolding adds no
> such mechanism.

This refactor is the bulk of the remaining work and was deemed too large/risky
to land in the same session as the audit fix. It is the prerequisite for
flipping `RLS_ENFORCED` to a live switch.

---

## 5. Staged rollout runbook

> Do these **in order**. Do not skip the staging verification. Each prod step is
> reversible (see §5.6 Rollback).

### 5.1 — Create the dedicated non-owner login role
Migration 008 already creates `rawdrive_app` as `NOLOGIN` with table privileges
and `NOBYPASSRLS` (the default). Promote it to a login role and give it a
password (or keep it as a `SET ROLE` target). It must **own none** of the
tenant tables.

```sql
-- as a superuser / migration role
ALTER ROLE rawdrive_app LOGIN PASSWORD '<from-secrets-manager>';
-- verify it is NOT a superuser and does NOT bypass RLS:
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
  FROM pg_roles WHERE rolname = 'rawdrive_app';      -- expect f, f, t

-- verify it owns no tenant tables (expect zero rows):
SELECT c.relname FROM pg_class c
  JOIN pg_roles r ON r.oid = c.relowner
 WHERE r.rolname = 'rawdrive_app' AND c.relkind = 'r';

-- ensure privileges + future-table defaults are present (008 set these; re-affirm):
GRANT USAGE ON SCHEMA public TO rawdrive_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rawdrive_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rawdrive_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rawdrive_app;
```

Keep migrations running as the existing **owner/superuser** role (DDL needs
ownership). Only the *application runtime* points at `rawdrive_app`.

### 5.2 — Land the connection-scoping refactor (the §4 work)
This is the gating prerequisite. Ship the per-request GUC binding (option 1 or 2
in §4) behind `RLS_ENFORCED`. With `RLS_ENFORCED=false` (default) behavior is
unchanged; with `true` the app sets `app.workspace_id` (via `SET LOCAL` in a
per-request tx, or a `BeforeAcquire` stamp with guaranteed `AfterRelease` reset)
on the connection every repo query runs on. **Until this ships, do not proceed.**

### 5.3 — Point the app at the non-owner role (STAGING first)
Set staging `DATABASE_URL` to connect as `rawdrive_app` and set
`RLS_ENFORCED=true`. At this point RLS is ENABLED (008/061) and the non-owner
role is subject to it — but FORCE is not yet needed because `rawdrive_app` is a
non-owner.

### 5.4 — Verify in STAGING (hard gate)
- Every screen loads for the correct tenant (galleries, assets, orders,
  subscriptions, storage widget, admin surfaces).
- A user in workspace A cannot read/modify workspace B data via any endpoint
  (re-run the S2-G1 repro: cross-workspace gallery password overwrite must now
  return empty/denied at the DB layer even if an app check is missing).
- Background jobs / workers that legitimately need cross-tenant access set
  `app.bypass_rls = 'on'` explicitly (the policies honor it), or run as a
  separate role — audit each worker.
- No "0 rows" regressions in logs. Watch for endpoints that never set the GUC.

### 5.5 — Apply FORCE RLS (defense in depth)
Once staging is clean, apply the manual ops file to also constrain the owner
role (belt-and-suspenders against any code that still connects as owner):

```bash
psql "$DATABASE_URL_OWNER" -f backend/ops/rls/enable_force_rls.sql
# verify:
psql "$DATABASE_URL_OWNER" -c "SELECT relname, relrowsecurity, relforcerowsecurity \
  FROM pg_class WHERE relname IN ('assets','galleries','workspaces','api_keys') ORDER BY relname;"
# expect relforcerowsecurity = t
```

Re-run §5.4 verification. Then promote to **production**: 5.1 → 5.3 → 5.4 → 5.5
on prod, app1 then app2 per the rolling-deploy norm.

### 5.6 — Rollback (any step, fast)
Either action restores availability:
- **Revert `DATABASE_URL`** back to the owner role (owner bypasses RLS when NOT
  forced), and/or set `RLS_ENFORCED=false`.
- **Drop FORCE:** `psql "$DATABASE_URL_OWNER" -f backend/ops/rls/disable_force_rls.sql`.

For a true incident rollback do **both** (revert role *and* drop FORCE). The
down path leaves ENABLE + policies intact, so re-enabling is just re-running
`enable_force_rls.sql` — no migration churn.

---

## 6. Residual gaps (tracked, NOT closed here)

- **FK-only / non-`workspace_id` tables** are not covered by RLS at all:
  `burst_groups`, `download_events`, `duplicate_group_members`,
  `gallery_analytics_daily`, `gallery_carts`, `stream_chats` (per 061's own
  notes), and `gallery_access_log` (the table the S2-G1 repro abused — it has
  no RLS enablement in any migration). Covering these requires either
  denormalizing `workspace_id` onto the table or writing joined `USING` clauses
  that walk the FK to a parent. App-layer checks remain the sole control for
  these regardless of the backstop.
- **The connection-scoping refactor (§4)** — the real enabler of enforcement.
- **Worker/cron audit** — every non-request DB caller must be classified as
  either tenant-scoped (set the GUC) or legitimately cross-tenant (set
  `app.bypass_rls='on'` or use a dedicated role).
- **`PgDBContext.SetWorkspaceID`** should be removed or rewired as part of the
  refactor; in its current form (session-scoped `set_config` on an arbitrary
  pooled conn) it is dead-weight at best and a leak vector at worst once a
  non-owner role is in play.

---

## 7. Consequences

- **Positive:** A correct, tested, reversible path to a DB-level tenant-isolation
  backstop exists and is proven against a real Postgres. The default deploy path
  is provably unchanged (no auto-apply, flag default-off). The dangerous
  "set GUC on a random pooled connection" anti-pattern is documented and
  explicitly avoided in the scaffolding.
- **Negative / cost:** Full enforcement is not yet live; it waits on the
  connection-scoping refactor. App-layer checks remain load-bearing in the
  interim (acceptable — they were just hardened). FORCE RLS, once on, adds a
  small per-query policy-evaluation cost and makes "0 rows" a possible symptom of
  a missing-GUC bug rather than a data bug — operators must watch for it during
  rollout.
