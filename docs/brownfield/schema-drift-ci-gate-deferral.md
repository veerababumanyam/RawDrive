# §5.4 schema drift CI gate — deferred with rationale

> **Status.** Unblocked (prerequisite §4.1 done in commit `4bde8c7`),
> **deferred** to its own task. Not landed in the brownfield fix wave
> because the work scope is materially larger than the other review
> findings and introduces new CI risk that deserves its own review.
> Recorded here so the deferral is visible to anyone scanning open
> brownfield items.
>
> **Origin.** `docs/brownfield/brownfield-fix-wave-review.md` §5.4 —
> "Schema refresh policy is aspirational, not CI-enforced."

## What the finding asks for

> Add a CI step (separate job or inside the existing `backend` job)
> that runs `refresh-schema.sh` against a migrated test database and
> `git diff --exit-code docs/db/schema.sql` — failing the job if the
> committed `schema.sql` is out of date.

The aspirational policy is in `scripts/refresh-schema.sh:86`:

```
Commit docs/db/schema.sql along with any migration that lands on main.
```

Today this is enforced by convention. §5.4 asks for mechanical
enforcement so a migration can't land on `main` without a matching
`schema.sql` refresh.

## Why the naive fix does not work

`scripts/refresh-schema.sh` is coupled to the local dev compose stack
in three places that break on GitHub Actions runners:

1. It resolves the postgres container by
   `docker compose -f _cobolt-docker/docker-compose.yml ps -q postgres`.
   GitHub Actions runners do not start a compose stack — postgres in
   CI is typically provided as a GitHub Actions `service`, reachable
   at `localhost:5432` without a container ID.
2. It runs `pg_dump` via `docker exec "$CONTAINER" pg_dump ...`. On a
   runner with a service postgres, `pg_dump` runs directly on the
   runner, not inside a container.
3. It does not apply migrations — it assumes the target postgres
   already has the current schema. In CI the service postgres starts
   empty, so the gate must run migrations first.

Reusing `refresh-schema.sh` verbatim in CI would fail at step 1. A
working gate needs either (a) a CI-specific variant of the script, or
(b) a Go-based migration runner invoked from the CI job directly.

## Proposed approach (for whoever picks this up)

Two viable paths. Pick one; do not mix.

### Path A — `cmd/schematool` (add a small Go tool)

1. Add `backend/cmd/schematool/main.go` (≤ 40 lines). Reads
   `DATABASE_URL` from the environment, constructs a
   `database.Migrator`, calls `Migrator.Up(ctx)`, exits. No HTTP
   server, no config file, no side effects beyond the migration apply.
2. Add a new CI job `schema-drift` to
   `.github/workflows/production-gates.yml`:
   - `services: postgres:16-alpine` with a password and the pgvector
     extension pre-installed (use `pgvector/pgvector:pg16` image).
   - Checkout + `setup-go`.
   - Export `DATABASE_URL=postgres://...@localhost:5432/...`.
   - `go run ./backend/cmd/schematool` — applies migrations.
   - `pg_dump --schema-only --no-owner --no-privileges | grep -v '^\\restrict ' | grep -v '^\\unrestrict ' > /tmp/schema.sql`
   - `diff -u docs/db/schema.sql /tmp/schema.sql`  (or
     `git --no-pager diff --exit-code --no-index ...`)
   - Exit 0 → schema is fresh; non-zero → schema.sql is out of date,
     print a remediation hint pointing at `scripts/refresh-schema.sh`.
3. Add the new job to `images.needs:` so a drift failure blocks
   container publishing (same posture as the `security` job).

Pros: minimal new code (Go tool is ~30 lines). Reuses the existing
`Migrator.Up` implementation — there is no chance of drift between
the CI gate's migration behavior and the real backend's.

Cons: one new binary in `cmd/` that has to stay in sync with the
`database` package. Acceptable — it's a test-mode consumer of an
already-stable internal API.

### Path B — `scripts/refresh-schema-ci.sh` (keep it in shell)

1. Write a sibling script that:
   - Does NOT touch `docker compose` or `docker exec`.
   - Expects `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
     in the environment.
   - Applies migrations by iterating `backend/internal/database/migrations/*.up.sql`
     in filename order and calling `psql "$DATABASE_URL" -f "$file"`.
   - Runs `pg_dump` directly and strips `\restrict` / `\unrestrict`
     lines the same way the main script does.
2. CI job mirrors Path A but substitutes
   `bash scripts/refresh-schema-ci.sh /tmp/schema.sql` for the
   `go run` step.

Pros: zero new Go code. Shell-only change.

Cons: the migration order is determined by glob-sorted filenames. If
the repo ever adopts a non-lexicographic migration ordering (it does
not today — all migrations are zero-padded numeric prefixes), the
shell script and the Go `Migrator` diverge. Lower confidence in
long-term parity than Path A.

## Recommendation

**Path A.** The code ceiling is lower, the parity guarantee is
tighter, and the same `cmd/schematool` can be repurposed for local
"reset my dev DB" ergonomics without any CI-specific flag surface.

## Why this is not landing in the brownfield fix wave

- The brownfield fix wave's charter is the review report findings
  plus the `platform_settings` warning correction plus the §4.5
  LICENSE consistency cleanup. Scope-creeping to a new CI job with
  a service dependency and a new `cmd/` binary would add materially
  different risk (CI flakiness, migration apply semantics in a
  clean-state DB, pgvector image pin selection) that wants its own
  review window.
- The §4.1 deterministic-output prerequisite is done. The *phantom
  diff* failure mode — the worst practical consequence of the
  current convention-only enforcement — is already solved. What's
  left is defense-in-depth against a developer silently shipping a
  migration without running `./scripts/refresh-schema.sh` locally.
  That is a real gap but a lower-urgency one.
- The fix is self-contained: no dependency on any other brownfield
  item, no interaction with ISSUE-001 rotation, no test reshuffle.
  It can be landed any time without coordinating with the rest of
  the fix wave.

## When to unpin this

Unblock criteria for whoever picks this up:

1. No higher-priority brownfield item is in flight (check
   `docs/brownfield/` + `git log --oneline brownfield/` at the time
   of pickup).
2. There is at least one in-flight migration that would give the
   gate something real to catch on the first run — otherwise the
   baseline diff will be trivially empty and the gate's real
   behavior is unverified until the next migration lands.
3. The pgvector image pin is decided — the current compose stack
   uses `pgvector/pgvector:pg16`, so the CI service should pin the
   same tag to avoid a subtle extension-version drift.

Close this file by deleting it after the gate lands and links to
the implementing commit.
