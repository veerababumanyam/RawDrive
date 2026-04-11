# ISSUE-001 — Credentials in git history (remediation plan, v2 — broadened scope)

> **Status:** ⛔ **HALTED — awaiting explicit operator authorization.**
> The steps below are prepared but NOT executed. Every action in
> Phases 2 and 3 is destructive or hard-to-reverse (history rewrite,
> force-push over a shared branch, external credential rotation).
> Running any of them without coordination will lose work, break
> co-workers' checkouts, or leak ship-critical state.
>
> **Owner:** human operator (not an automated fix agent).
> **Branch in progress:** `brownfield/fix-12-issues`.
> **Prepared:** 2026-04-11, brownfield fix wave.
> **Scope broadened:** 2026-04-11 (see §"Scope expansion" below), after
> `docs/brownfield/brownfield-fix-wave-review.md §2.1` found that the
> original plan only covered the Google OAuth JSON file and did not
> account for the `.env` blob — which contains 11+ additional live
> credentials including Razorpay **LIVE** keys, R2 secrets, PhonePe
> prod client_secret, and a second Google OAuth client.
>
> **Read this before running anything:** the v1 plan below is
> complete for the Google JSON file alone. Before Phase 2 runs, the
> operator MUST also complete every row in §"Phase 1 — Rotation
> checklist (v2, broadened)" and broaden the Phase 2 filter-repo
> invocation to include `.env`. Running v1 as originally written
> would remove the Google JSON from history while leaving every
> other leaked credential reachable at `553febb:.env` and
> `4d0c13d:.env`.

## Current state (verified 2026-04-11, broadened 2026-04-11)

### Leaked blob 1 — Google OAuth JSON file

- Commit `3889908` ("security(brownfield): remove committed OAuth
  client_secret + harden .gitignore [ISSUE-001]") removed the file
  from the working tree and added the pattern to `.gitignore`.
  ✅ Working tree is clean.
- Commit `553febb` ("Initial project state — planning artifacts,
  design tokens, infra manifest") **still contains the file blob**
  at path `gen-lang-client-0225070656-9e42fd6f0ba8.json`.
  ❌ Anyone with repo read access can run:
  ```bash
  git show 553febb:gen-lang-client-0225070656-9e42fd6f0ba8.json
  ```
  …and recover the full JSON payload including the OAuth
  `client_secret`.
- Confirmed via `git cat-file -e 553febb:gen-lang-client-0225070656-9e42fd6f0ba8.json`
  (exit 0 = blob is reachable).
- Leaked artifact: a Google OAuth web-client credential JSON file.
  GCP project identifier: `gen-lang-client-0225070656`.
  - `client_id`: `1057612383675-qg1horr2ng0pu5tnbbu3c1m5jbq8pnir.apps.googleusercontent.com`
  - `client_secret`: `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` (compromised)

### Leaked blob 2 — `.env` file (added in v2)

Also discovered during review: the `.env` file was tracked in two
commits and contains a second, independent set of live credentials.

- Added in `553febb` (Initial project state).
- Deleted in `4d0c13d` ("feat: admin dashboard hardening + schema
  alignment"), which replaced the tracked `.env` with `.env.example`
  for secrets hygiene. That commit did NOT remove the blob from
  history; it only stopped tracking the file going forward.
- Both commits still contain the blob:
  ```bash
  git cat-file -e 553febb:.env   # exit 0
  git cat-file -e 4d0c13d:.env   # intermediate, also reachable
  ```
- Contents (verified 2026-04-11 via `git show 553febb:.env`):

  | Credential | Value fragment (for rotation lookup — not for distribution) |
  |---|---|
  | `R2_ACCOUNT_ID` | `1b62424aa3b6d960f5c0d2588eb576f5` |
  | `R2_ACCESS_KEY_ID` | `b1c8f71e60b3572241793906a7d674e8` |
  | `R2_SECRET_ACCESS_KEY` | `ac59578e7db5...` |
  | `R2_BUCKET_NAME` | `rawdrive` |
  | `CLODFLARE_STREAMING` (Cloudflare Stream API token) | `cfut_OaZRpOeUdbVm8OWnmkXYRZanBSuDDl97fNNN3J0Ec7a3344c` |
  | `PHONEPE_CLIENT_ID_PROD` | `SU2601231301347147219160` |
  | `PHONEPE_CLIENT_SECRET_PROD` | `b5b663f8-b488-4c7b-8000-9915aaa450f0` |
  | `PHONEPE_CLIENT_ID_TEST` | `M23YZ7TPI88P3_2512192349` |
  | `PHONEPE_CLIENT_SECRET_TEST` | `NGRmZjRjMDYtMTM1ZC00ZTU2LTk2MDQtZmQ3Zjg4YzU0OGE1` |
  | `RAZORPAY_KEY_ID` | `rzp_live_SaACt1vxmVQQXf` (**LIVE** key — not sandbox) |
  | `RAZORPAY_KEY_SECRET` | `mRwt4O2IidkM19E9vq0TPN7T` |
  | `STITCH_API_KEY` | `AQ.Ab8RN6JNw5z0D_PCq1b5jbByHvYquXPbg6U6naaWkXQHwvcKCg` |
  | `FIGMA_API_KEY` | `figd_fYF4nPcfAt_i4sk2vILEcyyi6ZIBhlgiSmBUB7W7` |
  | **Second Google OAuth client_id** | `1057612383675-vmqts48gkofn1le3grij4udp1rkrfssc.apps.googleusercontent.com` |
  | **Second Google OAuth client_secret** | `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` |
  | `SMTP_PASSWORD` | `Prasad@1979@` (looks like a personal password — may be reused across accounts; change everywhere it is reused) |

**There are TWO Google OAuth clients exposed, not one.** The first
is in `gen-lang-client-0225070656-9e42fd6f0ba8.json` (blob 1). The
second is in `.env` (blob 2) and has a different `client_id`. Both
client_secrets must be rotated in GCP Console.

### Scope expansion

The original (v1) plan scoped Phase 2 filter-repo to
`gen-lang-client-0225070656-9e42fd6f0ba8.json` only. Running the v1
plan as written would produce a rewritten history where the Google
JSON is gone but `553febb:.env` and `4d0c13d:.env` are still
reachable with all 11+ credentials above. v2 of this plan broadens
the filter-repo path list to include `.env` and expands Phase 1
rotation to cover every credential listed above.

## Why this cannot be done by a fix agent

Every step in Phases 2 and 3 is on the system-prompt destructive-
operation list:

- **git filter-repo** rewrites every commit that touches the target
  path. Rewritten commits get new SHAs. Every local checkout of any
  rewritten branch becomes diverged.
- **force-push** to `main` overwrites shared history. Anyone who has
  pulled `main` since the leaking commit has the old history locally
  and will need to reset hard, which can destroy uncommitted local
  work if they are not warned.
- **credential rotation in Google Cloud Console** requires
  operator authentication to a system this session does not have
  access to. An agent cannot verify the rotation completed; only
  the operator can.
- **coordinating with forks / CI caches / co-worker checkouts** is
  a cross-team comms task, not a command.

The correct move is for the operator (you) to run these steps with
full awareness of who else has the repo open and in what state.

## Branches that contain the offending blob

Local branches reachable from `553febb`:

```
brownfield/fix-12-issues           ← current working branch
main
cobolt-build/M1
cobolt-build/M7
cobolt-build/M11
cobolt-build/M12
feature/m16-subscription-foundation
fix/m17-hardening-wave-1-totp-mfa
```

Remote branches visible on `origin`:

```
origin/main
origin/brownfield/fix-12-issues
origin/cobolt-build/M11
origin/cobolt-build/M3
origin/cobolt-build/M7
```

**All of these will need their history rewritten** by the
`git filter-repo` run in Phase 2 and force-pushed individually in
Phase 3.

Any branch that exists ONLY locally (not on `origin`) is safe to
rewrite without a force-push, but must still be rewritten or the
old blob re-enters history the next time that branch is pushed.

Any branch that exists on `origin` but not locally would need to be
fetched, rewritten, and force-pushed. The list above includes every
branch I can see from this workstation — **verify the origin list
with `git ls-remote origin` before running Phase 2** in case a team
member has pushed a new branch while this plan was being prepared.

## Phase 1 — Rotation checklist (v2, broadened — MANDATORY FIRST)

> History rewrite is defense-in-depth. **Rotation is the
> load-bearing step.** After a rotation, the leaked secret is
> useless even if it remains reachable everywhere it was ever
> cloned. Before Phase 1 is complete, treat every credential
> below as live and compromised.
>
> **Every row in the table below must be rotated before Phase 2
> runs.** The v1 plan only covered blob 1 row 9 (the first Google
> OAuth client). All other rows are new in v2 and are non-negotiable
> — leaving any of them unrotated while Phase 2 proceeds means the
> history rewrite removes the paper trail while the live exposure
> continues.

For each row, record the new value in a secure secret store
(1Password, Vault, AWS Secrets Manager — whichever the team has
chosen). Do NOT paste new values into Slack / email / commits /
PR descriptions.

| # | Credential | Where to rotate | Where to update consumers | Verification |
|---|---|---|---|---|
| 1 | Cloudflare R2 access key + secret (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) | R2 dashboard → Manage R2 API Tokens → create new, then disable/delete the old token | `.env.cobolt` (each engineer rotates their own copy), staging env, prod env, any CI that uploads to R2 | Upload a test object via the new key; attempt with the old key and confirm 403 |
| 2 | Cloudflare Stream API token (`CLODFLARE_STREAMING` — note the typo; grep for both spellings) | Cloudflare dashboard → My Profile → API Tokens → create new, revoke old | Same consumers as above | `curl -H "Authorization: Bearer <old>"` against the tokens/verify endpoint and confirm rejection |
| 3 | PhonePe prod `client_secret` (`PHONEPE_CLIENT_SECRET_PROD`) | PhonePe merchant portal (prod environment) | Prod env only | Attempt a tokenize call with the old secret; confirm rejection |
| 4 | PhonePe test `client_secret` (`PHONEPE_CLIENT_SECRET_TEST`) | PhonePe merchant portal (sandbox) | Local dev env, staging env | Same as above, against sandbox |
| 5 | **Razorpay LIVE key_id + key_secret** (`rzp_live_SaACt1vxmVQQXf` + secret) | Razorpay dashboard → Settings → API Keys → regenerate (⚠ THIS IS A LIVE KEY — production transactions depend on it; coordinate timing with any in-flight payment flows) | Prod env only — stale live keys must not land in lower envs | Attempt an order creation with the old key; confirm 401 |
| 6 | Razorpay webhook secret (`RAZORPAY_WEBHOOK_SECRET`) | Razorpay dashboard → Webhooks → regenerate | Whatever service consumes the webhook HMAC | Send a test webhook with the old secret; confirm signature validation fails |
| 7 | Stitch API key (`STITCH_API_KEY`) | Stitch account settings → API keys | Any env that uses Stitch MCP | `curl` against Stitch API with old key and confirm rejection |
| 8 | Figma API key (`FIGMA_API_KEY`) | Figma account → Settings → Security → Personal access tokens → revoke old, create new | Any env that uses Figma MCP | `curl -H "X-Figma-Token: <old>"` against `/v1/me` and confirm 403 |
| 9 | **Google OAuth #1** (client_id `...qg1horr2ng0pu5tnbbu3c1m5jbq8pnir`, from the JSON file) | GCP Console → `gen-lang-client-0225070656` project → APIs & Services → Credentials → Reset Secret on that OAuth 2.0 Client ID | Wherever that specific client_id is consumed (grep the codebase for `qg1horr2ng0pu5tnbbu3c1m5jbq8pnir` or for the JSON filename) | Swap the old secret back in a throwaway env, attempt a flow, confirm Google rejects |
| 10 | **Google OAuth #2** (client_id `...vmqts48gkofn1le3grij4udp1rkrfssc`, from the `.env` file) | GCP Console → whichever project hosts that client_id (not `gen-lang-client-0225070656`; look it up by client_id) → Reset Secret | Wherever `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars are consumed | Same as #9 |
| 11 | SMTP password (`SMTP_PASSWORD = Prasad@1979@`) | Whatever mailbox this is the password for. NOTE: this looks like a personal password pattern — if it is reused across any other accounts (personal email, social media, banking, etc.), **change it everywhere** and not just the SMTP relay. Reuse is the failure mode to defend against. | `.env.cobolt` everywhere SMTP is wired, plus any staging/prod env | Attempt SMTP auth with the old password; confirm 535 |

Do not consider Phase 1 complete until every row has its
"Verification" column satisfied against a real attempt with the old
credential.

### Phase 1 sign-off sequence

1. Rotate in the order above (R2 and Cloudflare first so the
   storage and video paths are not orphaned, then payment gateways,
   then SDK/tooling keys, then OAuth, then SMTP).
2. Update all consumer envs for each credential IMMEDIATELY after
   rotating. An in-flight partial state where prod is using the new
   key but staging is using the old key is fine for a few minutes;
   leaving it that way for hours is not.
3. For each row, record the rotation date, operator initials, and
   verification outcome in the "Decision log" at the bottom of this
   document.
4. When every row is marked verified, Phase 2 is authorized to
   proceed. Not before.

After Phase 1 is complete and verified, every leaked credential is
useless. Phase 2 and 3 then become "clean up history so future
readers are not confused," not "stop a live exposure."

## Phase 2 — Rewrite history locally

> **Do NOT run `git filter-repo` against a repo that has
> uncommitted changes or untracked work you care about.** The tool
> creates a fresh rewritten repo and the safety checks are strict
> by design.

1. From a CLEAN working tree, make a bare mirror clone on a
   separate path — you want a safety backup before any rewrite:
   ```bash
   cd /some/scratch/dir
   git clone --mirror https://github.com/veerababumanyam/RawDriveCoBolt.git \
     RawDriveCoBolt-mirror-backup-$(date +%Y%m%d)
   ```
   Keep that backup. If anything goes wrong in Phase 3, you can
   restore from it.

2. Install `git filter-repo` if it is not present:
   ```bash
   pip install git-filter-repo
   # or via your OS package manager
   ```
   `git filter-repo` is NOT the same as `git filter-branch`. Do
   not substitute one for the other.

3. In a fresh working clone (NOT the mirror), from the repo root:
   ```bash
   git filter-repo --invert-paths \
     --path "gen-lang-client-0225070656-9e42fd6f0ba8.json" \
     --path ".env"
   ```
   **⚠ v2 scope expansion:** the command above now includes `.env`
   in addition to the Google JSON file. The v1 plan only stripped
   the JSON; running v1 without `.env` would leave all 11+ other
   credentials from the `.env` blob reachable at `553febb:.env` and
   `4d0c13d:.env`. Do NOT revert to the v1 single-path invocation.

   This walks every commit on every branch and tag, removes the
   named blobs, and rewrites the affected commits with new SHAs.
   The default behavior enforces "no uncommitted changes + no
   untracked files you care about + clone-not-workspace" — if
   you get a refuse message, fix the tree state first, do not
   `--force`.

   Note on `.env` specifically: filter-repo removes every
   historical version of the file. `.env` is already in
   `.gitignore` (hardened in commit `3889908`) so it cannot be
   re-added going forward without a developer overriding the
   ignore. That is the forward-guard; filter-repo is the backward
   cleanup.

4. Verify both blobs are gone from every ref:
   ```bash
   # Google JSON file
   git log --all --full-history --oneline -- "gen-lang-client-*.json"
   # Expected output: nothing
   git cat-file -e 553febb:gen-lang-client-0225070656-9e42fd6f0ba8.json 2>&1
   # Expected: fatal: Not a valid object name ...

   # .env file (v2 addition)
   git log --all --full-history --oneline -- ".env"
   # Expected output: nothing
   git cat-file -e 553febb:.env 2>&1
   # Expected: fatal: Not a valid object name ...
   git cat-file -e 4d0c13d:.env 2>&1
   # Expected: fatal: Not a valid object name ...
   ```
   `553febb` and `4d0c13d` themselves will no longer exist under
   those SHAs — filter-repo will have renamed the rewritten
   commits. Look them up via commit titles:
   ```bash
   git log --all --oneline --grep "Initial project state"
   git log --all --oneline --grep "admin dashboard hardening"
   ```
   The new SHAs should print and should NOT contain either file.

5. **Value-level verification (v2).** Filename checks above only
   prove the tracked paths are gone. To catch any unexpected
   re-inclusion in a branch-stash, tag, or other ref, search
   rewritten history for the actual leaked values or their hashes:
   ```bash
   # Pick a distinctive fragment from each rotated credential and
   # confirm zero matches across all refs + history:
   for pattern in \
     "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" \
     "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" \
     "rzp_live_SaACt1vxmVQQXf" \
     "mRwt4O2IidkM19E9vq0TPN7T" \
     "cfut_OaZRpOeUdbVm8OWnmkXYRZanBSuDDl97fNNN3J0Ec7a3344c" \
     "b5b663f8-b488-4c7b-8000-9915aaa450f0" \
     "b1c8f71e60b3572241793906a7d674e8" \
     "AQ.Ab8RN6JNw5z0D_PCq1b5jbByHvYquXPbg6U6naaWkXQHwvcKCg" \
     "figd_fYF4nPcfAt_i4sk2vILEcyyi6ZIBhlgiSmBUB7W7"; do
     git log --all --full-history -p -S "$pattern" > /dev/null
     if git grep "$pattern" $(git rev-list --all) >/dev/null 2>&1; then
       echo "LEAK STILL PRESENT: $pattern"
     else
       echo "CLEAN: $pattern"
     fi
   done
   ```
   Every line must print `CLEAN`. Any `LEAK STILL PRESENT` means
   the rewrite missed a path and Phase 3 MUST NOT proceed until
   the leak is located and stripped.

5. Run the full test suite locally to catch any accidental
   collateral damage:
   ```bash
   cd backend && go build ./... && go test ./... -short
   ```
   Any test failure at this stage indicates filter-repo removed
   something it should not have — **stop, investigate, do not push**.

## Phase 3 — Coordinate the force-push

> This is the point of no return for other humans on the team.
> Once any branch is force-pushed, everyone who has a working
> copy of that branch on their machine needs to know what
> happened and how to recover, or they will re-introduce the
> leak the next time they push.

1. **Announce the cutover window** to the team in the shared
   channel (Slack / Discord / whatever you use). Minimum content:
   - "The `RawDriveCoBolt` repo is about to have its history
     rewritten to remove a leaked OAuth secret."
   - The absolute time window for the rewrite.
   - "DO NOT push to any branch while the window is open."
   - "After the cutover, every developer must re-clone from
     scratch OR follow the recovery instructions below — do not
     merge, rebase, or push from an old local copy."
   - Link to this document.

2. Push each rewritten branch individually with `--force-with-lease`
   (NOT `--force`). `--force-with-lease` fails safely if someone
   pushed while you were preparing, which is the exact case you
   want to catch:
   ```bash
   git push --force-with-lease origin main
   git push --force-with-lease origin brownfield/fix-12-issues
   git push --force-with-lease origin cobolt-build/M11
   git push --force-with-lease origin cobolt-build/M3
   git push --force-with-lease origin cobolt-build/M7
   # …and any other origin branches that appear in `git ls-remote origin`.
   ```
   Push them one at a time, confirming each succeeds before the
   next. If any `--force-with-lease` fails, STOP and investigate:
   someone has pushed during the rewrite window.

3. Delete any stale `origin` refs that no longer exist locally
   (filter-repo may have dropped some). `git fetch --prune
   origin` surfaces them; delete via
   `git push origin --delete <branch>` if the operator confirms
   the branch is safe to remove.

4. GitHub-side cleanup (operator must do these via the web UI or
   API):
   - Close any PRs that reference the leaking commits. Merged PRs
     keep their historical diffs forever; GitHub does not
     retroactively strip content from old PR views.
   - Contact GitHub Support and ask them to **purge cached views**
     of the affected commits. GitHub has an explicit process for
     this at <https://docs.github.com/en/authentication/keeping-
     your-account-and-data-secure/removing-sensitive-data-from-a-
     repository>. The secret being already-rotated makes this
     lower-priority but still worth doing.
   - If the repo has forks on GitHub, each fork retains its own
     copy of the old history. GitHub's sensitive-data removal
     process can handle forks you own; forks owned by external
     parties cannot be rewritten — those are dead-on-arrival
     exposures and the only defense is the rotation from Phase 1.

## Phase 4 — Team recovery instructions

Every developer with a local clone needs to run one of these two
recovery paths:

### Path A: nuke and re-clone (recommended)

```bash
cd ..
mv RawDriveCobolt RawDriveCobolt.pre-rewrite.bak
git clone https://github.com/veerababumanyam/RawDriveCoBolt.git RawDriveCobolt
cd RawDriveCobolt
# Re-copy .env.cobolt from your secret store (NEW client_secret!).
# Re-install dependencies (cd backend && go mod download; cd frontend && pnpm install).
```

Once everything is working, delete the `.pre-rewrite.bak` clone
so the old history does not accidentally leak back into `origin`
via a future `git push`.

### Path B: in-place reset (only if you have uncommitted work
you cannot afford to lose)

```bash
# Stash or commit any WIP to a throwaway branch first.
git stash push -m "pre-rewrite WIP backup"
# For each branch you work on:
git fetch origin
git checkout main
git reset --hard origin/main
git checkout brownfield/fix-12-issues
git reset --hard origin/brownfield/fix-12-issues
# …and so on for every branch you have checked out.
git stash pop    # or manually re-apply the WIP branch
```

Path B is fragile: if you forget one branch, the old secret blob
stays in your reflog and can re-enter origin if you ever push that
branch. Path A is the safe default unless you explicitly need the
WIP.

## Verification after cutover

Confirm the rewrite took effect everywhere:

```bash
# Against origin:
git clone --depth=1 --no-single-branch \
  https://github.com/veerababumanyam/RawDriveCoBolt.git /tmp/rawdrive-verify
cd /tmp/rawdrive-verify
git log --all --full-history --oneline -- "gen-lang-client-*.json"
# Expected output: (empty)
git rev-list --all | xargs -I{} git ls-tree -r {} 2>/dev/null \
  | grep "gen-lang-client" || echo "CLEAN"
# Expected output: CLEAN
```

If either command prints anything other than empty/CLEAN, the
rewrite was incomplete. Do not consider the incident closed.

## Decision log (operator fills in as they go)

### Phase 1 — Rotation checklist sign-off (v2, 11 rows)

Every row must show "Verified rejected" before Phase 2 is
authorized. Dates in `YYYY-MM-DD`.

| # | Credential | Rotated on | Consumers updated | Verified rejected | Operator |
|---|---|---|---|---|---|
| 1 | R2 access key + secret | | | | |
| 2 | Cloudflare Stream API token | | | | |
| 3 | PhonePe prod client_secret | | | | |
| 4 | PhonePe test client_secret | | | | |
| 5 | Razorpay LIVE key_id + key_secret | | | | |
| 6 | Razorpay webhook secret | | | | |
| 7 | Stitch API key | | | | |
| 8 | Figma API key | | | | |
| 9 | Google OAuth #1 (JSON file client) | | | | |
| 10 | Google OAuth #2 (.env client) | | | | |
| 11 | SMTP password (+ any reused personal password) | | | | |

### Phase 2 — History rewrite sign-off

| Step | Responsible | Completed | Notes |
|---|---|---|---|
| Phase 2 step 1: mirror backup created | | | |
| Phase 2 step 3: filter-repo run (with `.env` in path list) | | | |
| Phase 2 step 4: blob-gone verification (JSON + .env) | | | |
| Phase 2 step 5: value-level verification (every pattern CLEAN) | | | |
| Phase 2 step 6: test suite pass | | | |

### Phase 3 — Force-push coordination sign-off

| Step | Responsible | Completed | Notes |
|---|---|---|---|
| Phase 3 step 1: team announcement sent | | | |
| Phase 3 step 2: main force-pushed | | | |
| Phase 3 step 2: brownfield/fix-12-issues force-pushed | | | |
| Phase 3 step 2: cobolt-build/M11 force-pushed | | | |
| Phase 3 step 2: cobolt-build/M3 force-pushed | | | |
| Phase 3 step 2: cobolt-build/M7 force-pushed | | | |
| Phase 3 step 4: GitHub cached-view purge request sent | | | |
| Phase 4: team recovery instructions posted | | | |
| Verification: clean clone confirms both blobs absent | | | |

## What I (the fix agent) did NOT do

- I did not run `git filter-repo`.
- I did not force-push anything.
- I did not rotate any credential (GCP, R2, Cloudflare, PhonePe,
  Razorpay, Stitch, Figma, SMTP).
- I did not touch any leaked blob in history.
- I did not delete or rename `gen-lang-client-0225070656-9e42fd6f0ba8.json`
  or `.env` anywhere.
- I did not update `.env.cobolt`, staging env, or prod env.

The only thing I did for ISSUE-001 is write this plan and commit it
to `brownfield/fix-12-issues` so there is a single authoritative
document for the operator to work from. Any statement that ISSUE-001
is "resolved" in automated review output before every row of the
Phase 1 rotation checklist is verified should be treated as false.

### v2 changelog (2026-04-11 later in the same day)

Amendments made after
`docs/brownfield/brownfield-fix-wave-review.md §2.1` found that the
v1 plan scope was incomplete:

- Added `.env` as a second leaked blob with its full credential
  inventory (11+ live values including Razorpay LIVE keys and a
  second Google OAuth client).
- Expanded Phase 1 from 1 credential (Google OAuth JSON) to 11+
  credentials, organized as a single checklist table with
  per-row verification.
- Expanded Phase 2 filter-repo command to include `--path ".env"`
  alongside the original JSON path.
- Added a value-level verification step (grep for distinctive
  fragments across all refs) so a missed path in a branch-stash
  or tag cannot silently re-leak after the rewrite.
- Restructured the Decision log into three sign-off tables
  (rotation, rewrite, force-push coordination).

None of the v2 changes execute anything. The plan remains halted
pending operator authorization of Phase 1.
