# ADR-0001: Connection-Scoped RLS Enforcement — execution plan

- **Status:** Proposed (execution plan). Supersedes the *"full enforcement DEFERRED"* status of
  [`docs/audits/2026-05-31-integration-audit/ADR-rls-backstop.md`](../audits/2026-05-31-integration-audit/ADR-rls-backstop.md).
- **Date:** 2026-06-04
- **Decision owner:** platform / data-plane
- **Supersedes:** the §4/§5 *"deferred refactor"* of the RLS backstop ADR — it left the
  connection-scoping **mechanism** unchosen. This ADR chooses it, and the choice is forced by a
  production constraint the backstop ADR did not have.

> **One-line decision:** Bind `app.workspace_id` with **`SET LOCAL` inside one explicit
> per-request transaction**, run every tenant-scoped repo query on that transaction's connection,
> connect the runtime as the non-owner `rawdrive_app` role, and turn on `FORCE ROW LEVEL SECURITY`
> **table-by-table** behind `RLS_ENFORCED`. Other mechanisms are not merely larger — under our
> production pooler they are **incorrect**.

---

## 1. Context (what is already true)

The backstop ADR established — and the code confirms — that DB-level tenant isolation is **inert
today** for two reasons: the app connects as the **table-owner** role (owners bypass RLS unless
`FORCE`d), and `middleware.PgDBContext.SetWorkspaceID` sets `app.workspace_id` with `set_config(..,
false)` (session-scoped) on **an arbitrary pooled connection**, not the one each repo query runs on
(`backend/internal/middleware/db_context.go`; the ~52 repos each hold a `*pgxpool.Pool` and acquire
a different connection per call). The RLS **policies already exist** (migrations `008`, `061`), the
non-owner `rawdrive_app` role already exists (used by `backend/internal/database/test_helpers.go`),
and the manual `FORCE`/un-`FORCE` ops SQL already exists (`backend/ops/rls/{enable,disable}_force_rls.sql`).
`config.RLSEnforced` (`RLS_ENFORCED`, default `false`) is an inert declared-intent flag.

So this is **not** a green-field RLS project. The only missing piece is the one the backstop ADR
deferred: **binding the GUC to the connection that runs the query**, correctly and leak-safely.

### 1.1 The new constraint that decides the mechanism

Production fronts Postgres with **pgbouncer in `pool_mode=transaction`**
(`deploy/pgbouncer/pgbouncer.ini`: `server_reset_query = DISCARD ALL`, `query_timeout = 30`, no
`ignore_startup_parameters`). This is the same constraint that forced PG session timeouts to ship as
a role-level `ALTER ROLE` migration rather than app-side `pgx` runtime params (migration `160`,
PR #51). It is **load-bearing here too**, and the backstop ADR's §4 options were written without it.

Under transaction-mode pooling:

- A pgbouncer **server connection is assigned per client transaction** and returned to the server
  pool at transaction end, where `DISCARD ALL` wipes all session state.
- Therefore a **session-level `SET`** (or `set_config(.., is_local=false)`) — including anything set
  in a `pgxpool` `BeforeAcquire` hook or a bare middleware `SET` — is **not reliably present on the
  server connection that runs the next statement**, and is wiped by `DISCARD ALL` regardless.
- A **`SET LOCAL` inside an explicit `BEGIN … COMMIT`** *is* correct: pgbouncer pins one server
  connection for the whole transaction, `SET LOCAL` is transaction-scoped, and it auto-resets at
  `COMMIT`/`ROLLBACK` — leak-safe by construction, and `DISCARD ALL` afterward is a harmless no-op.

This eliminates the backstop ADR's §4 "options 1/2/3" as a menu: **only the per-request transaction
+ `SET LOCAL` shape is correct under our pooler.** `BeforeAcquire`/`AfterRelease` stamping (§4 opt 2)
is **rejected** — it is a cross-tenant leak under transaction pooling, not just a "subtle" one.

---

## 2. Decision

Implement **connection-scoped RLS** as follows.

### 2.1 Mechanism — per-request transaction + `SET LOCAL`
A request that touches tenant data runs its DB work inside **one transaction** whose first statement
is `SET LOCAL app.workspace_id = $1` (and, for the few legitimately cross-tenant code paths,
`SET LOCAL app.bypass_rls = 'on'`). Every repo query in that request executes on that transaction's
connection. On `COMMIT`/`ROLLBACK` the GUC vanishes — no cross-request leakage is possible.

### 2.2 The repo seam — accept a `Querier`, not a `*pgxpool.Pool`
The ~52 repositories currently embed `*pgxpool.Pool` and call `pool.Query/QueryRow/Exec` directly.
Introduce a minimal interface they depend on instead:

```go
// repository.Querier is satisfied by *pgxpool.Pool, *pgxpool.Conn, and pgx.Tx.
type Querier interface {
    Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
    QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
    Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}
```

`*pgxpool.Pool` already satisfies this, so the refactor is **mechanical and non-behavioral** when
the pool is passed: repos keep working exactly as today. The new capability is that a repo can be
handed a **request-scoped `pgx.Tx`** instead. Two viable wiring styles (decide in Phase 2 spike):

- **(a) Request-scoped repo construction** — a per-request factory builds repos bound to the
  request's `pgx.Tx`. Cleanest isolation; touches handler wiring.
- **(b) Context-carried querier** — repos resolve their `Querier` from the request `context.Context`
  (tx when present, else pool). Smaller handler churn; one indirection. **Leaning (b)** because it
  lets the rollout proceed table-by-table without rewriting every handler at once.

### 2.3 Runtime role — connect as non-owner `rawdrive_app`
The application runtime `DATABASE_URL` connects as `rawdrive_app` (NOLOGIN→LOGIN, `NOBYPASSRLS`,
owns no tenant table — backstop ADR §5.1). **Migrations keep running as the owner role** (DDL needs
ownership). This makes RLS apply to the runtime even before `FORCE`, and makes `FORCE` meaningful.

### 2.4 Enforcement — `FORCE ROW LEVEL SECURITY`, table-by-table, flag-gated
`RLS_ENFORCED` becomes a **live switch**: when `true`, the middleware opens the per-request tx and
sets the GUC; when `false`, behavior is byte-for-byte today's (no tx wrapper, pool passed to repos).
`FORCE` is applied via the existing manual ops SQL **one table (or small group) at a time**, newest
/ lowest-risk surface first, with app-layer authz remaining the **primary** control throughout.

---

## 3. Consequences

**Positive.** A single missed app-layer `workspace_id` check stops being a cross-tenant breach — the
DB returns zero rows. Defense-in-depth that satisfies the S2-G1 force-multiplier finding. The
`Querier` seam also makes repos **unit-testable without a pool** (a win beyond RLS).

**Negative / costs.** (1) Every tenant request grows a `BEGIN/COMMIT` round-trip — measurable but
small; read-only requests can use a `READ ONLY` tx. (2) The `Querier` refactor touches ~52 repos
(mechanical). (3) Mis-scoping any tenant query (a repo that runs outside the request tx) silently
returns zero rows for that surface — **caught by staging verification, not users**, if the rollout is
incremental. (4) Cross-tenant workers/jobs must explicitly opt out via `SET LOCAL app.bypass_rls`.

**The failure mode to respect.** Turning on `FORCE` + non-owner role *before* the connection-scoping
middleware ships = **every query returns zero rows = total outage**. The phasing below makes that
impossible by ordering the switch (2.1/2.2) strictly before any `FORCE` (2.4), behind a default-off
flag, table-by-table, on staging first.

---

## 4. Phased execution plan (each phase is independently shippable + reversible)

| Phase | Work | Gate to advance | Reversible? |
|---|---|---|---|
| **P0 — Census** | Enumerate the ~52 repos + every tenant table from migrations 008/061; classify each table as workspace-scoped, FK-only, or global. Identify all legitimately cross-tenant readers (workers: download/thumbnail/AI/email/webhook/DSR; admin/platform surfaces; public share routes). Output: a tracked checklist. | Census reviewed; no table unclassified | n/a (doc) |
| **P1 — `Querier` seam** | Land the `repository.Querier` interface; change repos to depend on it **passing the pool** (zero behavior change). Add the context-carried-querier resolver (default = pool). Ship behind no flag — pure refactor, full suite green. | `go test ./... ` green; diff is non-behavioral (pool still used everywhere) | revert PR |
| **P2 — Request-tx middleware** | Add middleware that, **only when `RLS_ENFORCED=true`**, opens a per-request `pgx.Tx`, `SET LOCAL app.workspace_id`, puts the tx in context, and commits/rolls back at request end. Default-off → no runtime change. Spike wiring style 2.2(a) vs (b). | Default-off path byte-for-byte identical; `RLS_ENFORCED=true` integration test on testcontainer proves the GUC is present on repo queries | flag off |
| **P3 — Non-owner role (staging)** | Promote `rawdrive_app` to LOGIN; point **staging** `DATABASE_URL` at it; set staging `RLS_ENFORCED=true`. RLS is now live for the non-owner role (no `FORCE` yet). | Staging: every surface loads; the S2-G1 cross-tenant repro is denied at the DB; **zero "0 rows" regressions** in logs; worker bypass paths audited | revert env |
| **P4 — Cross-tenant probe** | Run the `security-authz-deep-reviewer` matrix (every endpoint × role with non-owner tokens) on staging; confirm own-tenant works and cross-tenant is empty/denied. Fix any surface that never opened the tx (shows as 0 rows). | Probe green; no surface silently empty | flag off |
| **P5 — `FORCE`, table-by-table (staging→prod)** | Apply `enable_force_rls.sql` **incrementally** (start with the newest/lowest-traffic tenant table, widen). Re-run P4 after each batch. Then promote the same sequence to prod with the non-owner `DATABASE_URL`. | Per-batch: P4 green + dashboards clean for a soak window | `disable_force_rls.sql` per table |
| **P6 — Decommission the pretense** | Once `FORCE` covers all classified tables in prod and has soaked: delete the now-misleading inert `PgDBContext.SetWorkspaceID` (random-conn) path, update the backstop ADR status to *Enforced*, and document the bypass contract for workers. | Prod soak clean ≥ 1 week | revert |

**Ordering invariant (non-negotiable):** no `FORCE` (P5) until the request-tx middleware (P2) **and**
the non-owner role (P3) are live and P4-green on staging. `FORCE` is never a numbered/embedded
migration (it would auto-apply on deploy and outage prod) — it stays manual ops SQL, exactly as the
backstop ADR mandates.

---

## 5. Verification & rollback

- **Verification is behavioral, not declarative.** Each phase's gate is a *run* (full suite, a
  `RLS_ENFORCED=true` testcontainer integration test asserting the GUC reaches repo queries, the
  cross-tenant authz probe, staging soak), never "the flag is set."
- **Rollback is always one step:** flip `RLS_ENFORCED=false` (P2–P4), revert the staging `DATABASE_URL`
  to the owner role (P3), or run `disable_force_rls.sql` for the affected table (P5). App-layer authz
  remains the primary control at every phase, so a rollback degrades to *today's* posture, never worse.
- **Worker bypass is explicit and audited (P0/P3):** every legitimately cross-tenant reader sets
  `SET LOCAL app.bypass_rls = 'on'` inside its own tx, or runs under a separate role — enumerated in
  P0, verified in P3, never implicit.

---

## 6. Alternatives considered

- **`BeforeAcquire`/`AfterRelease` GUC stamping (backstop ADR §4 opt 2).** *Rejected* — incorrect
  under pgbouncer transaction-mode (§1.1): the stamped session state is on the wrong server
  connection and/or wiped by `DISCARD ALL`; a missed reset is a cross-tenant leak.
- **Drop the RLS pretense + rely solely on app-layer checks.** A legitimate option (and the lower-risk
  fork offered during triage), but **not** what was chosen here — it forgoes the DB backstop the S2-G1
  finding calls for. If appetite for the ~52-repo refactor wanes, this remains the honest fallback:
  delete the inert scaffolding and audit every bare `GetByID/List*` for an ownership check.
- **`ALTER ROLE rawdrive_app SET app.workspace_id`** (role-default, like the timeout migration).
  *Rejected* — the value is **per-request**, not per-role; a role default cannot carry tenant identity.
  (Contrast migration 160, where the timeout values *are* role-global, which is why that mechanism fit.)

---

## 7. Effort & risk

- **Effort:** P1 (mechanical, ~52 repos) + P2 (one middleware + wiring spike) are the bulk; P0/P4/P5
  are disciplined ops/verification. This is a **multi-PR, multi-session** effort by design — not a
  single change. P1 alone is large enough to land and review on its own.
- **Risk:** HIGH if ordering is violated (outage); LOW if the phasing/flag/table-by-table discipline
  here is followed, because every step is default-off and reversible, and app-layer authz never stops
  being the primary control.

> **Next concrete step:** execute **P0 (census)** and land **P1 (the `Querier` seam, pool passed
> through, zero behavior change)** as the first PR. Nothing in P1 changes runtime behavior, so it is
> safe to ship immediately and unblocks everything after it.
