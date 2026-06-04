# RawDrive Secure-Coding Standard (SCS)

**Status:** binding. **Audience:** every developer and every AI agent that writes or modifies code in this repository (Go in `backend/`, TypeScript/React in `frontend/`, SQL migrations, build/CI/deploy scripts). **Owner:** RawDrive engineering. **Last reviewed:** 2026-06-04.

This is the single source of truth for *code-level* security rules for RawDrive — India's premium photography SaaS (Go/Chi + JWT + pgvector backend, Next.js 15 + TypeScript + Tailwind v4 frontend, Postgres 16, Valkey, NATS JetStream, Backblaze B2 object storage, the WebP derivative pipeline). It is "military-grade + enterprise-grade" by construction: every control family is anchored to a recognized authority (see [Part A](#part-a--authority-crosswalk)) drawn from both the safety/mission-critical tradition (NASA "Power of Ten", MISRA-style restricted-construct discipline, CERT) and the enterprise secure-SDLC tradition (NIST SSDF, OWASP ASVS, CWE Top 25, NIST 800-53, DISA Application-Security STIG, SLSA).

It is **mandatory and non-negotiable**. It is the code-level expansion of the **"Hardcode Laws"** in `AGENTS.md` and the auth/storage/token invariants in `CLAUDE.md`. Where those documents state *what must never be done*, this document states *the rule, why, and how it is enforced*.

> **How this relates to the other governance docs**
> - `CLAUDE.md` / `AGENTS.md` / `frontend/AGENTS.md` — the project's load-bearing invariants ("Hardcode Laws", auth model, storage model, design-token rule, performance hot paths). This SCS is their code-level, authority-anchored expansion. On any conflict the invariant docs win for *what*, this doc adds *enforcement*.
> - `design-tokens.json` — the single source of truth for all visual styling. SCS Part C enforces the token cascade.
> - `docs/security/` — `README.md`, `soc2-controls.md`, `policies/` (information-security, personnel), `procedures/key-management.md`, `dpa-template.md`, `sub-processors.md`, and the `2026-05-30-full-application-security-audit.md`. Those define the *organizational* and *runtime* security posture (SOC 2, GDPR, India DPDP). This SCS governs the *source code* that implements those controls.
> - `docs/TechnicalRequirements/Security_Compliance_Privacy.md` — the compliance/privacy requirements. SCS families 3/4/5/8/10 are how the code satisfies them.
> - `~/.claude/skills/rawdrive-fix` (the fix skill) and `rawdrive-performance-audit` — the AI review/fix harnesses. Their AUDIT phase grades changed code against **this** standard (it is the rubric the skill's `references/audit-rubric.md` points at).
> - **Enforcement surfaces:** `.githooks/{pre-commit,commit-msg,pre-push}` (installed via `npm install` → `prepare` → `core.hooksPath`) and `.github/workflows/production-gates.yml` (the CI gates). This document is what those surfaces protect.

---

## Part 0 — Governance (this is what stops re-litigation)

### 0.1 Precedence

When two rules appear to conflict, resolve in this order (highest wins):

1. **Architectural fail-fast invariants compiled into the app** — e.g. `backend/internal/storage/factory.go` FATAL-exits when `STORAGE_DRIVER` is not `s3`; `middleware/jwt_auth.go` rejects unauthenticated requests. Runtime hard controls.
2. **This standard (SCS)** — code-level rules.
3. **`AGENTS.md` / `CLAUDE.md` Hardcode Laws & invariants** — project doctrine.
4. **`frontend/AGENTS.md` + repo conventions** — local conventions.
5. **Local module patterns.**

A lower layer may be *stricter* than a higher one; it may never be *laxer*.

### 0.2 Scope tags

Every rule carries one tag:

- `[ALL]` — applies everywhere in the monorepo (Go, TS, SQL, scripts, CI).
- `[GO]` — backend Go code (`backend/`).
- `[TS]` — frontend TypeScript/React (`frontend/`).

### 0.3 The waiver process — the only sanctioned way to deviate

A rule is not "re-litigated" in a PR thread, a commit body, or a chat message. There is exactly **one** way to deviate from an SCS rule:

1. Write a decision doc at `docs/decisions/scs-<rule-id>-<slug>.md` (create the dir on first use) containing **owner**, **reason**, **compensating control**, and **expiry** (a date, or an explicit condition under which the waiver is removed).
2. Add the in-code marker at the deviation site:
   - Go / TS / JS: `// SCS-WAIVER: <RULE-ID> — see docs/decisions/scs-<rule-id>-<slug>.md`
   - SQL / YAML / shell / TOML: `-- SCS-WAIVER:` or `# SCS-WAIVER: <RULE-ID> — see docs/decisions/scs-<rule-id>-<slug>.md`
3. For a **hook-blocked** rule, the only commit-time escape is `git commit --no-verify` (pre-commit/commit-msg) or `SKIP_PREPUSH=1 git push` (pre-push). Use these **only** alongside a recorded waiver. A bare `--no-verify` with no decision doc is itself a violation, caught at review.

**File-level exempt (special case).** A security module that legitimately holds *attack patterns as data* — e.g. a validator that defines the very `curl … | sh` or path-traversal strings it blocks, or redaction code that contains a sample credentialed URL / PEM header to scrub — carries a one-line `// SCS-FILE-EXEMPT: SCS-NNN[, SCS-NNN…] — <reason>` (or `SCS-FILE-EXEMPT: ALL`) and still requires a reason on the line.

No waiver, no deviation. A reviewer who wants to relax a rule writes the decision doc; they do not argue the rule in the PR. That is the entire anti-re-litigation mechanism: the rule is settled; only documented exceptions move.

### 0.4 Enforcement column legend

Each rule states how it is enforced **today** (honestly — RawDrive does **not** yet ship a dedicated `precheck-secure-coding` hook or `guard-secure-coding` script; rules map to the *existing* surfaces or to review):

- **hook** — `.githooks/pre-commit` / `commit-msg` / `pre-push` blocks it at `git commit`/`git push` (scans the staged diff / push range). Today this covers: committing `.env*`/`*.pem`/`*.key`/`*-credentials*` by path, `PRIVATE KEY` / `AKIA…` content, new >1 MB binaries, non-Conventional commit messages, force-push to `main`, and staged `gofmt`/`eslint` failures.
- **CI** — a `production-gates.yml` job blocks it on the PR. Name the job/scanner: `backend` (`go test` + **`govulncheck`**), `backend-lint` (**golangci-lint v2**: errcheck/govet/ineffassign/staticcheck/unused), `frontend` (**`pnpm audit --audit-level high`** + eslint + vitest + `next build`), `openapi` (**Redocly** lint of `docs/api/openapi.yaml`), `security` (**gitleaks — BLOCKING**; semgrep + `trivy fs` — *advisory during rollout, intended to be promoted to blocking*), `images` (Docker build), `known-hosts-guard`, `pr-title` (Conventional-Commit PR title).
- **review** — enforced by human + cross-model PR review. Most input-validation/authz/assertion rules are review-enforced because mechanical detection is too noisy.

> **CI is ratchet-forward.** The CI gates run against the PR's changed range, so new violations are blocked without failing the build on the pre-existing backlog. `gitleaks` is the only hard blocker in the `security` job today; **promoting `trivy` (CRITICAL/HIGH) and `semgrep` to blocking is the planned ratchet** as the backlog burns down.
>
> **Known gaps (accepted as tracked debt, 2026-06-04).** (a) There is **no fuzz harness yet** for the untrusted-byte parsers (image decode HEIC/RAW/JPEG/WebP, EXIF) — SCS-054 is currently **review**-only and tracked to land Go native fuzz targets (`go test -fuzz`). (b) There is **no dedicated SCS detection hook/CI guard**; a future `scripts/guard-secure-coding` could mechanize the `hook`-marked rules. (c) The design-token sync **`check`** (`node tools/cobolt-sync-tokens.js check`) currently crashes, so the SCS-092 cascade-drift guard is not yet mechanical — see SCS-092.

---

## Part A — Authority crosswalk

Every control family below is grounded in at least one external authority. This is the evidence an auditor or a skeptical reviewer needs that "military-grade + enterprise-grade" is not a slogan.

| Family | NIST SSDF (800-218) | OWASP ASVS | CWE Top 25 | NASA Power of Ten / MISRA | NIST 800-53 / DISA STIG / SLSA | CERT |
|---|---|---|---|---|---|---|
| 1 Input validation & injection | PW.5, PW.7 | V5 | CWE-20/78/89/22/77 | — | SI-10 / APSC-DV-002510 | IDS00, STR02 |
| 2 Output encoding & redaction | PW.5 | V5.3 | CWE-79/116/532 | — | SI-11 / APSC-DV-002560 | IDS01 |
| 3 AuthN/AuthZ & least privilege | PO.5, PW.4 | V2, V4 | CWE-862/863/269/639 | — | AC-3, AC-6 / APSC-DV-000460 | — |
| 4 Secrets & key management | PO.5, PS.1 | V6.4, V2.10 | CWE-798/522 | — | IA-5, SC-12, SC-28 / APSC-DV-002330 | MSC03 |
| 5 Cryptography | PW.4 | V6 | CWE-327/328/330 | — | SC-13 / APSC-DV-002010 | MSC30, MSC32 |
| 6 Memory & resource safety | PW.6 | V5.5 | CWE-119/125/787/400/674 | P10 #1–#6 | SI-16 | MEM/ARR/INT, EXP33 |
| 7 Error handling & fail-closed | PW.5 | V7 | CWE-390/391/703 | P10 #7 | SI-11 / APSC-DV-002950 | ERR00, ERR33 |
| 8 Logging / audit / telemetry | PW.5 | V7.1 | CWE-532/117 | — | AU-2, AU-9 / APSC-DV-000010 | FIO |
| 9 Concurrency & race safety | PW.6 | V11 | CWE-362/367 | P10 #6 | — | CON/POS |
| 10 Supply chain & dependencies | PS.2, PW.4, RV.1 | V14.2 | CWE-1104/1357 | — | SR-3, SR-11 / SLSA L3 | — |
| 11 Platform / capability / tenancy | PW.4 | V1, V14 | CWE-250/276/668 | — | AC-6, CM-7 / APSC-DV-001995 | — |
| 12 Assertions & defensive coding | PW.6 | V5 | CWE-617/754 | P10 #5, #10 | — | MSC11, ERR00 |
| 13 Verification & review gates | PW.7, PW.8, RV.2 | V1.1 | — | P10 #10 | SA-11 | — |

> "P10 #N" = rule N of NASA/JPL "The Power of 10: Rules for Developing Safety-Critical Code". MISRA-style = restricted-construct discipline (no undefined/ambiguous behavior, no unbounded constructs) adapted to Go/TS.

---

## Part B — The rules

Rule IDs are stable. Never renumber; deprecate with a tombstone instead.

### Family 1 — Input validation & injection prevention

- **SCS-001 `[GO]` (review).** Validate every caller-supplied path/key before any filesystem or object-storage operation. For B2/S3 object keys derived from user input (gallery slug, asset id, filename), construct the key server-side from validated components — never concatenate raw client input into a key, and never let `..`/absolute paths escape the tenant prefix. *(CWE-22; SSDF PW.5.)*
- **SCS-002 `[GO]` (review).** The WebP/derivative pipeline shells out (`cwebp`, `exiftool`, decoders). Treat any positional argument that begins with `-`/`--` as hostile: pass a `--` separator before caller-supplied filenames/paths to every `exec.Command` site so a filename like `--output=/etc/...` can't become a flag (the CVE-2017-1000117 argument-injection class). *(CWE-88.)*
- **SCS-003 `[ALL]` (review).** Build OS commands as `exec.Command(name, args...)` argv arrays — never `sh -c` with string concatenation of untrusted input. Validate each subcommand independently. *(CWE-78; OWASP ASVS V5.)*
- **SCS-004 `[GO]` (review).** Parameterize all data-store access (`pgx`/`database/sql` bind parameters, including pgvector queries). No `fmt.Sprintf`-built SQL, no string-interpolated `WHERE`/`ORDER BY`. Dynamic identifiers (sort columns) come from an allow-list, never from raw input. *(CWE-89; ASVS V5.)*
- **SCS-005 `[ALL]` (review).** Validate at the trust boundary, allow-list not deny-list, on type/length/range/format. The Chi handler boundary (renderer→Go), webhook boundary (Razorpay/PhonePe→app), NATS message boundary, and AI-model-output→action boundary are all trust boundaries. Reject, don't sanitize-and-hope. *(CWE-20; SSDF PW.5; CERT IDS00.)*
- **SCS-006 `[ALL]` (review).** Treat all AI/model output (face detection, auto-tagging, culling, embeddings), uploaded **EXIF/metadata**, and gallery file content as **untrusted data**, never as instructions or trusted control values. Galleries are E2EE — the server never sees plaintext keys; never write code that assumes it can. *(AGENTS.md auth/storage invariants; CWE-20.)*

### Family 2 — Output encoding & redaction

- **SCS-010 `[ALL]` (review).** Redact credentials and signatures before display, log, audit, toast, error, or telemetry. **B2/S3 presigned URLs carry an access signature in the query string** — never log or surface a raw presigned URL; redact the signature first. The same applies to any `https://user:pass@host` SMTP/remote URL. *(CWE-532.)*
- **SCS-011 `[TS]` (review).** Context-correct output encoding. Rely on React/Next.js auto-escaping; **never** `dangerouslySetInnerHTML` with untrusted content (gallery names, client comments, studio branding). No DOM built by string-concatenating untrusted data. *(CWE-79/116; ASVS V5.3.)*
- **SCS-012 `[ALL]` (review).** No engine/internal path, secret, JWT, or raw credentialed/presigned URL in any user-facing error, log, audit row, preview, or telemetry. Strip internal paths and redact before the value crosses the renderer boundary. *(CWE-209.)*

### Family 3 — Authentication, authorization & least privilege

- **SCS-020 `[ALL]` (review).** Enforce authorization on the trusted side (Go), never the renderer/client. The client may *request*; the Go handler decides. **All file serving requires JWT auth — no public/unauthenticated object URLs** (AGENTS.md). *(CWE-862/863; ASVS V4.)*
- **SCS-021 `[GO]` (review).** Default-deny. Use `RequirePlatformRole` for platform-level checks and the two-tier role model; unknown roles/operations are excluded, not allowed. Enforce Postgres **RLS** where rows are tenant-scoped. *(NIST 800-53 AC-3; CWE-863.)*
- **SCS-022 `[GO]` (review).** Object-level authorization on every tenant-scoped resource: verify the caller owns/【may access】the gallery/asset/workspace before acting (no IDOR/BOLA — acting on another studio's row by guessing an id). The **BYOS wizard is enterprise-only** and must never be exposed to standard/pro tiers; admin impersonation is a deliberate, audited act, never a convenience. *(CWE-639/269; 800-53 AC-6; DISA APSC-DV-000460.)*
- **SCS-023 `[GO]` (review).** **JWT claims come only from `middleware.JWTClaimsFromContext(r.Context())`.** **Never define a local `contextKey` type in a handler package** — Go's `context.Value` matches on `(type, value)`, so a private key in a different package silently never matches the middleware's key and every authenticated route returns 401. This broke M1 across onboarding/team/workspace handlers. Test fixtures inject claims via `middleware.WithJWTClaims`. *(CWE-863; AGENTS.md "JWT Context (Non-Negotiable)".)*
- **SCS-024 `[GO]` (review).** **Email-OTP and TOTP are not interchangeable.** Email-OTP is **registration-only** (`/auth/verify-otp` from `/activate`); `/auth/login` is password-only and returns `403 account not activated` for unverified accounts. TOTP (RFC 6238) is the opt-in **login** step-up after password (`/auth/login` → `{mfa_required, mfa_token, challenge:"totp"}` → `/auth/verify-totp`). A handler that accepts either one-time code for login is forbidden — it would reintroduce the email-OTP-on-login path this rule prohibits. *(CWE-287/308; AGENTS.md "Auth Model".)*

### Family 4 — Secrets & key management

- **SCS-030 `[ALL]` (hook · CI).** No hardcoded secrets, private keys, API tokens, or cloud credentials in source, config, tests, or fixtures (B2, SMTP/SecureServer, Razorpay/PhonePe, Google OAuth, `PLATFORM_SETTINGS_KEK`). `.githooks/pre-commit` blocks `PRIVATE KEY` blocks, `AKIA…` keys, and `.env*`/`*-credentials*` by path; the `security` CI job runs **gitleaks (blocking)** over full history. *(CWE-798; SSDF PS.1; ASVS V6.4.)*
- **SCS-031 `[GO]` (review).** Config resolution order is fixed: **`platform_settings` DB table → environment variable → disable the feature with a warning**. Never substitute a "dev default" secret; never create a parallel secret store. `.env.cobolt` holds local env and is **gitignored**. Secrets in `platform_settings` are encrypted at rest; **TOTP secrets are envelope-encrypted with `PLATFORM_SETTINGS_KEK`** and recovery codes are **bcrypt-hashed**. Never silently downgrade a protected secret to plaintext without a visible policy decision. *(800-53 IA-5/SC-12/SC-28; AGENTS.md "No Hardcoded Credentials"; `docs/security/procedures/key-management.md`.)*
- **SCS-032 `[ALL]` (review).** Keep secrets out of process args, URLs, and logs — prefer env/file/stdin passing over argv. SMTP passwords never appear in source, docs, logs, or chat (a `535 Authentication Failed` is a provider credential rejection, diagnosed with `smtp-smoke`, not by logging the password). *(CWE-214/532.)*

### Family 5 — Cryptography

- **SCS-040 `[ALL]` (review).** Use only vetted, modern primitives. **Approved:** AES-256-GCM (symmetric/at-rest), bcrypt or Argon2id (password & recovery-code hashing), TOTP/HMAC-SHA1 *only* within RFC 6238 (the standard mandates it; not for general hashing), envelope encryption via `PLATFORM_SETTINGS_KEK`, TLS 1.2+ with certificate validation, SHA-256+ for content/dedup fingerprints. **Banned for security use:** MD5, SHA-1 (outside the RFC-6238 TOTP construction), DES/3DES, RC4, ECB mode, and any custom/roll-your-own crypto. A primitive that is neither approved nor banned (e.g. AES-CBC without an authenticated mode, RSA PKCS#1 v1.5, a bare unsalted hash for passwords) is a review-gated decision, not a default. *(CWE-327/328; SSDF PW.4; CERT MSC30; DISA APSC-DV-002010; FIPS 140-3; NSA CNSA 2.0.)*
- **SCS-041 `[ALL]` (review).** Never disable TLS/certificate verification. Banned: Go `tls.Config{InsecureSkipVerify: true}`; TS `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`. *(CWE-295; 800-53 SC-8.)*
- **SCS-042 `[ALL]` (review).** Cryptographic randomness from a CSPRNG for every token, key, IV, nonce, salt, OTP code, or session/share token: Go `crypto/rand` (never `math/rand`); TS `crypto.getRandomValues` (never `Math.random()`). A SHA-1/MD5 dedup fingerprint on a *security* boundary is upgraded to SHA-256. *(CWE-330/338; CERT MSC32.)*

### Family 6 — Memory & resource safety

- **SCS-050 `[GO]` (review).** RawDrive is memory-safe Go by default. Any use of the `unsafe` package or `cgo` requires an adjacent `// SAFETY:` comment justifying every invariant relied upon; prefer the safe abstraction. `unsafe`/`cgo` is a reviewed exception, not a default. *(NASA P10 #1; CERT; CWE-119/787.)*
- **SCS-051 `[ALL]` (review).** Bound every loop over untrusted input with an explicit cap; no unbounded recursion in request/worker hot paths. Reject input that would drive unbounded iteration (e.g. a gallery with an attacker-claimed asset count). *(NASA P10 #2/#4; CWE-674/834.)*
- **SCS-052 `[ALL]` (review).** Cap resource consumption from untrusted sources. **Enforce upload size limits and image dimension/pixel caps before decode** — a crafted HEIC/RAW/JPEG/WebP is a decompression-bomb vector (memory exhaustion). No unbounded `io.ReadAll` on a network/B2/NATS/upload body; bound buffers; set timeouts on `cwebp`/`exiftool` subprocesses. *(NASA P10 #3; CWE-400/789; AGENTS.md upload hot-path rules.)*
- **SCS-053 `[ALL]` (review).** Check integer arithmetic that can overflow on size/length/index math (Go: validate before allocating from a claimed length; TS: explicit bounds). *(CWE-190; CERT INT.)*
- **SCS-054 `[GO]` (review → CI).** Every parser that consumes **untrusted bytes** — uploaded image bytes (HEIC/RAW/JPEG/WebP), EXIF/metadata, upload screening, webhook/NATS payloads, config/manifest files — must get a Go native fuzz target (`go test -fuzz`), exercised on a scheduled CI run, with reproducible crash inputs committed as `testdata` seeds. **Current state: no fuzz harness exists yet (tracked debt, §0.4)** — this rule is review-enforced today and the image/EXIF decode path is the first target to land. *(NASA P10 #2/#3; CWE-20/125/787; SSDF PW.8.)*

### Family 7 — Error handling & fail-closed

- **SCS-060 `[ALL]` (CI · review).** No silent failures. **Go:** never `_ = err`-discard or empty-`if err != nil {}` that loses the signal — handle, wrap (`fmt.Errorf("...: %w", err)`), or return it. `errcheck` (in the `backend-lint` gate) catches the common cases; the rest is review. **TS:** no empty `catch`; surface or log with cause. *(CWE-703/391; ASVS V7; CERT ERR00.)*
- **SCS-061 `[ALL]` (review).** Security-relevant operations fail **closed**. On error/timeout/ambiguity, deny: JWT/role/ownership check failure → 401/403; storage misconfiguration → FATAL exit (`STORAGE_DRIVER` ≠ `s3` is a hard fail, never a local-disk fallback); worker claim/audit-append failure → do not perform the side effect. Never fail-open on an auth/policy/crypto check. *(800-53 SI-11; DISA APSC-DV-002950; AGENTS.md "No Local Storage".)*
- **SCS-062 `[GO]` (review).** Return typed, redacted errors to the renderer (`{ error: "<kind>" }`), not raw internal error strings. Redact internal paths/secrets before the error crosses the API boundary. *(CWE-209.)*

### Family 8 — Logging, audit & telemetry hygiene

- **SCS-070 `[GO]` (review).** Audit security-relevant events with enough context to investigate and **no sensitive payloads**: auth decisions, role/permission changes, admin impersonation, `platform_settings`/storage-config changes, payment events (Razorpay/PhonePe), and integrity-relevant actions. *(800-53 AU-2; ASVS V7.1.)*
- **SCS-071 `[GO]` (review).** Audit variant/event names must describe the **actual** operation performed — never reuse an unrelated event type for a different action (it corrupts the audit trail). Keep the security audit path append-only where the architecture supports it. *(800-53 AU-9.)*
- **SCS-072 `[ALL]` (review).** Never log secrets, tokens, JWTs, credentialed/presigned URLs, full PII (client emails/phones), or internal paths. See SCS-010/SCS-012. *(CWE-532/117.)*

### Family 9 — Concurrency & race safety

- **SCS-080 `[GO]` (review).** Eliminate TOCTOU: don't check-then-act on a path/row/resource across a gap an attacker can exploit; operate on the resolved handle / use a single atomic DB statement. *(CWE-367; CERT POS.)*
- **SCS-081 `[GO]` (review).** Shared mutable state crosses goroutines only through channel/mutex-guarded, `-race`-clean code; security-relevant counters and session/quota state live in the authority layer (Go + DB), not in renderer state a refresh can reset. Run `go test -race` on concurrency-touching changes. *(CWE-362.)*
- **SCS-082 `[GO]` (review).** **Background workers that claim DB jobs MUST use an atomic claim** — `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) … RETURNING` — never list-pending-then-mark-processing in two steps (concurrent workers duplicate work). Applies to download, thumbnail/WebP, AI, email, and webhook queues. **Payment webhooks (Razorpay/PhonePe) and upload dedup must be idempotent** — safe to receive twice. *(CWE-362/367; AGENTS.md "Background Workers / Queues".)*

### Family 10 — Supply chain & dependencies

- **SCS-090 `[ALL]` (review).** No pipe-to-shell installs (`curl … | sh`, `wget … | bash`, `iwr … | iex`) in code, scripts, Dockerfiles, or CI. Fetch, verify, then run. *(SLSA; CWE-494.)*
- **SCS-091 `[ALL]` (CI · review).** Pin dependencies with integrity-checked lockfiles committed: `go.mod` + **`go.sum`** (Go), **`pnpm-lock.yaml`** (frontend). New dependencies are reviewed for maintenance, license, and known CVEs before adoption. *(SSDF PW.4/PS.2; SLSA L3; CWE-1104/1357.)*
- **SCS-092 `[ALL]` (review).** Reproducible / regenerated artifacts are produced by their generator, **never hand-patched**: `design-tokens.json` → `node tools/cobolt-sync-tokens.js sync` (regenerates `frontend/src/app/globals.css`, `frontend/src/lib/tokens.ts`, `.stitch/DESIGN.md`); `docs/api/openapi.yaml` stays in sync with handlers. **Cautionary precedent (2026-06-04):** the light-theme `--border-focus` in generated `globals.css` drifted from its `design-tokens.json` source (an invisible focus ring), and the cascade's `cobolt-sync-tokens.js check` guard currently crashes — so hand-editing generated token CSS, or skipping the sync, silently breaks the cascade. Edit the source and regenerate; repair the `check` guard so drift fails closed. *(SLSA; 800-53 SR-3; AGENTS.md "Design Token System".)*
- **SCS-093 `[ALL]` (CI).** Dependency risk is gated automatically: **`govulncheck`** (Go, in the `backend` gate), **`pnpm audit --audit-level high`** (in the `frontend` gate), `trivy fs` (in `security`, advisory→to-be-promoted-blocking), and **Dependabot** update PRs for `gomod`/`npm`/`github-actions`. A new or bumped dependency that fails the advisory/license bar blocks the merge once the gate is promoted to blocking. *(SSDF PW.4/RV.1; CWE-1104/1395; SLSA.)*
- **SCS-094 `[ALL]` (CI · review).** Release artifacts (the Docker images deployed to Hostinger via `npm run deploy:prod`) are scanned and attributable: `images` job builds them, `trivy` scans the produced bundle, and one release pins one engine/image revision. **SBOM (CycloneDX) + signed build-provenance attestation are a roadmap item** (not yet shipped) — until then, image scanning + lockfile pinning + the guarded deploy are the floor. Never deploy directly to the DB node (`.46`); never bypass `deploy/scripts/deploy-prod.sh`. *(SLSA L3; 800-53 SR-3/SR-4; SSDF PS.3.)*

### Family 11 — Platform, capability & tenant isolation

- **SCS-100 `[GO]` (review).** All OS / storage / DB / process / network authority lives in Go handlers and services. The renderer is never trusted. New side-effecting endpoints route through the authenticated Chi handler chain (`JWTClaimsFromContext` + role/ownership checks); there is no `STORAGE_DRIVER=local` path and no public object URL. *(AGENTS.md; CWE-250/668.)*
- **SCS-101 `[ALL]` (review).** Least capability: the WebP/derivative subprocesses (`cwebp`, `exiftool`) run with bounded time/memory and validated inputs; E2EE galleries decrypt **client-side only** (the server holds no plaintext content keys); image decode runs inside the container with resource caps. Capability/permission expansion is a security-relevant change requiring justification. *(800-53 CM-7/AC-6; DISA APSC-DV-001995.)*
- **SCS-102 `[GO]` (review).** New Tauri-equivalent surface here = **new Chi routes**. A new endpoint that exposes storage/auth/DB/payment/admin behavior gets an HTTP handler-surface test (`net/http/httptest`) that drives the **real route + middleware** (auth, role, ownership), not just the service beneath it. *(SSDF PW.7.)*

### Family 12 — Assertions & defensive coding

- **SCS-110 `[ALL]` (review).** Assert preconditions, postconditions, and invariants at boundaries (validate request structs on entry; check invariants before side effects). Validation has a defined failure action (reject/deny), never a no-op. *(NASA P10 #5; CWE-617/754; CERT MSC11.)*
- **SCS-111 `[ALL]` (CI · review).** Validate return values of calls that can fail; an ignored Go `error` return is a defect (`errcheck`, see SCS-060). *(NASA P10 #7.)*
- **SCS-112 `[TS]` (review · CI).** Restrict ambiguous constructs: **no `any`** — model invariants in the type so illegal states don't compile; no implicit lossy coercions on security-relevant values; smallest possible variable scope. Frontend lint also enforces **React-Compiler purity** (use `useSyncExternalStore` for time/mounted, not impure reads in render). *(MISRA-style; NASA P10 #6/#9; CWE-704.)*

### Family 13 — Verification & review gates

- **SCS-120 `[ALL]` (review · CI).** Security-relevant changes get cross-model review; same-model self-review is a weaker signal. Land every change via **`npm run ship`** (branch → Docker test → Conventional commit → PR → auto-merge) — **never commit/push to `main` directly** (a force-push to `main` once caused a production incident; `.githooks/pre-push` now blocks it). All CI gates (§0.4) must pass before merge. *(SSDF PW.7/PW.8/RV.2; SA-11.)*
- **SCS-121 `[ALL]` (review).** When fixing a class-of-vulnerability, run the **sister-site sweep**: grep for every other occurrence of the same pattern and record *exploitable / mitigated / not-applicable* for each before shipping. (The `rawdrive-fix` skill's RCA "blast radius" dimension operationalizes this.) *(SSDF RV.1.)*
- **SCS-122 `[ALL]` (CI · review).** Keep `golangci-lint` (backend) and `eslint` (frontend) at **zero new warnings** for security-relevant lints; never suppress a security lint (`//nolint`, `// eslint-disable`, `t.Skip`, `it.skip`) to go green without an SCS-WAIVER. A test that lost its assertions or was reduced to a tautology is **not** passing. *(NASA P10 #10.)*
- **SCS-123 `[ALL]` (CI).** SAST + secret + dependency scanning run in the `security` gate: **gitleaks (blocking)** today; **semgrep** and **`trivy fs`** advisory during rollout and **planned for promotion to blocking**; `known-hosts-guard` protects the pinned SSH host keys; the `openapi` gate keeps the API contract honest. **CodeQL dataflow analysis (Go + TS) is a roadmap addition** to complement the regex-level scanners with taint coverage. *(SSDF PW.8; 800-53 SA-11; CWE-1395.)*

---

## Part C — Code-quality rubric (the per-step gate)

Part B is the *security* floor. Part C is the *quality* gate that runs **at the moment of writing** — a per-step / per-file pass/fail an implementer (human or agent) self-applies before a change is "done", and a reviewer applies before approving.

> **Why a gate, not background reading.** Standards an agent treats as "reference" get skipped under load. Phrasing each dimension as **"block the step if this line fails"** converts the standard into an active check at write-time. Part C is a small **always-on core** (C.1) + an **extended set** (C.2) + a **situational tail** (C.3) injected only when the diff touches it.
>
> **Overlap rule (no re-litigation).** Where a dimension's "Maps to" column names an `SCS-NNN`, that Part B rule is authoritative; Part C only restates it as a write-time line. Deviation goes through §0.3, never a thread. Dimensions marked *quality-only* are net-new quality obligations.

### C.1 The block-the-step core (always on)

Block the step if any line fails. Cite what you reused / why a new thing was needed.

| Dimension | The enforceable check | Maps to |
|---|---|---|
| **Reuse** | Search for an existing component/util/type/hook/handler **before** creating one (e.g. `frontend/src/lib/seo.ts`, `GlassIconButton`, the icon registry, the batch gallery-asset endpoint). Name what you reused — or justify why a new one was needed. The forced *search-first, cite-what-you-found* step is what prevents duplication. | quality-only (cf. SCS-092) |
| **Error handling** | No swallowed errors. **Go:** no `_ = err`, no empty `if err != nil {}`, no `panic` in request paths — return a wrapped/typed error and fail closed. **React/TS:** no empty `catch`; surface or log with cause. | SCS-060, SCS-061, SCS-062 |
| **Error/empty/loading states** | Every new React route/feature subtree handles **loading + error + empty**, not just success; no white-screen on a thrown error. | quality-only |
| **Validation** | Validate all untrusted input at the trust boundary (request body, query, webhook, NATS, model/EXIF output) before use — allow-list, on type/length/range/format. | SCS-005, SCS-006 |
| **Design tokens (3-tier rule)** | No hardcoded colors/spacing/typography/shadows/radii; **no Tailwind primitives** (`bg-neutral-100`, `text-gray-500`, `shadow-lg`); **no arbitrary values** (`w-[245px]`, `text-[#3B82F6]`). Semantic tokens only; edit `design-tokens.json` then run the sync tool — never hand-edit `globals.css`/`tokens.ts`. | quality-only (cf. SCS-092) |
| **Types** | **No `any`.** Model invariants in the type so illegal states don't compile. | SCS-112 |
| **Boundaries & authority** | OS/storage/DB/process/network authority only in Go handlers (JWT + role + ownership) — never the renderer. No secrets/PII/credentialed-or-presigned URLs in logs. JWT claims only via `JWTClaimsFromContext`. | SCS-100, SCS-023, SCS-072, SCS-010 |
| **Icon buttons & a11y primitive** | Icon actions use **`GlassIconButton`** with a required `label`, ≥44px touch target, `focusRing` token — never a raw `<button>` + inline SVG. Renders across all three themes (`liquid-glass`, `liquid-glass-dark`, `midnight`) with no theme-specific overrides. | quality-only |
| **Consistency** | Match the surrounding file's naming/structure/idioms (Go package-lowercase/Exported-PascalCase; TS PascalCase named exports, `useXxx` hooks, kebab-case routes). No dead code; no `TODO`/`FIXME` left behind. | quality-only |

> **Both sides of the trust boundary.** "Error/empty/loading states" is renderer-side; it is paired deliberately with the Go `error`/no-`panic` rule (SCS-060). Naming both sides stops a change that hardens React while leaving the Go core free to `panic`.

### C.2 Extended checks (apply to every non-trivial change)

| Dimension | The enforceable check | Maps to |
|---|---|---|
| **Tests beyond happy path** | Each unit covers **error + edge + boundary**, not just success. Use **`tests/photos/`** real JPEGs for upload/gallery tests (handle filenames with spaces/parens). New Chi endpoint → real handler-surface test (`httptest` through middleware). Reproduction/behavioral test written **before** the fix (TDD-first). | SCS-102, SCS-110, SCS-111 |
| **Observability** | New failure paths emit structured logs/metrics — but never log secrets, tokens, JWTs, credentialed/presigned URLs, full PII, or raw image/EXIF content. | SCS-070, SCS-072 |
| **Concurrency / async safety** | Worker DB claims are atomic (`FOR UPDATE SKIP LOCKED`); payment webhooks idempotent; no blocking on the request path without a timeout; shared state guarded; `go test -race` clean. No TOCTOU. | SCS-082, SCS-080, SCS-081, SCS-052 |
| **Accessibility (WCAG AA)** | New UI is keyboard-reachable, focus-visible (correct on dark surfaces too), has semantic roles + labels, ≥44px targets — meets the WCAG AA bar across all three themes before merge. | quality-only (cf. GlassIconButton in C.1) |
| **Performance budget** | No gallery N+1 (use the batch `?include_assets=true` hydration, not `Promise.all(ids.map(getAsset))`); window/virtualize large filmstrips/grids; no double full-file upload reads / in-memory "chunked" hashing; bounded loops/allocs. | SCS-051, SCS-052; AGENTS.md hot paths |
| **Docs / contract** | Exported Go functions, Chi/IPC routes, and trait/interface methods carry a doc comment stating **intent + invariants**; new/changed endpoints update `docs/api/openapi.yaml` (the `openapi` CI gate is blocking). | quality-only (cf. SCS-092) |

### C.3 Situational checks — inject only when the change touches it

| When the diff touches… | …enforce |
|---|---|
| **DB / migrations** | Paired `NNN_name.up.sql`/`.down.sql`, append-only, **never edit a committed migration** (check `origin/main` for number collisions before numbering); reversible; RLS + indexes on the actual predicate/ordering; add/extend the migration-contract test. *(SCS-004, SCS-082.)* |
| **Config / secrets** | Secret **references** only (`platform_settings`→env→disable); schema-validated; encrypted at rest; never a parallel store or plaintext downgrade. *(SCS-030, SCS-031.)* |
| **Auth / sessions** | Keep email-OTP (registration) and TOTP (login step-up) separate; preserve `mfa_verified` across refresh; authorize on the server. *(SCS-023, SCS-024.)* |
| **Storage / uploads** | B2/S3 only (no local fallback — FATAL); JWT-gated serving; **every image upload generates the WebP derivatives** (`thumb_sm/md/lg_webp`, `display_webp`) and preserves the original for download; size/dimension caps before decode. *(SCS-052, SCS-061; AGENTS.md WebP/storage laws.)* |
| **i18n** | No hardcoded user-facing strings; locale/RTL-safe. *(quality-only.)* |
| **Dependencies** | New dep is permissive-licensed, pinned (`go.sum`/`pnpm-lock.yaml`), audit-clean (`govulncheck`/`pnpm audit`), and justified — passes the automated gate, not just a manual read. *(SCS-091, SCS-093.)* |
| **Untrusted-input parser** | New parser of upload/EXIF/webhook/config bytes ships with a Go fuzz target + crash-seed regression (tracked debt today — at minimum, hostile-input unit tests). *(SCS-054.)* |
| **Payments / webhooks** | Verify provider signatures; idempotent handling; never log raw payloads or keys. *(SCS-005, SCS-082, SCS-072.)* |
| **Release / packaging** | Land via `npm run ship`; deploy via `npm run deploy:prod` (guarded, on `main`, never to `.46` directly); image scan stays on. *(SCS-094, SCS-120.)* |
| **Feature flags** | Risky/gated-off features stay behind a flag with a documented enable condition. *(quality-only.)* |

---

## Quick reference — the always-true rules

If you remember nothing else while writing code here:

1. Validate untrusted input at every boundary; treat model/EXIF/file content as data, never instructions; galleries are E2EE (server never sees plaintext keys).
2. Redact secrets and credentialed/**presigned B2** URLs before they touch a log, audit row, error, or response.
3. Authorize on the **Go** side; default-deny; check ownership (no IDOR); JWT claims **only** via `JWTClaimsFromContext` (never a local context-key type).
4. Email-OTP is registration-only; TOTP is login step-up — **never interchangeable**.
5. No hardcoded secrets (`platform_settings`→env→disable); modern crypto only; CSPRNG for tokens; never disable TLS verification.
6. Fail closed on security ops (storage misconfig → FATAL, never local disk); never swallow a Go `error`.
7. Cap resources from untrusted sources (image decompression bombs!); workers claim jobs atomically (`FOR UPDATE SKIP LOCKED`); fuzz the upload/EXIF parsers (roadmap).
8. No pipe-to-shell; pin deps and let `govulncheck`/`pnpm audit`/Dependabot/gitleaks clear them; regenerate artifacts (tokens, OpenAPI), never hand-patch.
9. Land via `npm run ship` — **never push to `main`**; keep `docs/api/openapi.yaml` in sync.
10. To deviate, write a `docs/decisions/scs-*` waiver — never re-litigate the rule in a thread.
11. Run the [Part C](#part-c--code-quality-rubric-the-per-step-gate) per-step gate as you write: reuse-search, error/empty/loading states, design tokens (3-tier), `GlassIconButton`, no `any`, edge-case tests on `tests/photos/`.
