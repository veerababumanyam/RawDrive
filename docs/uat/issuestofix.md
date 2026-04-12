                                                                                                                                                                                    
  Hard blockers (must fix before any externally-reachable environment)
                                                                                                                                                                                    
  1. OAuth client_secret is still in git history — ISSUE-001 is only half-fixed.
  Commit 3889908 removed gen-lang-client-*.json from the working tree and hardened .gitignore. Good. But git log --all --full-history -- "gen-lang-client-*.json" still shows commit
   553febb introducing the file. Anyone with repo read access (including forks and CI caches) can still run git show 553febb:gen-lang-client-0225070656-9e42fd6f0ba8.json and       
  recover the secret. Step 3 of the remediation (git filter-repo --invert-paths) and rotation in Google Cloud Console were not done — or at least, there is no evidence they were.  
  Treat the secret as compromised until it is rotated AND history is rewritten AND the force-push is coordinated.

  2. The master assessment itself has an 81% phantom rate.
  23-master-assessment-verification.json verified 3 citations and rejected 13 because the cited files do not exist (00-source-file-manifest.json, routes_*.go, p0-sbom-backend.json,
   totp.go, handler/chunked_upload.go, bulk_asset_handler.go, storage/local.go, go.mod, etc.). This is the signal the brownfield-phantom-learnings.md file exists to warn you about:
   the assessment that is shaping your fix wave is itself partially hallucinated. Any staging decision built on it is standing on mud.

  3. The readiness gate is failing 6 of 10 checks.
  phase-P3-readiness-gate.json → "passed": false:
  - G3 Health Grade — health-score.json not computed
  - G5 Core Artifacts — 1/4 present (25%)
  - G6 Runtime Truth — only 3 commands executed, and per ISSUE-010 the frontend build was measured by a broken npm.cmd runner on a pnpm project (not true signal)
  - G7 P3 Accuracy Report — status=failed
  - G8 Evidence Index Integrity — 19-evidence-index.json has no entries
  - G9 Forensic Audit — file not found
  - G10 Deterministic Finding Coverage — domain-liveness missing; multiple semantic-stub, query/migration, and UI-placeholder findings never made it into the registry

  4. Pipeline has not actually executed any milestone.
  cobolt-state.json shows currentStage: "S0", currentPhase: null, currentMilestone: null, tasksCompleted: [], filesWritten: []. No build, no review, no deploy artifacts have been  
  produced by the CoBolt pipeline for this branch. The session recovery banner at the top of this conversation is telling you the same thing: Missing: Build artifacts, Review      
  artifacts.

  Soft blockers (I'd want these resolved before canary, and documented before staging)

  5. OpenAPI is a 75-line skeleton, not a spec.
  docs/api/openapi-skeleton.yaml is 75 lines for a ~272-endpoint surface. ISSUE-004 is "addressed" in the sense that scaffolding exists; it is not addressed in the sense that      
  consumers have a machine-readable contract. For canary, you want the critical auth + upload + gallery paths fully specified and contract-tested.

  6. ISSUE-002 (production email) needs end-to-end verification on a real environment.
  The commit wires SMTP and gates the stub behind an env var. That is the right shape, but I haven't seen a recorded run proving that registration OTP, password reset, team invite,
   and MFA enrollment emails actually land in an inbox through a real provider. The fix is code-complete; it is not evidence-complete.

  7. ISSUE-003 (NATS publisher) — same story.
  Real publisher wired, but no test or runtime evidence showing a JetStream ack on a real broker with a restart-survival check. In-process fallback is fine for dev; for canary you 
  need the durability guarantee proven, not asserted.

  8. ISSUE-006 (MFA mount gate startup check) — verify the gate actually FATALs.
  The remediation asks for a startup walker that fails fast if RequireMFA is ever mounted without JWT auth in front of it. Before staging, I'd run a deliberate negative test (mount
   a route with RequireMFA and no JWT, start the server, confirm it FATALs) — otherwise the "gate" is just a function nobody runs.

  9. Uncommitted test file edits in your working tree.
  git status shows unstaged modifications to backend/tests/integration/auth_flow_test.go, health_test.go, m13/integration_test.go, m5/migrations_test.go, m6/migrations_test.go.    
  Ship decisions should not be made from a dirty tree — either commit these, stash them, or discard them, but know what they are first. (My memory notes
  feedback_deferred_test_cleanups.md — a parallelism warning + count-by-type refactor were queued for the next m13/migrations touch, so these may be that work in progress.)  