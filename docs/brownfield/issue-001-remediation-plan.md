# ISSUE-001 — OAuth client_secret in git history (remediation plan)

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

## Current state (verified 2026-04-11)

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
  The GCP project identifier is in the filename itself
  (`gen-lang-client-0225070656`). **The client_secret value must
  be rotated in GCP Console regardless of what happens to git
  history.**

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

## Phase 1 — Rotate the credential (MANDATORY FIRST)

> History rewrite is defense-in-depth. **Rotation is the
> load-bearing step.** After a rotation, the leaked secret is
> useless even if it remains reachable everywhere it was ever
> cloned. Before Phase 1 is complete, treat the credential as
> live and compromised.

1. Sign in to Google Cloud Console at
   <https://console.cloud.google.com/apis/credentials>
   with an account that has Owner or Editor on the
   `gen-lang-client-0225070656` project.
2. Locate the OAuth 2.0 Client ID whose client_id matches the one
   in the leaked JSON. The operator can look it up without
   re-exposing the secret by running locally:
   ```bash
   git show 553febb:gen-lang-client-0225070656-9e42fd6f0ba8.json \
     | python -c "import json,sys; print(json.load(sys.stdin)['web']['client_id'])"
   ```
3. Click **Reset Secret** on that client. Confirm.
4. **Record the new client_secret in a secure secret store**
   (1Password, Vault, AWS Secrets Manager, the team's chosen tool).
   Do NOT paste it into Slack / email / commit / PR description.
5. Update every place that consumed the old secret:
   - `.env.cobolt` (local dev — each engineer rotates their own copy)
   - Any staging / production deployment environment variables
     (`GOOGLE_OAUTH_CLIENT_SECRET`, or whatever name the code uses;
     grep for the old client_id to find every consumer)
   - Any CI environment that needs to build against the OAuth app
   - Any documentation runbook that references the credential
6. Smoke-test the OAuth flow against the new secret before
   proceeding:
   - Trigger `/auth/oauth/google` locally
   - Complete the callback
   - Confirm a session is issued
7. **Verify the old secret is dead.** Try to complete an OAuth flow
   using the OLD client_secret (e.g. by temporarily swapping it
   back in a throwaway env). Google should reject the request. If
   it does not, the rotation did not take effect and Phase 2 must
   not proceed.

After Phase 1 is complete and verified, the leaked credential is
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
   git filter-repo --invert-paths --path "gen-lang-client-0225070656-9e42fd6f0ba8.json"
   ```
   This walks every commit on every branch and tag, removes the
   blob, and rewrites the affected commits with new SHAs. The
   default behavior enforces "no uncommitted changes + no
   untracked files you care about + clone-not-workspace" — if
   you get a refuse message, fix the tree state first, do not
   `--force`.

4. Verify the blob is gone from every ref:
   ```bash
   git log --all --full-history --oneline -- "gen-lang-client-*.json"
   # Expected output: nothing
   git cat-file -e 553febb:gen-lang-client-0225070656-9e42fd6f0ba8.json 2>&1
   # Expected: fatal: Not a valid object name ...
   ```
   `553febb` itself will no longer exist under that SHA — filter-
   repo will have renamed the rewritten commit. Look it up via
   the commit title:
   ```bash
   git log --all --oneline --grep "Initial project state"
   ```
   The new SHA should print and should NOT contain the file.

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

| Step | Responsible | Completed | Notes |
|---|---|---|---|
| Phase 1 step 1: sign in to GCP Console | | | |
| Phase 1 step 3: reset secret | | | |
| Phase 1 step 4: store new secret in secret store | | | |
| Phase 1 step 5: update .env.cobolt (local) | | | |
| Phase 1 step 5: update staging env | | | |
| Phase 1 step 5: update prod env | | | |
| Phase 1 step 6: smoke test new secret | | | |
| Phase 1 step 7: verify old secret rejected | | | |
| Phase 2 step 1: mirror backup created | | | |
| Phase 2 step 3: filter-repo run | | | |
| Phase 2 step 4: blob gone verification | | | |
| Phase 2 step 5: test suite pass | | | |
| Phase 3 step 1: team announcement sent | | | |
| Phase 3 step 2: main force-pushed | | | |
| Phase 3 step 2: brownfield/fix-12-issues force-pushed | | | |
| Phase 3 step 2: cobolt-build/M11 force-pushed | | | |
| Phase 3 step 2: cobolt-build/M3 force-pushed | | | |
| Phase 3 step 2: cobolt-build/M7 force-pushed | | | |
| Phase 3 step 4: GitHub cached-view purge request sent | | | |
| Phase 4: team recovery instructions posted | | | |
| Verification step: clean clone confirms blob absent | | | |

## What I (the fix agent) did NOT do

- I did not run `git filter-repo`.
- I did not force-push anything.
- I did not rotate the GCP credential.
- I did not touch the leaked blob in history.
- I did not delete or rename `gen-lang-client-0225070656-9e42fd6f0ba8.json`
  anywhere.
- I did not update `.env.cobolt`, staging env, or prod env.

The only thing I did for ISSUE-001 is write this plan and commit it
to `brownfield/fix-12-issues` so there is a single authoritative
document for the operator to work from. Any statement that ISSUE-001
is "resolved" in automated review output before Phase 1 is verified
should be treated as false.
