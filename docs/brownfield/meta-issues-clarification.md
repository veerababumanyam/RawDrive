# Brownfield Meta-Issues — Clarification

> **Context:** `docs/issuestofix.md` listed 9 items as "hard blockers"
> and "soft blockers" against a canary-readiness assessment. Four of
> those items are *not* code bugs — they are meta-observations about
> prior tooling runs, pipeline state, and session artifacts. This file
> separates those from the real code issues so future readers do not
> misdiagnose them as actionable bugs.
>
> **Owner:** brownfield fix wave, 2026-04-11.
> **Scope:** items #2, #3, #4 from issuestofix.md, plus a note on the
> session-hook artifact that looks like item #4.

## TL;DR

| Issuestofix item | Real cause | Action |
|---|---|---|
| #2 — "Master assessment is 81% phantom" | A prior `cobolt-review` run produced hallucinated citations. That is a known failure mode of the review pipeline under certain configurations — it is NOT evidence that any reviewed code is broken. | Re-run `cobolt-review M1` with the phantom-filter step enabled. The finding tracker will carry forward only citations that pass phantom verification. |
| #3 — "Readiness gate failing 6 of 10 checks" | The readiness gate depends on artifacts produced by earlier pipeline stages (`G5 Core Artifacts`, `G7 P3 Accuracy`, `G9 Forensic Audit`, `G10 Deterministic Finding Coverage`). Those stages were never run on this branch, so their outputs are absent — the gate is correctly reporting "not yet attempted," not "broken." | Run the full pipeline on this branch before using the readiness gate as a ship signal. |
| #4 — "Pipeline has not actually executed any milestone" | True at the moment the session starts, but **not** because the branch is broken. The `currentStage=S0` reading in `cobolt-state.json` is the value written by the CoBolt session-start hook, which re-initializes state when it detects a new session. The pre-session committed state was `M17-hardening-wave-5` / `v0.0.40`. | Two independent facts to keep straight: (a) this branch has never been through a full `cobolt-build → cobolt-review → cobolt-audit` loop; (b) the `S0` reading in the working-tree state file is a session artifact, not a regression of prior work. When starting real pipeline work, `git restore cobolt-state.json` first, or tell the hook to treat the committed state as authoritative. |

## Why this file exists

The master assessment these items came from explicitly warned future
readers that 81% of its findings were phantoms. That warning is
load-bearing: it means any remediation decision based on the other
19% of findings needs independent verification of the cited code
before action.

Items #2 / #3 / #4 are exactly the items that fail that verification
— not because the underlying phenomena are imaginary, but because
they are not code bugs at all. They are observations about which
pipeline stages have run and which have not.

Treating them as code bugs would waste a fix wave. Treating them as
"pipeline-state observations" points to the real action: decide
whether to re-run the pipeline on this branch, and in what mode.

## Item-by-item detail

### Item #2 — Phantom rate in the master assessment

The file `23-master-assessment-verification.json` reportedly verified
3 citations and rejected 13 because the cited files do not exist. The
rejected files include names like `00-source-file-manifest.json`,
`routes_*.go`, `p0-sbom-backend.json`, `totp.go`,
`handler/chunked_upload.go`, `storage/local.go`, and `go.mod`.

Several of those filenames **do** exist in the current tree (e.g.
`backend/internal/handler/chunked_upload.go`) but were reported as
absent by the verification step. That is the classic signature of a
stale assessment: the cited code moved or was renamed between the
scan that produced the finding and the verification step that
checked it.

**The fix is not in the code; the fix is in the tooling run.** Re-run
`cobolt-review` against the current branch with phantom-filter
enabled. The 23-reviewer wave will re-produce citations against the
current filesystem; the phantom filter will strip any finding whose
cited file does not exist at that moment; and the finding tracker
will pick up only survivors for the fix wave.

If phantom-filter is still producing >50% strip rate after that
re-run, the problem is worth investigating as a review pipeline bug,
not a source-code bug.

### Item #3 — Readiness gate failing 6 of 10 checks

The failing gates were:
- G3 Health Grade — `health-score.json` not computed
- G5 Core Artifacts — 1/4 present (25%)
- G6 Runtime Truth — only 3 commands executed (and, per
  issuestofix.md item #10, one was a broken `npm.cmd` runner)
- G7 P3 Accuracy Report — status=failed
- G8 Evidence Index Integrity — `19-evidence-index.json` has no
  entries
- G9 Forensic Audit — file not found
- G10 Deterministic Finding Coverage — domain-liveness missing

Every one of those is an artifact produced by a specific earlier
stage. If you run:
- `cobolt-review M{n}` → produces the 23-reviewer findings, the
  coverage metrics, the evidence index entries
- `cobolt-audit M{n}` → produces the forensic audit and P3 accuracy
  report
- `cobolt-fix M{n}` → produces the RCA document consumed by the
  health grade calculation

…you get the readiness gate inputs as a side effect.

The gate is *correctly* reporting "not yet attempted." It is not
broken. It is not evidence that the branch is unshippable. It is
evidence that the branch has not been through the pipeline on this
particular workstation.

**The fix is to run the pipeline.** A natural order for this branch:

1. `git restore cobolt-state.json` to discard the session-hook reset.
2. `cobolt-review M17` (the last committed milestone state was
   M17-hardening-wave-5).
3. `cobolt-audit M17 --autonomous` to chain through to completion.
4. Re-evaluate the readiness gate. The only gate that should still
   fail at that point is G6 if the `npm.cmd` runner bug (item #10)
   has not been addressed — that one is a real tool bug and worth
   tracking.

### Item #4 — Pipeline has not executed any milestone

Two independent statements collapsed into one:

(a) **Historical fact about this branch.** The brownfield fix wave
    has been landing hand-written commits (security hardening, test
    hygiene, SMTP transport, NATS publisher) directly. The CoBolt
    pipeline was not used to produce those commits. This is
    intentional — they were targeted fixes for known issues, not
    milestone deliverables — but it means there is no
    `_cobolt-output/*/build/*` or `_cobolt-output/*/review/*` on
    disk *from* the pipeline.

(b) **Session artifact about `cobolt-state.json`.** The committed
    state file was `M17-hardening-wave-5` at version `0.0.40`. When
    the CoBolt session-start hook runs on a clean session, it
    detects a new session, rewrites the state file to its current-
    version defaults (`currentStage: "S0"`, `version: 0.10.1`,
    tasksCompleted: [], etc.), and marks the prior state as
    consumed. The rewritten file is **not** a ground-truth reading
    of where the branch is — it is a reset point the hook uses to
    begin a fresh session.

    Reading the working-tree state file after a session start and
    concluding "this branch has never shipped anything" is a
    misdiagnosis.

**The fix is twofold:**

1. Before writing new pipeline output to disk, always `git restore
   cobolt-state.json` first, or run the skill that consumes the
   state file to force it to re-read the committed snapshot.

2. When reading prior state for forensic purposes, read
   `git show HEAD:cobolt-state.json`, not the working-tree file.
   The working-tree file is session-local.

## Operator-facing verification checklists

These are the manual steps that prove the claims in the code-level
fix commits (ISSUE-002 SMTP, ISSUE-003 NATS) hold against *real*
external infrastructure rather than just the compose stack. They are
intentionally one-time operator procedures, not automated tests,
because they consume real credentials.

### SMTP end-to-end verification against a real provider

Prerequisites:
- A Postmark, SES, or Mailgun account with a verified sending
  domain and API credentials.
- An inbox on a domain you control (NOT an @example.com address).
- The RawDrive backend running with the real provider's env vars
  (not Mailpit).

Steps:
1. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`,
   `SMTP_FROM` to the real provider values in `.env.cobolt`.
2. Boot the backend. Watch for `email:` log lines indicating
   `LoadSMTPConfig` resolved a non-nil config.
3. From a test client (curl or Postman), call `POST /auth/register`
   with a real email address you own.
4. Verify the OTP email lands in that inbox within 30 seconds.
5. Verify the email passes DKIM (check the message headers in
   Gmail "Show Original" or equivalent).
6. Optionally: bounce the server and repeat to confirm no boot-time
   credential caching.

Record the provider name, the envelope sender, and the DKIM status
in `docs/brownfield/ISSUE-002-verification.md` as an operator
attestation (not committed automatically — requires a human).

### NATS real-broker restart-survival verification

The in-repo test `TestNATSRealPublisher_Durability` proves
cross-connection persistence using `GetLastMsg`. This verifies the
same invariant a container restart would verify, faster and without
race conditions. For the stricter "actually bounce the container"
check:

1. `docker compose up -d nats`
2. Run `TestNATSRealPublisher_Ack` to publish a message with a
   unique subject:
   ```bash
   go test ./tests/integration/... -run TestNATSRealPublisher_Ack -v
   ```
3. Record the subject from the test output.
4. `docker compose restart nats`
5. Wait ~5 seconds for the container to re-ack JetStream.
6. Open a fresh NATS CLI session:
   ```bash
   docker exec -it cobolt-nats nats sub '<exact subject from step 3>'
   ```
   …and immediately query stream contents:
   ```bash
   docker exec -it cobolt-nats nats stream view RAWDRIVE_EVENTS --subject '<subject>'
   ```
7. Confirm the message is still there with identical payload.

If the stream is empty after restart, check that
`events.NewNATSPublisher` is creating the stream with
`Storage: nats.FileStorage` (it is — see
`backend/internal/events/nats_publisher.go:86`), and check that
`docker-compose.yml` mounts the JetStream data volume.

## Related real-code fixes (separate from this file)

These are the commits that landed in the same brownfield fix wave as
this document. They address the *code* issues from
`docs/issuestofix.md`. Read them alongside this file for the full
picture:

- `test(backend): skip-on-unreachable hygiene…` — ISSUE-009 (dirty
  test tree) and the skip-on-unreachable convention now extended to
  the `tests/integration` and `tests/m{5,6,13}` packages.
- `test(events): add NATS real-broker smoke + durability test` —
  ISSUE-003 (NATS publisher) evidence uplift.
- `test(email): add SMTP real-delivery smoke test via Mailpit` —
  ISSUE-002 (SMTP transport) evidence uplift.
- `docs(api): hand-written OpenAPI 3.1 spec for canary-critical
  surface` — ISSUE-005 (OpenAPI expansion).

ISSUE-006 (MFA mount gate FATAL negative test) was verified as
already shipped in an earlier commit — the walker is at
`backend/internal/middleware/mfa_mount_validation.go:60`, the
negative test is at
`backend/internal/middleware/mfa_mount_validation_test.go:42`
(`TestValidateMFAMountOrder_MissingJWTAuthFails`), and the FATAL
wiring is at `backend/cmd/api/main.go:1220`. `go test` and
`go build` both pass on the current branch.

ISSUE-001 (OAuth client_secret in git history) is tracked separately
in `docs/brownfield/issue-001-remediation-plan.md` and requires
explicit operator authorization before execution — the fix involves
destructive git history rewrites and external credential rotation
that cannot be automated by a fix agent.
