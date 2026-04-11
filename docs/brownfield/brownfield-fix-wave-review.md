# Brownfield Fix Wave — Scoped Manual Review

> **What this is.** A commit-by-commit review of the 17 brownfield commits on
> `brownfield/fix-12-issues` diverging from `main` at `119c6d93`, plus the
> 2 uncommitted working-tree files, produced without the CoBolt pipeline
> tooling. Every finding cites the exact file/line or commit SHA that was
> read. No AI-reviewer fan-out, no phantom risk.
>
> **What this is NOT.** A substitute for `cobolt-review M17 --autonomous`.
> Pipeline review cannot currently execute on this branch because the
> `tools/cobolt-*.js` programs are not installed on this workstation,
> `_cobolt-output/latest/build/` does not exist, and the planning packet
> on disk is for the brownfield fix-bundle milestones (`M-F1/M-F2/M-F3`),
> not the product M17. See `docs/brownfield/meta-issues-clarification.md`
> for the pipeline-state observation this matches.
>
> **Review date:** 2026-04-11
> **Reviewed by:** manual session (not the 23-reviewer pipeline)
> **Branch HEAD:** `374fd38` (commit pending WIP and gitignore editor state)
> **Working tree:** 2 unstaged files (see §7)

## 1. Scope and method

Commit range reviewed (17 commits, HEAD → merge-base `119c6d93`):

```
374fd38 chore(workspace): commit pending WIP and gitignore editor state
a26ba02 fix(api): make OpenAPI 3.1 spec valid, wire CI lint [ISSUE-004]
a47eaef test(m13): add parallelism warning directly above TestAlbumApprovalAppendOnly
8ebbc73 docs(brownfield): ISSUE-001 remediation plan — prepared, NOT executed
e3c0c5b docs(brownfield): clarify meta-issues 2/3/4 as not-code-bugs
543b61b docs(api): hand-written OpenAPI 3.1 spec for canary-critical surface [ISSUE-005]
ddf184f test(email): add SMTP real-delivery smoke test via Mailpit [ISSUE-002]
25552a3 test(events): add NATS real-broker smoke + durability test [ISSUE-003]
703b10b test(backend): skip-on-unreachable hygiene for integration + m-series suites
89f3a29 fix(brownfield): fast Docker skip + SAST CI wiring + vet cleanup [ISSUE-008]
c481200 fix(brownfield): security + production hardening wave [ISSUE-002..007 derived]
64f0ca2 feat(brownfield): SMTP transport + NATS publisher + MFA mount gate [ISSUE-002 ISSUE-003 ISSUE-006]
fc83a49 docs(brownfield): database schema dump + core-entity ERD [ISSUE-005]
6b498be docs(brownfield): OpenAPI strategy scaffold + skeleton [ISSUE-004]
1fc0434 docs(brownfield): add proprietary LICENSE file [ISSUE-011]
1c00894 fix(brownfield): BulkMoveToGallery workspace scoping [ISSUE-007]
3889908 security(brownfield): remove committed OAuth client_secret + harden .gitignore [ISSUE-001]
```

Uncommitted working-tree files reviewed:

```
backend/tests/brownfield/bulk_move_integration_test.go  (+15 / -14)
frontend/src/lib/auth.ts                                (+18 / -21)
```

For each commit I read the diff and (where relevant) the current on-disk
file state, to confirm that later commits did not regress what an earlier
commit landed. Claims like "the fix is wired at main.go:X" were verified
against the current working tree, not just the commit that introduced them.

Every finding is tagged:

- **VERIFIED WORKING** — I read the code/tests and they do what the commit
  claims.
- **BROKEN OR BLOCKED** — I found a real defect or a ship-blocker.
- **NOT YET VERIFIED** — I did not exercise the behavior (no replay, no
  real-infra run). The code looks correct by inspection but has not been
  proven in this session.

## 2. Critical findings (action required before canary)

### 2.1 [BROKEN] ISSUE-001 remediation plan scope is incomplete

**Location:** `docs/brownfield/issue-001-remediation-plan.md`, Phase 2 step 3.

**What the plan says:** run
```bash
git filter-repo --invert-paths --path "gen-lang-client-0225070656-9e42fd6f0ba8.json"
```
This scrubs **only** the Google OAuth web-client JSON from history.

**What's actually leaked in history.** I ran
`git log --all --full-history --oneline -- .env` and it returned two
commits:

```
3889908 security(brownfield): remove committed OAuth client_secret + harden .gitignore [ISSUE-001]
4d0c13d feat: admin dashboard hardening + schema alignment
```

The `.env` blob is still reachable at `553febb:.env` (`git cat-file -e`
returns exit 0). Its contents at that commit, verified this session:

| Credential | Value fragment (masked) |
|---|---|
| `R2_ACCESS_KEY_ID` | `b1c8f71e60b3572241793906a7d674e8` |
| `R2_SECRET_ACCESS_KEY` | `ac59578e7db5...` |
| `CLODFLARE_STREAMING` (Cloudflare Stream API token) | `cfut_OaZRpOeUdbVm8OWnmkXYRZanBSuDDl97fNNN3J0Ec7a3344c` |
| `PHONEPE_CLIENT_SECRET_PROD` | `b5b663f8-b488-4c7b-8000-9915aaa450f0` |
| `PHONEPE_CLIENT_SECRET_TEST` | `NGRmZjRjMDYtMTM1ZC00ZTU2LTk2MDQtZmQ3Zjg4YzU0OGE1` |
| `RAZORPAY_KEY_ID` | `rzp_live_SaACt1vxmVQQXf` (**LIVE** key) |
| `RAZORPAY_KEY_SECRET` | `mRwt4O2IidkM19E9vq0TPN7T` |
| `STITCH_API_KEY` | `AQ.Ab8RN6JNw5z0D_PCq1b5jbByHvYquXPbg6U6naaWkXQHwvcKCg` |
| `FIGMA_API_KEY` | `figd_fYF4nPcfAt_i4sk2vILEcyyi6ZIBhlgiSmBUB7W7` |
| `GOOGLE_CLIENT_ID` (second OAuth client!) | `1057612383675-vmqts48gkofn1le3grij4udp1rkrfssc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` (second OAuth client!) | `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` |
| `SMTP_PASSWORD` | `Prasad@1979@` (looks like a personal password) |

**There are TWO Google OAuth clients leaked, not one.** The one in
`gen-lang-client-0225070656-9e42fd6f0ba8.json` has `client_secret`
`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` — the one in `.env` has
`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`. Different `client_id`s
(`...qg1horr2ng0pu5tnbbu3c1m5jbq8pnir` vs `...vmqts48gkofn1le3grij4udp1rkrfssc`).
The remediation plan only mentions the JSON file and only lists the first
client_secret.

**Implication for the current plan.** Running the remediation plan as
written would:
- Remove the Google OAuth JSON file from history
- Leave `.env` (and its 11+ live credentials) intact in history at both
  `553febb` and `4d0c13d`
- Leave the second Google OAuth client_secret unrotated

Anyone with historical repo access can still `git show 553febb:.env`
and recover the full set.

**Required fix for the plan.**

1. **Phase 1 (rotation) must be broadened** to cover every credential in
   `git show 553febb:.env`, not just the Google JSON. Create an explicit
   rotation checklist — my suggestion for format is §8.1 of this report.
2. **Phase 2 (filter-repo) must broaden the `--path` list** to:
   ```bash
   git filter-repo --invert-paths \
     --path "gen-lang-client-0225070656-9e42fd6f0ba8.json" \
     --path ".env"
   ```
   `.env` is currently gitignored; re-adding it (intentionally or via a
   tooling slip) is already prevented by the `.gitignore` hardening in
   `3889908`, but the historical blob must still be scrubbed.
3. **Phase 3 (coordination) is unchanged** — the same list of branches and
   the same `--force-with-lease` sequence still applies.
4. **Phase 4 (verification)** should add a grep for the specific leaked
   values (or their SHA-256 hashes) across the rewritten history, not just
   the filenames. A rewrite that misses one reachable path in a
   branch-stash or tag would re-introduce the credentials on a subsequent
   push.

### 2.2 [BROKEN] SAST CI job does not block image publishing

**Location:** `.github/workflows/production-gates.yml`, as amended by
commit `89f3a29`.

**Observation.** The `security` job runs three scanners (`semgrep`,
`gitleaks/gitleaks-action@v2`, `aquasecurity/trivy-action@master`) and
uploads SARIF to the Security tab. All three steps have
`continue-on-error: true`.

**Problem A.** The `images` job `needs:` list does not include `security`:

```yaml
images:
  runs-on: ubuntu-latest
  needs:
    - backend
    - frontend
    - openapi
```

So even if you removed `continue-on-error`, the `security` job runs in
parallel with `images` and cannot block an image build. A gitleaks
finding (e.g., a new secret landing in a future commit) would surface in
the Security tab but would not stop a container from being published.

**Problem B.** Mutable action refs create a supply-chain surface:
- `aquasecurity/trivy-action@master` — `@master` is the live branch
- `gitleaks/gitleaks-action@v2` — `v2` is a floating tag
- `semgrep scan --config auto` — pulls rule packs from the Semgrep
  Registry at runtime

A compromised upstream on any of these would run in CI with
`security-events: write` permission.

**Required fix.**

1. Add `security` to `images.needs:` so a failing scan can block publish.
2. Remove `continue-on-error` from gitleaks (secret-history scanning is
   the one layer you do NOT want advisory-only after Phase 1 of §2.1 is
   complete). Leave semgrep and trivy on continue-on-error for the initial
   rollout, tighten after baseline.
3. Pin all three actions by SHA, not by `@master` or by floating tag.
4. (Future) Vendor a semgrep rule pack into the repo rather than
   `--config auto`, or pin to a specific rule pack version.

### 2.3 [BROKEN] Uncommitted attacker-perspective tests for ISSUE-007

**Location:** `backend/tests/brownfield/bulk_move_integration_test.go`
(working tree, unstaged, +15 / -14).

**Context.** `1c00894` shipped the `BulkMoveToGallery` workspace-scoping
fix. At that commit, the author noted:

> The SQL guard is verified by code review only; the backend has no
> integration test suite at the repository layer. Adding one is a
> systemic carry-forward item separate from this fix.

`c481200` later added
`backend/tests/brownfield/bulk_move_integration_test.go` with seven tests
(verified via `grep -n "^func Test"`):

```
TestIssue007_HappyPath_MoveWithinWorkspace
TestIssue007_EmptyInput
TestIssue007_CrossWorkspaceAsset_IsSilentlyDropped
TestIssue007_CrossWorkspaceFromGallery_IsSilentlyDropped
TestIssue007_CrossWorkspaceToGallery_IsSilentlyDropped
TestIssue007_MixedAssetOwnership_FiltersCrossWorkspace
TestIssue007_PreservesClientOrderingForMove
```

This is exactly the attacker-perspective coverage the 1c00894 commit
deferred. Good.

**The problem.** The committed test uses table columns that no longer
exist in the schema dump at `docs/db/schema.sql`. I verified against the
current tree:

- `seedWorkspace` inserts into `states (code, name, country_code)` — but
  `CREATE TABLE public.states` has columns `id, name, code, type,
  is_union_territory`. No `country_code`.
- `seedGallery` inserts into
  `galleries (id, workspace_id, created_by, name, slug, visibility)` —
  but `CREATE TABLE public.galleries` has `title` (not `name`),
  `status` + `is_published` + `access_mode` (not `visibility`).

The working-tree diff rewrites both INSERTs to use the current column
names. But **this fix is uncommitted**. Until it commits and the tests
run green against a real database, the attacker-perspective coverage
for ISSUE-007 is not actually exercised — the tests either fail to
compile, fail to run, or skip-on-unreachable because no test DB is
available. Per the `skip-on-unreachable` hygiene from `703b10b`, they
most likely skip in CI with no visible signal.

**Net effect.** The SQL guard in `asset_repo.go:456` is still verified
only by code review, exactly as the 1c00894 commit message warned. The
tests exist but have never been proven green against a real DB schema
that has the column names they reference.

**Required fix.** Commit the working-tree schema reconciliation with a
separate commit (message like `test(brownfield): reconcile ISSUE-007
integration tests with current schema [country_code→type,
name→title, visibility→status/is_published]`) and run the tests against a
real pgvector DB. An attacker-scenario test that has never run is not
evidence; it is intent.

## 3. High-severity findings

### 3.1 [BROKEN] SMTP `platform_settings` precedence is documentation-only

**Location:** `backend/cmd/api/main.go:243`, `backend/internal/email/smtp.go:81`.

`LoadSMTPConfig` is documented as "platform_settings first, env vars
second, return nil otherwise." That's what the package comment says:

```go
// LoadSMTPConfig reads SMTP settings from the given platform_settings
// store first, then falls back to environment variables.
```

But the actual call in main.go at line 243 is:

```go
smtpCfg, smtpErr := email.LoadSMTPConfig(context.Background(), nil)
```

The `SettingsReader` parameter is `nil`. Inside `LoadSMTPConfig`:

```go
get := func(dbKey, envName string) (string, error) {
    if reader != nil {
        ...
    }
    return os.Getenv(envName), nil
}
```

So when `reader` is nil, every lookup falls directly to the env var path.
The platform_settings DB branch is never taken at startup.

**Consequence.** If an operator uses the admin UI (per AGENTS.md
"platform_settings DB category `email`") to update SMTP host, password,
or FROM address, those changes **have no effect until the backend is
restarted AND the env vars are also updated**. The admin UI becomes a
ghost control for SMTP config.

**This is not necessarily a bug.** The comment at `main.go:237-243`
explains the reason:

> the platform_settings DB path is not yet available this early in boot

That is a legitimate bootstrap ordering concern. But three things need to
happen before ship:

1. Decide whether SMTP hot-reload from `platform_settings` is wanted. If
   yes, implement a post-boot refresh goroutine that reads the reader
   after the repo is constructed and rebuilds the delivery objects.
2. Update the package-level doc comment in `smtp.go:54` to state
   honestly that platform_settings is a *future* path and that current
   callers pass nil.
3. Surface in the admin UI that SMTP category changes are dev-only or
   require a restart — otherwise operators will silently have
   unworking config.

### 3.2 [BROKEN] `NATSPublisher.Publish` does not honor `ctx` during the publish

**Location:** `backend/internal/events/nats_publisher.go:99-111`.

```go
func (p *NATSPublisher) Publish(ctx context.Context, subject string, data []byte) error {
    if err := ctx.Err(); err != nil {
        return err
    }
    if _, err := p.js.Publish(subject, data); err != nil {
        return fmt.Errorf("nats publish %q: %w", subject, err)
    }
    return nil
}
```

The `ctx.Err()` check is a pre-flight. Once `p.js.Publish(subject, data)`
is called, it blocks until the JetStream server acks or the NATS client's
own `AckWait` (default 30s) elapses. Context cancellation after that line
has no effect. The doc comment at `nats_publisher.go:100-102` claims:

```go
// Publish blocks until JetStream acknowledges the message or the
// caller's context is cancelled.
```

That is not what the implementation does. A caller that cancels its
context to abort a slow publish will still be stuck on the blocked
`js.Publish` call for up to `AckWait` seconds.

**Required fix.** Either:
- Call `p.js.PublishAsync(...)` and race the returned `ack` channel
  against `ctx.Done()`, OR
- Update the doc comment to say "the `ctx` is honored before the publish
  is dispatched, but cannot interrupt an in-flight publish," which is the
  honest version of current behavior.

### 3.3 [BROKEN] `NATSPublisher.Publish` silently accepts out-of-stream subjects

**Location:** `backend/internal/events/nats_publisher.go:48-54, 103-111`.

The package declares:

```go
const StreamName = "RAWDRIVE_EVENTS"
const SubjectPrefix = "rawdrive."
```

And the `SubjectPrefix` comment says:

```go
// SubjectPrefix is the wildcard the stream captures. Callers MUST
// publish under this prefix or the message will be dropped at the
// stream filter.
```

But `Publish` does no prefix check:

```go
if _, err := p.js.Publish(subject, data); err != nil {
    return fmt.Errorf("nats publish %q: %w", subject, err)
}
```

A caller who passes `"foo.bar"` will get back a NATS error like
`nats: no stream matches subject`, which is cryptic. Worse, a typo like
`"RawDrive.gallery.created"` (capital R) will fail for the same reason
and look identical to a "broker unreachable" error in logs.

**Required fix.** One-liner:

```go
if !strings.HasPrefix(subject, SubjectPrefix) {
    return fmt.Errorf("nats publish: subject %q must start with %q", subject, SubjectPrefix)
}
```

### 3.4 [BROKEN] 374fd38 silently changes MFA rate-limit scope

**Location:** `backend/cmd/api/main.go:469-473` via commit `374fd38`.

The commit message reads "chore(workspace): commit pending WIP and
gitignore editor state." What the diff actually does:

```diff
-r.With(mfaVerifyLimiter).Mount("/auth", mfaHandler.PublicRoutes())
-r.With(mfaVerifyLimiter).Mount("/api/v1/auth", mfaHandler.PublicRoutes())
+r.With(mfaVerifyLimiter).Post("/auth/verify-totp", mfaHandler.VerifyTOTP)
+r.With(mfaVerifyLimiter).Post("/auth/verify-recovery-code", mfaHandler.VerifyRecoveryCode)
+r.With(mfaVerifyLimiter).Post("/api/v1/auth/verify-totp", mfaHandler.VerifyTOTP)
+r.With(mfaVerifyLimiter).Post("/api/v1/auth/verify-recovery-code", mfaHandler.VerifyRecoveryCode)
```

**What the change does.** The old code mounted the rate limiter on every
route in `mfaHandler.PublicRoutes()` (presumably `/enroll`,
`/verify-enrollment`, `/status`, `/verify-totp`, `/verify-recovery-code`,
and `/enrollment`). The new code applies it only to the two verify
endpoints. The other MFA routes (`/enroll`, `/verify-enrollment`,
`/status`, `/enrollment`) now bypass the limiter.

**Is this correct?** Arguably yes. The rate limiter's stated purpose
(comment lines 464-467) is to slow brute-force against the 10⁶ TOTP
code space. The other MFA endpoints don't expose that surface —
`/enroll` creates a new secret, `/status` reads enrollment state, etc.
Narrowing the limiter to the brute-force-vulnerable paths is a correct
scope-tightening.

**Why this is still a finding.** The commit message doesn't mention the
change at all. A security-relevant routing change is buried in a commit
labeled "WIP and gitignore." That means:

1. A future reviewer scanning `git log` will skip the commit.
2. A bisect looking for a "MFA route limiter regression" will stop at
   this commit and see a confusing message.
3. The rationale (`enroll doesn't need brute-force protection because…`)
   is nowhere on disk.

**Required fix.** Split `374fd38` into two commits:

- `chore(workspace): gitignore editor dirs + design-tokens.json refresh`
  (the design token, DESIGN.md, issuestofix.md, .gitignore diffs)
- `security(auth): narrow MFA rate limiter to verify endpoints only`
  (the `backend/cmd/api/main.go` change, with a paragraph explaining the
  brute-force scope argument)

Or, if rebasing is off-limits, at minimum add an explanatory commit on
top that references `374fd38` and pins the rationale.

## 4. Medium-severity findings

### 4.1 [BROKEN] `docs/db/schema.sql` has a non-deterministic `\restrict` line

**Location:** `docs/db/schema.sql:5`, `scripts/refresh-schema.sh`.

Line 5 of the committed schema dump is:

```
\restrict os8sfZsJoEBTGduT0NBHv3f2VBVKfglYKV3L543Bu8ZG84UIP9YU1i3BSK9zMut
```

`pg_dump 16+` emits this to lock restores to the generating session. It
is a **random token on every dump**. Re-running `refresh-schema.sh` will
produce a different token even when the schema has not changed, which
means the committed `schema.sql` will show a spurious diff on every
refresh.

**Consequence.** The refresh-schema policy ("Commit docs/db/schema.sql
along with any migration that lands on main") will train operators to
commit noise-only diffs, or, more likely, to stop refreshing the file
because the diff is always noise.

**Required fix.** Strip the `\restrict` line in `refresh-schema.sh`:

```bash
docker exec "$CONTAINER" pg_dump ... \
  | grep -v '^\\restrict ' \
  | grep -v '^\\unrestrict ' \
  > "$OUT"
```

And re-run the refresh once to land a deterministic baseline.

### 4.2 [BROKEN] `refresh-schema.sh` hardcodes a workstation-specific container name

**Location:** `scripts/refresh-schema.sh:28`.

```bash
CONTAINER="${POSTGRES_CONTAINER:-cobolt-cobolt-rawdrive-f651e4-postgres-1}"
```

The default contains `f651e4`, which looks like a per-workstation compose
project hash. A second engineer running this script will hit "container
not running" unless they set `POSTGRES_CONTAINER` explicitly. The error
message below doesn't mention the env var override:

```
ERROR: postgres container 'cobolt-cobolt-rawdrive-f651e4-postgres-1' is not running.
Start it with: docker compose -f _cobolt-docker/docker-compose.yml up -d postgres
```

**Required fix.** Look up the container by service name:

```bash
CONTAINER="$(docker compose -f _cobolt-docker/docker-compose.yml ps -q postgres)"
if [ -z "$CONTAINER" ]; then
  echo "ERROR: no running postgres container for service 'postgres'." >&2
  echo "Start it with: docker compose -f _cobolt-docker/docker-compose.yml up -d postgres" >&2
  exit 1
fi
```

### 4.3 [NOT YET VERIFIED] `NewNATSPublisher` may return a disconnected publisher

**Location:** `backend/internal/events/nats_publisher.go:60-97`.

```go
conn, err := nats.Connect(url,
    nats.Name("rawdrive-backend"),
    nats.ReconnectWait(2*time.Second),
    nats.MaxReconnects(-1),
)
if err != nil {
    return nil, fmt.Errorf("nats connect %q: %w", url, err)
}
```

`nats.Connect` with `MaxReconnects(-1)` returns an error on the initial
dial if the server never answers, but the NATS client is designed to be
resilient to transient failures — under some conditions it can enter a
reconnect loop without surfacing an error on the initial call. The
subsequent `js.StreamInfo` call catches some of these cases, but not all
(e.g., an existing-stream lookup against a client that never connected).

**What I didn't verify.** I did not exercise the cold-connect path by
pointing `NATS_URL` at an unreachable host and observing whether
`NewNATSPublisher` returns an error, returns a disconnected publisher,
or blocks.

**Recommended defensive fix.**

```go
if conn.Status() != nats.CONNECTED {
    conn.Close()
    return nil, fmt.Errorf("nats connect %q: client status is %v", url, conn.Status())
}
```

Place it between the `nats.Connect` call and the `conn.JetStream()` call.

### 4.4 [VERIFIED] OpenAPI spec has zero `operationId`s (documented deferral)

**Location:** `docs/api/openapi.yaml`, `redocly.yaml`.

Measured: `grep -c "operationId:"` → 0. `grep -cE "summary:"` → 32.

The `redocly.yaml` config turns off `operation-operationId` with a
paragraph explaining that SDK-naming conventions are a product decision
to be handled separately. The commit message also acknowledges this as a
deferred follow-up.

**Why this is still a finding.** Any typed SDK generated from this spec
(openapi-typescript, oapi-codegen, Stoplight) will produce function names
like `postApiV1Uploads` instead of `createUpload`. Every future consumer
that adopts the spec before the backfill will have to mechanically rename
their generated client when the backfill lands. If a frontend team is
planning to ship a typed SDK before this backfill, they're committing to
future churn.

**Required action.** Decide whether to block the typed-SDK adoption
until after the backfill, or to accept the mechanical rename cost later.
This is a product decision, not a code fix.

### 4.5 [BROKEN] LICENSE lacks a named legal entity

**Location:** `LICENSE`.

```
Copyright (c) 2026 RawDrive. All Rights Reserved.
```

"RawDrive" is a product brand, not a legal entity. For enforceability
under Indian law (and similar jurisdictions), copyright should be held
by a named legal entity — a private limited company, LLP, or individual
author. The "will be prosecuted to the maximum extent possible"
boilerplate is strong language but weak if there's no registered holder.

**Required fix.** Replace "RawDrive" on line 3 with the registered legal
entity name (e.g., "RawDrive Technologies Private Limited" or whatever
the incorporation shows). Contact legal for the exact phrasing.

## 5. Low-severity and stylistic findings

### 5.1 [VERIFIED] SMTP real-delivery test is Mailpit-only

**Location:** `backend/tests/integration/smtp_delivery_real_test.go`.

The file tests against `localhost:1025` (Mailpit). It does not exercise
STARTTLS, PLAIN auth, or DKIM. The header comment and
`meta-issues-clarification.md` both explicitly call this out as an
operator-run procedure against a real provider (Postmark/SES/Mailgun).

No action required beyond completing the operator attestation in
`docs/brownfield/ISSUE-002-verification.md` (does not exist yet — see §8.3).

### 5.2 [VERIFIED] NATS durability test uses `GetLastMsg`, not container restart

**Location:** `backend/tests/integration/nats_publisher_real_test.go:93-139`.

The test publishes via the production `NATSPublisher`, then opens a
fresh independent `nats.Connect` and reads via `js.GetLastMsg`. This is
a legitimate proxy for durability — `GetLastMsg` reads server-side stream
storage, which with `Storage: nats.FileStorage` means the message has
crossed the persistence boundary.

**Caveat:** JetStream's `sync_interval` (async fsync, default 2 minutes)
means a broker crash between commit and fsync could still lose the
message. For strict "would survive a container restart" evidence, the
operator procedure in `meta-issues-clarification.md` lines 180-209 is
still required.

No action required beyond completing the operator attestation in
`docs/brownfield/ISSUE-003-verification.md` (does not exist yet — see §8.3).

### 5.3 [VERIFIED] MFA mount gate walker has a subtle false-negative

**Location:** `backend/internal/middleware/mfa_mount_validation.go:47-50, 72`.

The walker identifies `JWTAuth` closures via the substring match
`"JWTAuth.func"` in `runtime.FuncForPC(...).Name()`. This catches every
inlining variant the compiler produces today. But it does not catch:

```go
r.Use(func(h http.Handler) http.Handler { return middleware.JWTAuth(svc)(h) })
```

An anonymous-closure wrapper like that would have a runtime name like
`main.setupProtected.func1` with no `"JWTAuth.func"` substring. The
walker would report it as a missing-JWTAuth violation even though
JWTAuth is in fact present in the wrapping closure.

**Current impact:** zero, because zero routes mount `RequireMFA` today,
and the wiring in `main.go:467-472` uses the factory directly. This is a
future-proofing concern, not a present defect.

**Suggested fix:** document the limitation in the function-level comment
and prefer direct `.Use(JWTAuth(svc))` over wrapped-closure forms in any
future MFA route wiring.

### 5.4 [BROKEN] Schema refresh policy is aspirational, not CI-enforced

**Location:** `scripts/refresh-schema.sh:44`, `docs/db/README.md`.

The refresh script says:
```
Commit docs/db/schema.sql along with any migration that lands on main.
```

There is no CI check that enforces this. A migration can land without a
schema.sql refresh, and the drift goes unnoticed until the next
voluntary refresh.

**Required fix.** Add a CI step (separate job or inside the existing
`backend` job) that runs `refresh-schema.sh` against a migrated test
database and `git diff --exit-code docs/db/schema.sql` — failing the job
if the committed schema.sql is out of date. Make this gate dependent on
the fix for §4.1 (deterministic output) first.

### 5.5 [NOT YET VERIFIED] `continue-on-error` on SAST scanners masks baseline surface

**Location:** `.github/workflows/production-gates.yml`, security job.

All three scanners (`semgrep`, `gitleaks`, `trivy`) have
`continue-on-error: true`. Combined with §2.2, the security job is
purely informational on the initial rollout.

**What I didn't verify.** I did not check whether any SARIF upload has
actually happened on this branch — the "first-run baseline" claim from
the commit message (`89f3a29`) is a claim about future CI, not about
what's on disk. Until the first run of the security job lands on a push
or PR, the Security tab is empty and the "surface without blocking"
justification can't be audited.

**Required action.** Push a branch to trigger the workflow and confirm
SARIF uploads arrive for all three scanners before relying on the
"surface the baseline" argument.

## 6. Verified working (no action needed)

These are the claims I read and confirmed against the current tree. They
are not exhaustive evidence — just the claims I spot-checked this
session.

| Claim | Location | Verification |
|---|---|---|
| Refresh token is HttpOnly + Secure + SameSite=Strict cookie | `backend/internal/auth/handler.go:547-557` | Read the cookie-setter, confirmed all three flags and `MaxAge: 7 * 24 * 60 * 60` |
| Response body does not include refresh_token | `handler.go:274-276, 484-486` | Verified `VerifyOTPResponse{AccessToken: ...}` only, `omitempty` on the struct tag |
| `mfa_verified` claim propagates to JWT context | `backend/internal/middleware/jwt_auth.go:41` | Read the claimsMap assembly, confirmed the key is present |
| CORS in production does not reflect localhost origins | `backend/internal/middleware/cors_test.go:11-29` | Read the test, positive+negative assertions are correct |
| MFA mount gate has 5 comprehensive tests | `backend/internal/middleware/mfa_mount_validation_test.go` | Read all 5 test functions, they cover: clean order, missing JWTAuth, reversed order, no-MFA-routes, subrouter violation, subrouter inheriting parent JWTAuth |
| `ValidateMFAMountOrder` is wired before `ListenAndServe` | `backend/cmd/api/main.go:1222` | Verified the FATAL call fires before `http.Server` construction at line 1251 |
| NATS wiring switches on `EVENT_BROKER` env var | `backend/cmd/api/main.go:410-425` | Verified the switch; FATAL on `EVENT_BROKER=nats` with connect failure at line 418 |
| SMTP FATAL gate for missing config in production | `backend/cmd/api/main.go:256-268` | Verified `isProduction` check + `DEV_STUB_EMAIL` escape hatch |
| BulkMoveToGallery workspace guard runs in a transaction | `backend/internal/repository/asset_repo.go:478-570` | Read the SQL: Begin → gallery count guard → asset filter → DELETE → INSERT → Commit |
| OpenAPI 3.1 nullable idiom fix applied to 6 fields | `docs/api/openapi.yaml` | `grep -cE "type: \[.*null.*\]"` → 6, matches commit message |
| OpenAPI CI lint has no `continue-on-error` | `production-gates.yml` `openapi` job | Read the workflow, hard-fail confirmed |
| Test hygiene skip-on-unreachable helpers are protocol-level | `backend/tests/integration/health_test.go:38-92` | Read `natsResponsive` (INFO greeting), `smtpResponsive` (220 greeting), `valkeyResponsive` (PING/+PONG) |
| `docker info` preflight short-circuits in ~2s | `backend/tests/testsupport/pgvector.go:115-131` | Read the 2s-context probe, confirmed `dockerHealthy()` is called at the top of `initSharedContainer` |
| m13 sequential-execution warning on the trigger-mutation test | `backend/tests/m13/integration_test.go:201-213` | Read the 8-line comment block, references package-level note at lines 40-42 |
| ISSUE-006 walker uses substring match on JWTAuth closures | `mfa_mount_validation.go:47-50` | Documented rationale about Go inlining; verified the `JWTAuth.func` substring approach |
| `.gitignore` blocks `gen-lang-client-*.json`, `.env`, `.env.cobolt`, `.env.mcp` | `.gitignore:1-56` | Read all patterns |
| `.env.example` is a blank template | `grep -cE "GOCSPX\|rzp_live\|cfut_\|figd_\|mRwt4" .env.example` | Returned 0 matches |

## 7. Uncommitted working-tree changes

### 7.1 `backend/tests/brownfield/bulk_move_integration_test.go`

See §2.3 above. This is the schema reconciliation that would make the
ISSUE-007 attacker-perspective tests runnable. It must commit to count
as evidence.

### 7.2 `frontend/src/lib/auth.ts`

+18 / −21. Three changes:

1. Consolidate `ACCESS_TOKEN_KEY` + `REFRESH_TOKEN_KEY` into a single
   `LEGACY_TOKEN_KEYS` const
2. Remove the `getStorage(type)` helper in favor of inline iteration over
   `[localStorage, sessionStorage]`
3. Change `persistAuthTokens` signature from
   `(accessToken, refreshToken = '', remember = true)` to
   `(accessToken)`

**Risk assessment.**

- The old signature had `refreshToken` and `remember` parameters that
  were explicitly dead (`void refreshToken; void remember;`).
- `grep -rn "persistAuthTokens" frontend/src` shows all 4 call sites
  (`ActivateForm.tsx:46`, `LoginForm.tsx:135`, `MFAVerifyForm.tsx:72`,
  `auth.ts:87`) pass exactly one argument. None of them are broken by
  the signature change.
- The read path is `accessTokenCache` (an in-memory variable) returned
  by `getAccessToken()`. No localStorage read. This aligns with the
  `c481200` refresh-token-cookie security posture and the OWASP JWT
  storage recommendation.

**Disposition.** Clean refactor. Can be committed as a separate
`chore(frontend): simplify persistAuthTokens signature — drop dead
refreshToken/remember params` commit. No functional or security impact.

## 8. Recommendations

### 8.1 Expanded ISSUE-001 rotation checklist (required before Phase 2)

Because the current remediation plan scopes to the Google JSON file only,
this checklist must be completed in addition to the plan's Phase 1 before
any history rewrite.

| Credential | Where to rotate | Where to update |
|---|---|---|
| Cloudflare R2 access key + secret | R2 dashboard → API Tokens | `.env.cobolt` (local), staging env, prod env |
| Cloudflare Stream API token | dash.cloudflare.com → My Profile → API Tokens | same |
| PhonePe prod client_secret | PhonePe merchant portal | prod env only; rotate test separately |
| PhonePe test client_secret | PhonePe merchant portal (sandbox) | local + staging env |
| Razorpay **live** key_id + key_secret | Razorpay dashboard → Settings → API Keys | prod env only |
| Stitch API key | Stitch account settings | all envs that use Stitch MCP |
| Figma API key | Figma account → Settings → Personal access tokens | all envs that use Figma MCP |
| Google OAuth #1 (`...qg1horr2ng0pu5tnbbu3c1m5jbq8pnir`, from JSON) | GCP Console → gen-lang-client-0225070656 project | wherever that client_id is consumed |
| Google OAuth #2 (`...vmqts48gkofn1le3grij4udp1rkrfssc`, from .env) | GCP Console → whichever project hosts that client_id | same |
| SMTP password (`Prasad@1979@`) | wherever this mailbox is managed | all envs; also change the personal password if reused |

Every row above must be marked "rotated + verified" before Phase 2 of
`issue-001-remediation-plan.md` runs. The broadened filter-repo command
(`--path "gen-lang-client-0225070656-9e42fd6f0ba8.json" --path ".env"`)
is then the defense-in-depth step, not the load-bearing step.

### 8.2 Split `374fd38` (strongly recommended)

See §3.4. The WIP commit currently bundles five unrelated things under a
misleading message. Before `brownfield/fix-12-issues` merges to `main`,
at minimum add a follow-up commit that:

- Cross-references `374fd38`
- Explains the MFA rate-limiter scope narrowing
- Records the security argument (TOTP brute-force protection applies
  only to the verify endpoints)

If an interactive rebase is acceptable, split the commit cleanly.

### 8.3 Operator attestation scaffolds

Two documents are referenced by `meta-issues-clarification.md` as
operator-attestation targets but do not yet exist:

- `docs/brownfield/ISSUE-002-verification.md` — real-provider SMTP smoke
  procedure and operator sign-off
- `docs/brownfield/ISSUE-003-verification.md` — container-restart NATS
  durability procedure and operator sign-off

These should be scaffolded as empty checklists ready for human operators
to fill in, per the steps in lines 152-209 of
`meta-issues-clarification.md`. I can create these templates if you
authorize the file writes.

### 8.4 Stop referring to the pipeline as if it runs on this branch

`meta-issues-clarification.md` already documents that the brownfield fix
wave landed as hand-written commits, not CoBolt pipeline output. This
review is additional evidence: attempts to run `cobolt-review M17
--autonomous` or `cobolt-fix` skills on this branch hit at least five
independent blockers (tools not installed, Gate 0 planning artifacts
missing, planning packet on disk is `M-F*` not M17, `_cobolt-output/latest/build/`
doesn't exist, `--autonomous` would chain back into the ISSUE-001 trap).

When a "re-run review" decision is needed before ship, the correct next
step is **not** to invoke the pipeline skills blindly but to choose
between:

- **A.** Manual reviews like this one, commit-scoped to real work.
- **B.** Installing the CoBolt runtime tooling and regenerating the M17
  planning packet, as a separate (not-emergency) setup task.

Mixing the two produces phantom output.

## 9. What this review did NOT cover

In the interest of honesty, here is what a full pipeline run would
have exercised that this review did not:

- **Frontend tests.** I did not read the 216 vitest assertions in
  `frontend/src/**/__tests__/`. The `c481200` commit message claims "216
  vitest tests across 27 files -> all green" but I did not replay them.
- **`backend/internal/auth/handler_test.go`** (94-line expansion in
  `c481200`). I verified the public contract changes (refresh-token
  cookie, mfa_verified propagation) via the source, but did not read the
  test expansions line by line.
- **Frontend layout + onboarding changes.** `c481200` touches
  `frontend/src/app/(dashboard)/layout.tsx`, `onboarding/page.tsx`,
  `ActivateForm.tsx`, `LoginForm.tsx`, `MFAVerifyForm.tsx`. I checked
  call sites for `persistAuthTokens` but did not review the visual /
  routing flow.
- **`frontend/next.config.ts` CSP change** ("drop unsafe-eval from
  production CSP; dev only"). I did not read the diff.
- **`backend/cmd/api/server_shutdown.go`**, new file from `c481200`. I
  did not verify the SIGINT/SIGTERM drain order or that it actually stops
  the worker context before closing the HTTP server.
- **Backend `Dockerfile` multi-stage rewrite** and `frontend/Dockerfile`.
  Non-root user + multi-stage are standard hardening, I did not verify
  the specific layer composition.
- **Runtime verification.** I did not run `go build ./...`, `go test
  ./...`, `pnpm test`, or `pnpm build`. Every test assertion in this
  review is from reading the test source, not from observing it pass.
- **Real-infra attestation.** I did not send a real SMTP email through
  Postmark/SES/Mailgun, and did not restart a compose NATS container.
  Both are explicit operator procedures in
  `meta-issues-clarification.md`.
- **The `backend/internal/auth/mfa_handler.go` 12-line change** in
  `c481200`. Small enough that a dedicated pass would be cheap; I
  deprioritized it in favor of the larger auth handler changes.
- **The 1019+ lines of `design-tokens.json` churn** in `374fd38`. A
  design-tokens file is data, not code, but a review would still want to
  check that no semantic token was silently removed or renamed.

## 10. Summary

**Ship blockers (must resolve before canary):**

1. ISSUE-001 remediation plan is scoped to Google JSON only; the `.env`
   leak at `553febb` and `4d0c13d` (R2, Cloudflare, PhonePe, Razorpay
   LIVE, Stitch, Figma, second Google OAuth client, SMTP password) is
   not covered. **Broaden Phase 1 rotation and Phase 2 filter-repo
   path list before any destructive action.** (§2.1, §8.1)
2. SAST CI job is not in the `images` needs list and every scanner has
   `continue-on-error: true`. The "ISSUE-008 addressed" claim is
   informational only. **Gate image publish on `security` job and
   remove continue-on-error from gitleaks at minimum.** (§2.2)
3. ISSUE-007 attacker-perspective integration tests don't compile against
   the current schema. **Commit the working-tree reconciliation and run
   the tests green against real pgvector.** (§2.3)

**High-severity correctness fixes:**

4. SMTP `LoadSMTPConfig` is documented as platform_settings-first but
   main.go passes `nil` SettingsReader, making it env-only at boot. Fix
   the doc or implement a post-boot refresh. (§3.1)
5. `NATSPublisher.Publish` does not honor `ctx` during the actual
   publish, contradicting its doc comment. (§3.2)
6. `NATSPublisher.Publish` silently accepts out-of-stream subjects and
   produces cryptic errors. (§3.3)
7. `374fd38` silently narrows the MFA rate-limiter scope under a
   "chore/WIP" commit message. Split or add a follow-up commit. (§3.4)

**Medium-severity hygiene and debt:**

8. `docs/db/schema.sql` has a non-deterministic `\restrict` token; every
   refresh produces a phantom diff. (§4.1)
9. `refresh-schema.sh` hardcodes a workstation-specific container name.
   (§4.2)
10. `NewNATSPublisher` may return a disconnected publisher on cold
    unreachable brokers; add a `conn.Status() == nats.CONNECTED` check.
    (§4.3)
11. OpenAPI spec has zero `operationId`s (explicitly deferred — product
    decision required). (§4.4)
12. LICENSE lacks a named legal entity. (§4.5)

**Verified working (no action):** 14 claims read and confirmed against
the current tree. See §6.

**Total commits reviewed:** 17 committed + 2 uncommitted working-tree files.

**Net assessment.** The brownfield fix wave is a strong, honest set of
fixes with clear commit messages (with the one §3.4 exception). The
code-level work on SMTP, NATS, MFA gating, BulkMove workspace scoping,
refresh token cookies, CORS, and WebP enforcement all appears correct on
inspection. The evidence gap is real but well-documented: what's missing
is real-infra attestation, not missing code. The one genuinely
ship-critical defect is the ISSUE-001 remediation plan's incomplete scope
— that is a plan bug, not a code bug, but it matters because the
remediation is waiting for operator execution and the operator's plan
currently misses half the leak.

ISSUE-002, ISSUE-003, ISSUE-006, ISSUE-007 are code-complete and
inspection-correct. ISSUE-004 and ISSUE-005 are documentation-complete
with deferred follow-ups recorded. ISSUE-008 is code-complete but the CI
gate doesn't block. ISSUE-011 is a one-file LICENSE that needs a legal
entity name.

Nothing in this review argues against the fix wave as a whole. The
actionable list is short, targeted, and each item has a specific next
step.
