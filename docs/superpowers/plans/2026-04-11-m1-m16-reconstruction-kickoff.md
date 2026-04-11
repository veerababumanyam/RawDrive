# M1-M16 Planning Artifact Reconstruction — Kickoff

**Date:** 2026-04-11
**Session:** Session A (kickoff / Phase 0 inventory)
**Trigger:** `cobolt-plan feature` for M17 halted at precondition failure — base planning artifacts (prd.md, architecture.md, milestones.md, epics.md, etc.) do not exist on disk despite `cobolt-state.json` claiming they do.
**Goal:** Reconstruct the missing M1-M16 planning artifact package so that (a) future feature runs like M17 can delta-against a real base plan, and (b) build gates have genuine requirements/architecture evidence to verify against.
**Author:** Claude (this session) — working from decision packet `docs/superpowers/plans/2026-04-11-m17-decision-packet.md`.

---

## 0. Why we're doing this

- `cobolt-state.json` at the project root references 63 planning artifacts written on 2026-04-07 to `_cobolt-output/runs/2026-04-08/run-008/planning/`. **That directory does not exist on disk.** Only `_cobolt-output/runs/2026-04-10/` exists, and it contains no PRD/architecture/milestones files.
- `find _cobolt-output -name "prd.md" -o -name "milestones.md" -o -name "architecture.md" -o -name "epics.md"` returned zero matches project-wide.
- No DEFERRED.md at project root. No `issue-and-blocker-tracker.json` anywhere.
- The project has **shipped code for 16 milestones worth of features** (M1-M16 per git history, `cobolt-state.json.currentStage`, AGENTS.md content, and 67 migrations) but **zero planning artifacts** backing any of them.
- Feature mode (`cobolt-plan feature`) cannot run because it reads `prd.md` + `architecture.md` as context and computes `NEXT_MILESTONE` from `milestones.md`. All three are missing.
- The user has committed to the reconstruction path (explicitly acknowledged as multi-session).

---

## 1. Source material inventory

### 1.1 — `docs/TechnicalRequirements/` (≈ 540 KB across 40+ files)

**Primary PRD source:**
- `PRD.md` — **86 KB** — the canonical product PRD, largest single doc in the tree. Reconstruction Phase 1 (`cobolt-create-prd`) should treat this as the root input.

**Role-based requirements (classify as PRD/Requirements):**
- `SuperAdmin-Requirements.md` — 35 KB
- `Photographer-Requirements.md` — 27 KB
- `Admin-Requirements.md` — 22 KB
- `Client-Requirements.md` — 22 KB
- `StateDealer-Requirements.md` — 19 KB
- `TeamMember-Requirements.md` — 15 KB

**Feature PRDs (classify as PRD/Requirements):**
- `Digital_Inivtation_PRD.md` — 28 KB (note: filename typo, keep verbatim for traceability)
- `CoverPhotoSystem.md` — 24 KB (also duplicated in `Gallery/CoverPhotoSystem.md`)
- `Gallery/GALLERY_FEATURE_REQUIREMENTS.md` — 36 KB
- `Gallery/UPLOAD_CLIENT_SIDE_ABUSE_SCREENING_ARCHITECTURE.md` — 23 KB
- `Gallery/GALLERY_CANVAS.md` — 16 KB
- ~~`Gallery/GALLERY_DESIGN_ENHANCEMENTS_VERIFICATION.md`~~ — **archived 2026-04-11 to `docs/archive/python-implementation/` — Python-prototype origin, cites `.py` migration filenames. See archive README for context.**
- ~~`Gallery/GALLERY_DESIGN_STUDIO_VERIFICATION.md`~~ — **archived 2026-04-11 to `docs/archive/python-implementation/` — Python-prototype service layout (the exact file audit F-022 flagged at lines 485-490).**

**Domain/technical specs (classify as Technical/Architecture):**
- ~~`GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md`~~ — **archived 2026-04-11 to `docs/archive/python-implementation/` — 876 lines of Python code examples (`create_upload_session`, `TaskPriority.NORMAL`, Python dict job payloads) against a `backend/src/app/services/*.py` tree that does not exist in this Go monolith. Authoritative current source: `backend/internal/ai/` (`face_service.go`, `face_worker.go`, `face_repo.go`, `gemini_client.go`, `handler.go`). See archive README.**
- `Techstack.md` — 7 KB
- `Razorpay_Payment_Gateway_Integration.md` — 8 KB
- `Security_Compliance_Privacy.md` — 5 KB — **contains the MFA requirement F-007 traces to**
- `Asset_Management.md` + `Gallery/Asset_Management.md` — 4-5 KB each — **contains the TUS spec F-013 traces to**
- `CRM_Lead_Management.md`, `AI_Intelligence_Search.md`, `Contracts_Billing_GST.md`, `Calendar_Booking_Scheduling.md`, `Marketing_Branding.md`, `Foundation_Governance.md`, `Creative_Workflow_Tools.md`, `Freelancer_Marketplace.md`, `Business_Intelligence_Reporting.md`, `CLI_Tooling_Automation.md`, `Client_Galleries_PWA.md`, `Developer_API_Integrations.md`, `Gear_Marketplace_Classifieds.md`, `Revenue_Dealership_Engine.md`, `Studio_Team_Outsourcing.md`
- `StreamingDesktop/` subfolder: `LiveStreaming.md`, `Studio_Desktop_Companion.md`, `Studio_Desktop_Companion_Implementation_Plan.md`, `Video_Transcoding_Delivery.md`
- `DESIGN_SYSTEM_GUIDE.md`

**Gallery progress/status reports** — **all archived 2026-04-11 to `docs/archive/python-implementation/` per audit F-022 resolution.** These described fix work done against a Python microservices prototype (`services/gallery-service/`, `services/billing-service/`, `services/llm-service/`) that does not exist in this Go + Next.js repository. One of them (`GALLERY_FIXES_SUMMARY.md`) contained an `llm-service (chat completions)` line that was the immediate trigger for the archive sweep — RawDrive uses Google Gemini (`backend/internal/ai/gemini_client.go`) for photo intelligence, not an OpenAI-style LLM. See `docs/archive/python-implementation/README.md` for full provenance.
- ~~`Gallery/GALLERY_FIXES_*`~~ (SUMMARY, STATUS, PROGRESS_SUMMARY, FINAL_REPORT, DEPLOYMENT_READY) — **archived**
- ~~`Gallery/GALLERY_ISSUES_REPORT.md`~~ — **archived**
- ~~`Gallery/GALLERY_SERVICE_ERROR_STANDARDIZATION_SUMMARY.md`~~ — **archived**
- ~~`Gallery/GALLERY_PERFORMANCE_DEPLOYMENT.md`~~ — **archived**
- ~~`Gallery/UPLOAD_SERVICE_DEPLOYMENT_GUIDE.md`~~ — **archived**
- `Gallery/COVER_SYSTEM_REVIEW_AND_PLAN.md` — retained; does not reference the Python services tree and may describe the real Go implementation. If later review finds it is also drifted, archive alongside the others.

### 1.2 — `docs/superpowers/plans/` (feature-scoped implementation plans)

- `2026-04-10-m16-p0-p1-hardening.md` — M16 hardening wave plan (waves 1-7 shipped, waves 8-9 = F-007/F-013 = M17)
- `2026-04-10-razorpay-payments.md` — M16b Razorpay integration
- `2026-04-10-dunning-refunds-phonepe.md` — M16c dunning/refund/PhonePe
- `2026-04-10-subscription-foundation.md` — M16 subscription foundation
- `2026-04-11-m17-decision-packet.md` — **THIS SESSION'S OUTPUT** — F-007/F-013/F-008 Part B decisions

### 1.3 — `docs/audits/`

- `rawdrive-v0.0.35-m16-360-audit-2026-04-10.md` — the 360° security+correctness audit that identified F-001 through F-023. Section 14 ("Recommended M17 Action Plan") is the scoping source for M17.

### 1.4 — `docs/` root

- `OPEN-ISSUES.md` — open issue tracker (supplementary context)
- `auditrport.md` — typo in filename, content unknown (classify after reading)
- `runbooks/` — operational runbooks (`upload-screening-alerts.md` and others)

### 1.5 — Shipped code as ground truth

- `backend/internal/database/migrations/` — **67 migration files**, 29 carry lowercase milestone prefixes (`m2`, `m4`, `m5`, `m6`, `m7`, `m8`, `m10`, `m11`, `m13`, `m14`, `m15`). M1, M3, M9, M12, M16 do not use the prefix convention — those migrations need to be traced via commit history.
- `backend/internal/handler/`, `backend/internal/service/`, `backend/internal/repository/` — shipped API/service/data layer
- `frontend/src/app/(dashboard)/` — shipped frontend routes
- `backend/seeds/` — test user fixtures
- Git history — 100+ commits with milestone tags in various formats: `(M16)`, `(m16)`, `(m16b)`, `(m16c)`, `(M1.1)`, `(M7.5)`, `(m13)`, etc.

### 1.6 — Audit-claimed planning state (ghost)

`cobolt-state.json` claims (all unverifiable, files do not exist):
- 63 artifacts produced
- 16 milestones (M1-M16)
- 46 epics
- 138 stories
- 1217 requirements (705 FR + 259 NFR + 66 TR + 110 IR + 77 Day2NFR)
- Readiness verdict: BUILD_AUTHORIZED, score 4.5
- Last feature run: 2026-04-10 for "client-side-upload-abuse-screening" (matches `feat(M16): upload client-side abuse screening (Tier D)` commit `6e0a2fd`)

Do NOT trust these counts. They may be aspirational or reflect a deleted planning run. Reconstruction must re-derive them from source.

---

## 2. Preliminary milestone decomposition (derived from migrations + commits)

This is a **starting hypothesis** for the reconstruction's milestone.md, NOT the final answer. Session E will refine it.

### From migration prefixes + commit scan + feature-plan filenames:

| # | Milestone | Evidence | Scope hypothesis |
|---|-----------|----------|------------------|
| M1 | Foundation / Auth / Workspaces | No migration prefix. Commit `(M1.1)` fix about JWT context key (memory). `backend/seeds/` fixtures. | Auth registration (email-OTP), login, JWT RS256, workspaces, users, roles, initial middleware. |
| M2 | Core data plane | Migrations with `m2` prefix. | Galleries, gallery hierarchy, albums, sub-galleries, gallery membership. |
| M3 | Assets / upload foundation | No migration prefix; commits during early asset work. | Asset model, storage abstraction, initial upload (pre-TUS), R2 wiring. |
| M4 | Notifications / messaging | Migrations with `m4` prefix. | Email/SMS delivery service, notification templates, delivery log. |
| M5 | Marketplace / freelancer / gear | Migrations `000014_create_m5_marketplace_tables`, `000015_create_m5_gear_tables`, `000016_create_m5_messaging_tables`. | Freelancer marketplace, gear marketplace classifieds, messaging. |
| M6 | Calendar / booking / scheduling | Migration `m6` prefix. | Calendar, booking, scheduling flows. |
| M7 | CRM / leads / platform roles | Migration `m7` prefix + commit `(M7.5)` about platform roles + memory "M7.5 Platform Roles". | CRM pipeline, lead management, platform role system (two-tier), `RequirePlatformRole` middleware. |
| M8 | Creative workflow / tools | Migration `m8` prefix. | Culling, proofing, favorites, client review workflows. |
| M9 | AI / Vision / face-ID | No migration prefix; commits reference vision pipeline. `GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md`. | Google Cloud Vision integration, face detection, auto-tagging, duplicate detection. |
| M10 | Contracts / billing / GST foundation | Migration `m10` prefix. | Contracts, invoices, GST computation foundations. |
| M11 | Admin dashboards / super-admin | Migration `m11` prefix. Commit `(M11)`. | Admin panels, super-admin controls, platform settings. |
| M12 | PWA / client galleries | No migration prefix; `Client_Galleries_PWA.md`. | PWA shell, offline gallery viewing, client-facing PWA. |
| M13 | Integration / developer API / streaming | Migration `m13` prefix; `Developer_API_Integrations.md`. Memory mentions m13 integration_test.go. | Public developer API, webhook subscriptions, streaming integration. |
| M14 | Commerce / orders | Migration `m14` prefix. Memory "M14 order lifecycle deferred" — payment capture/refunds/fulfillment NOT in v0.0.34. | Gallery commerce, order creation, initial order model. |
| M15 | Enterprise hardening | Migration `m15` prefix. `currentStage: "M15-enterprise-hardening"` in state. | Enterprise tier features, BYOS storage, enterprise auth hardening (partial). |
| M16 | Billing / payments / hardening (3 sub-milestones) | `m16`, `m16b`, `m16c` in commits + migrations 058-062. Covers a LOT. | **M16** = subscription foundation + Tier D upload screening. **M16b** = Razorpay integration (checkout, webhooks, invoices, GST). **M16c** = dunning, refunds, PhonePe. **M16 hardening waves 1-7** = P0/P1 audit findings closure. |

**Split-milestone candidates for reconstruction:** M16 is obviously too fat for a single milestone entry. Reconstruction Session E should consider splitting:
- M16 → subscription foundation
- M16.1 → Tier D upload screening
- M16.2 (was M16b) → Razorpay
- M16.3 (was M16c) → Dunning/refunds/PhonePe
- M16.4 → Hardening waves 1-7

Or keep them as sub-milestones with the same parent. Decide when reconstructing.

---

## 3. Reconstruction session plan (8 sessions total)

All future sessions run `cobolt-plan project` subcommands. They should NOT use `cobolt-plan feature` until reconstruction is complete and base artifacts exist on disk.

### Session A (THIS SESSION) — Phase 0: Inventory + kickoff

**Status: IN PROGRESS**

- [x] Inventory `docs/TechnicalRequirements/`, `docs/superpowers/plans/`, `docs/audits/`, `docs/`
- [x] Scan migrations for milestone prefixes (29 tagged)
- [x] Scan git history for milestone commit patterns
- [x] Write preliminary milestone hypothesis (Section 2)
- [x] Write this kickoff document
- [ ] Update `cobolt-state.json` to reflect reconstruction-needed status (OR leave stale for user to decide)
- [x] Halt cobolt-plan feature cleanly
- Hand off to Session B

**Artifacts produced this session:**
- `docs/superpowers/plans/2026-04-11-m17-decision-packet.md` (F-007/F-013 decisions, pre-baked for future M17 feature run)
- `docs/superpowers/plans/2026-04-11-m1-m16-reconstruction-kickoff.md` (this file)

**Artifacts NOT produced (deferred to future sessions):**
- prd.md, trd.md, implicit-requirements.md, architecture.md, epics.md, milestones.md, rtm.json, etc.

### Session B — Phase 1: Product Intent (reconstruction)

**Command to run in a fresh conversation:**
```
/cobolt-plan project --from-folder docs/TechnicalRequirements/
```

(NOT `--autonomous` — we want checkpoint-based progress, not auto-chain to build.)

**Expected artifacts (→ `_cobolt-output/latest/planning/`):**
- `prd.md` — synthesized from PRD.md + role-based requirement docs + feature PRDs
- `prd-validation-report.md` + `.json`
- `domain-knowledge-base.md` — photography/studio/wedding domain
- `project-knowledge-base.md` — RawDrive-specific context, derived from AGENTS.md + existing code
- `source-document-consolidation.md` — classification of all input docs
- `phase-1-gap-report.json`
- `checkpoints/phase1-product-intent.json`

**Session B should also:** Clear the stale ghost-artifact claims in `cobolt-state.json` by running the canonical `register-all` at the end of the session so gates see reality.

### Session C — Phase 2: Technical Guardrails

**Expected artifacts:**
- `implicit-requirements.md`
- `trd.md` — derived from Techstack.md + GOOGLE_CLOUD_VISION_FACEID_TECH_SPEC.md + shipped code structure
- `security-requirements.md` — derived from Security_Compliance_Privacy.md + audit findings
- `secure-coding-standard.md`
- `engineering-quality-standards.md`
- `project-skills-manifest.md`
- `phase-2-gap-report.json`
- `checkpoints/phase2-technical-guardrails.json`

### Session D — Phase 3: System Design

**Expected artifacts:**
- `architecture.md` (composite index)
- `system-architecture.md` — C4 diagrams, ADRs
- `architecture-decisions.md`
- `data-model-spec.md` — **derived from the 67 migrations + RLS policies in `backend/internal/database/migrations/008_create_rls.up.sql` + parameterized set_config pattern**
- `api-contracts.md` — **derived from route registration in `backend/internal/handler/*.RegisterRoutes()` and `backend/cmd/api/main.go`**
- `ux-design-specification.md` — derived from shipped `frontend/src/app/` routes + design-tokens.json
- `wireframes-and-user-flows.md`
- `dependency-register.md`
- `dependency-tracker.json`
- `ux-tracker.json`
- `delivery-plan.md`
- `phase-3-gap-report.json`
- `checkpoints/phase3-system-design.json`

**Session D is the biggest research session** — it has to reverse-engineer the data model from 67 migrations and the API surface from ~50 handler files. Budget accordingly.

### Session E — Phase 4: Delivery Breakdown

**Expected artifacts:**
- `epics.md` — derived from feature groupings, migration prefixes, and git commit clusters. Target 40-50 epics covering M1-M16.
- `milestones.md` — refine the Section 2 hypothesis into a final milestone DAG with dependencies. **Crucial**: must end with M16 so that Session G's M17 feature run appends correctly. The M16 fat milestone decision (keep split vs. sub-milestones) is made here.
- `traceability-matrix.md` + `rtm.json` — requirement → epic → story mapping
- `cross-milestone-analysis.md` — dependency matrix, shared interfaces, reused components
- `test-strategy.md`
- `deterministic-quality-gates.json`
- `agent-grounding-and-anti-hallucination.md`
- `milestone-tracker.json`, `story-tracker.json`, `issue-and-blocker-tracker.json`
- `source-coverage-report.json`
- `phase-4-gap-report.json`
- `checkpoints/phase4-delivery-breakdown.json`

### Session F — Phase 5: Build Authorization + Story Spec Kits

**Expected artifacts:**
- `master-plan.md`
- `release-readiness-checklist.md`
- `readiness-report.md` + `.json`
- `sprint-status.yaml`
- `stories/*.md` — **one per story** — reconstruction has to produce ~138 story files if state's claim holds, OR as many as the reconstructed epics actually define. This is the biggest write session — expect it to span multiple sub-sessions via `cobolt-plan project --resume`.
- `story-specs/*.md` — **implementation spec kits per story** (File Map + Function Signatures + Data Structures). This is Phase 5B. Budget accordingly.
- `cross-milestone-blocked-tasks.json`
- `planning-docs-cache.md`
- `planning-progress.json` with `planningComplete: true`

### Session G — M17 feature planning

Only AFTER Sessions B-F complete with base artifacts on disk.

**Command:**
```
/cobolt-plan feature --from-files docs/superpowers/plans/2026-04-11-m17-decision-packet.md docs/audits/rawdrive-v0.0.35-m16-360-audit-2026-04-10.md docs/superpowers/plans/2026-04-10-m16-p0-p1-hardening.md
```

Re-runs the skill invocation that halted today. Feature mode should succeed now that `prd.md`, `architecture.md`, `milestones.md`, `epics.md` exist. Produces:
- `feature-prd.md`
- `feature-architecture-delta.md`
- `feature-epics.md`
- M17 entry appended to `milestones.md`
- RTM update for M17 FRs
- M17 story files + spec kits

### Session H+ — Build M17

```
/cobolt-build M17
```

Multi-session via `--resume`. Runs the 11-step build pipeline. Final commit bumps to v0.0.36.

---

## 4. Stale state to resolve

`cobolt-state.json` will need cleanup when reconstruction starts. Specific fields to review:
- `currentStage`: `"M15-enterprise-hardening"` — should be `"M17-planning"` or similar when reconstruction begins, `"M17-build"` during build, `"M17-complete"` after ship.
- `currentMilestone`: `"M15"` — drift. Should be `"M16"` right now (M16 is shipped, M17 not started).
- `planning.completedAt`, `planning.phases`, `planning.artifacts`, `planning.totalSize`, `planning.milestones`, `planning.epics`, `planning.stories`, `planning.requirements`, `planning.readinessVerdict` — all reference the ghost run. Session B should either clear these or let `register-all` overwrite them based on newly-written artifacts.
- `planning.lastFeatureRun: "2026-04-10T11:28:01.124Z"` — this was the Tier D upload screening feature run (commit `6e0a2fd`). Keep as historical context, but note that its output artifacts don't exist either.
- `pipeline.currentStage: "S5-S6"` and `pipeline.currentMilestone: "M3"` — clearly stale, from a much earlier run. Clear these or ignore.

**Recommendation:** Do NOT modify `cobolt-state.json` until Session B. Let Session B's `register-all` correct it atomically based on real artifacts. Silent edits now would add another layer of state drift.

---

## 5. Risks & gotchas for future sessions

1. **M16 is fat.** M16 / M16b / M16c / M16 hardening waves together represent multiple months of work. A single milestone entry will distort dependency analysis. Split in Session E.

2. **Migration prefix convention is inconsistent.** M1, M3, M9, M12, M16 have no migration prefix. Reconstruction must use commit history + migration content scanning as fallback.

3. **Gallery/* subfolder is messy.** Contains a mix of feature PRDs, fix status reports, and deployment guides. Classify carefully — status reports are NOT requirements.

4. **Digital_Inivtation_PRD.md filename typo** — keep the typo in the docs path for traceability, but the generated PRD.md should use "Digital Invitation PRD" as the section title.

5. **Dual CoverPhotoSystem.md** — exists at both `docs/TechnicalRequirements/CoverPhotoSystem.md` and `docs/TechnicalRequirements/Gallery/CoverPhotoSystem.md`, same size (23770 bytes). Verify they're identical or reconcile in Session B.

6. **Dual Asset_Management.md** — exists at root and in `Gallery/`, different sizes (4755 vs 4367). Reconcile in Session B.

7. **Desktop companion is M17 or M18?** The decision packet assigns the hardening work to M17 and reassigns the Desktop companion references to M18. Session E must respect this — when constructing milestones.md, M17 slot is reserved for hardening-closure (Session G will fill it via feature mode).

8. **`tests/m13`** has a known-failing integration test (`backend/tests/m13`) due to rootless Docker on Windows limitation (per AGENTS.md). Not a code bug. Session C/D/F must not introduce test-strategy gates that would fail on this.

9. **Context budget per session.** Session D (system design) is the heaviest. Budget it with the expectation of spanning multiple sub-sessions via `--resume`. Phase 3 gap review in autonomous mode dispatches `architecture-analyst` + `feature-completeness-reviewer` in parallel — that's context-heavy.

10. **DO NOT attempt `cobolt-plan project --autonomous`** for reconstruction. Autonomous mode auto-chains to `cobolt-build M{first-unbuilt}` at the end, which would try to build M1 — a milestone that is already fully shipped. Reconstruction is planning-only; the user must manually run `cobolt-build M17` only after Session G completes.

---

## 6. What future sessions need from this session

- **This document** as the reconstruction spec
- **The decision packet** (`2026-04-11-m17-decision-packet.md`) — locks in F-007/F-013 design decisions for Session G
- The 360° audit — input for Session G (M17 feature planning)
- The M16 hardening plan — input for Session G
- `cobolt-state.json` drift list (Section 4) — for Session B cleanup
- The milestone hypothesis (Section 2) — for Session E's decomposition work

---

## 7. Exit status for Session A

- **cobolt-plan feature invocation**: HALTED at precondition check. No feature artifacts written.
- **Session A kickoff deliverables**: COMPLETE (decision packet + this reconstruction plan).
- **cobolt-state.json**: NOT modified this session. Left stale for Session B to clean up.
- **Recommended next command**: `/cobolt-plan project --from-folder docs/TechnicalRequirements/` — run in a FRESH conversation to get a clean context budget for Phase 1.
- **Decision packet preservation**: `docs/superpowers/plans/2026-04-11-m17-decision-packet.md` survives untouched. It is the source of truth for Session G's M17 feature run.
- **No code changes**: zero files under `backend/`, `frontend/`, or `tests/` modified this session. Only `docs/superpowers/plans/` received new files.
