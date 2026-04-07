# Studio Desktop Companion & Source-Side Media Workflow Implementation Plan

**Document Status:** Draft v1.0  
**Date:** 2026-04-06  
**Scope:** Windows/macOS desktop companion, source-side live encoding, source-side upload preparation, zero RawDrive server-side media processing in the default path

---

## 1. Overview

This plan delivers a **Windows/macOS desktop companion** for studio operators while preserving the product rules now defined in:

- [Studio_Desktop_Companion.md](Studio_Desktop_Companion.md)
- [LiveStreaming.md](LiveStreaming.md)
- [Video_Transcoding_Delivery.md](Video_Transcoding_Delivery.md)
- [Techstack.md](../Techstack.md)

The core architecture rule is unchanged throughout all phases:

- **Live first-mile encoding happens on the broadcaster machine**
- **Large upload/local heavy work happens on the client machine where useful**
- **Cloudflare Stream remains the playback/delivery transcode engine**
- **RawDrive application servers do not become a server-side media-processing farm**

---

## 2. Codebase Research Summary

### 2.1 What Already Exists

- Browser/PWA frontend exists in [frontend/package.json](../../../frontend/package.json).
- Centralized PWA behavior exists in [frontend/src/contexts/PWAContext.tsx](../../../frontend/src/contexts/PWAContext.tsx).
- Live Sync UI already exists in [frontend/src/pages/workspace/LiveSyncPage.tsx](../../../frontend/src/pages/workspace/LiveSyncPage.tsx).
- Live Sync API client already exists in [frontend/src/services/liveSyncService.ts](../../../frontend/src/services/liveSyncService.ts).
- Backend is Go-based in [backend/go.mod](../../../backend/go.mod).
- CLI workflows already exist conceptually in [CLI_Tooling_Automation.md](../CLI_Tooling_Automation.md).

### 2.2 Implications

- The fastest route is **not** a greenfield desktop ecosystem.
- We should reuse:
  - existing auth/workspace model
  - existing Live Sync concepts
  - existing upload and status APIs where possible
  - existing browser/PWA flows for fallback
- The first milestone should focus on **desktop orchestration and local integration**, not rebuilding the product UI from scratch.

### 2.3 Current Gaps

- No verified desktop shell implementation yet.
- No verified local encoder integration yet.
- No verified packaged desktop installer or updater yet.
- No explicit desktop-side local agent/service implementation yet.

---

## 3. Delivery Principles

### 3.1 Hard Rules

- Do not add default server-side live encoding.
- Do not add default server-side video transcoding.
- Do not require desktop install for public viewers.
- Do not block ordinary browser workflows that do not need local heavy lifting.

### 3.2 MVP Priorities

- OBS-first broadcaster support.
- Desktop login and workspace selection.
- Desktop live-event preflight and encoder guidance.
- Desktop folder watch and resumable upload sessions.
- Diagnostics, logs, and support bundle export.

### 3.3 Deferred Until After MVP

- Broad vMix/native encoder automation beyond validated secondary support.
- Deep local media preprocessing beyond checksum/metadata/basic validation.
- Advanced desktop editing or timeline features.
- Replacing CLI workflows.

---

## 4. Phased Plan

## Phase 0: Foundation and Architecture Lock

### Goal
Define the desktop delivery model and support boundary before implementation starts.

### Tasks

- Create an ADR for the desktop shell choice.
- Decide whether the desktop product is:
  - a thin shell around hosted web UI plus native bridges
  - a thicker desktop UI with local worker processes
- Define installer/signing/update strategy for Windows and macOS.
- Define the support matrix:
  - Windows versions
  - macOS versions
  - OBS Studio launch version baseline
  - secondary best-effort encoder support
- Define the desktop-local secret storage strategy.
- Define the local log bundle schema.

### Exit Criteria

- Desktop shell ADR approved.
- Support matrix draft approved.
- “No RawDrive server-side media processing” rule captured in architecture review.

---

## Phase 1: Desktop Platform Foundation

### Goal
Ship a usable desktop shell that can authenticate and connect to existing RawDrive backend services.

### Tasks

- Implement desktop app bootstrap for Windows/macOS.
- Implement sign-in flow using the same backend auth model as the web app.
- Implement workspace selection and persistence.
- Implement secure token storage using OS-appropriate storage.
- Implement desktop app versioning, environment config, and telemetry identity.
- Implement local log store and support bundle export.
- Add backend recognition for desktop client identity if needed.

### Dependencies

- Depends on Phase 0 desktop shell decision.

### Exit Criteria

- User can install and log in on Windows/macOS.
- User can select a workspace and reconnect after restart.
- Tokens are not stored in plain text.
- Support bundle export works.

---

## Phase 2: Live Broadcaster MVP

### Goal
Deliver the first professional live-stream workflow using **OBS Studio** as the first-class supported encoder path.

### Tasks

- Extend event detail/live setup to expose a desktop-oriented preflight flow.
- Implement ingest profile validation:
  - protocol
  - credentials presence
  - stream key handling
  - recommended bitrate/resolution/audio checks
- Implement OBS-first guided setup UX.
- Implement desktop-side event readiness checklist.
- Implement local diagnostics around encoder connection attempts and recent failures.
- Integrate desktop state with backend event status and Cloudflare live state reconciliation.
- Add “unsupported workflow” messaging for non-supported encoders.

### Dependencies

- Depends on Phase 1 auth/workspace/token storage.
- Depends on existing live-event and Cloudflare provisioning flows from [LiveStreaming.md](LiveStreaming.md).

### Exit Criteria

- Broadcaster can prepare a live event from Windows/macOS.
- Broadcaster receives an OBS-first setup path.
- Failed preflight blocks false-ready states.
- RawDrive backend remains orchestration-only; media encode still happens locally.

---

## Phase 3: Upload and Sync MVP

### Goal
Deliver the first desktop-heavy upload workflow for large files and folder watch.

### Tasks

- Implement local folder picker and sync mapping creation.
- Reuse or extend the Live Sync concepts already represented in:
  - [frontend/src/pages/workspace/LiveSyncPage.tsx](../../../frontend/src/pages/workspace/LiveSyncPage.tsx)
  - [frontend/src/services/liveSyncService.ts](../../../frontend/src/services/liveSyncService.ts)
- Implement folder watch agent behavior.
- Implement resumable upload sessions and restart recovery.
- Implement local checksuming and metadata extraction before upload.
- Implement upload queue state:
  - detected
  - queued
  - uploading
  - paused
  - completed
  - failed
- Implement desktop notifications for completion/failure/stall.

### Dependencies

- Depends on Phase 1 desktop foundation.
- Should share backend session/mapping semantics with current Live Sync service where possible.

### Exit Criteria

- User can map a folder to a gallery.
- Sync survives app restart/network interruption.
- Session progress is visible locally and in the existing workspace surface.
- Server remains orchestration/storage policy only, not media transcode.

---

## Phase 4: Hardening, Supportability, and Controlled Expansion

### Goal
Make the desktop product supportable at scale and safe for production rollout.

### Tasks

- Add richer diagnostics and self-checks.
- Add support bundle masking rules.
- Add crash recovery workflows.
- Add low-confidence/best-effort support path for approved secondary encoders.
- Add operator guidance for:
  - sleep/wake behavior
  - network loss
  - paused uploads
  - stale sessions
- Add release channels:
  - internal
  - pilot
  - public
- Add install/update runbook and rollback plan.

### Dependencies

- Depends on Phases 2 and 3.

### Exit Criteria

- Support team can investigate failures from exported bundles.
- Pilot users can update safely.
- Secondary support matrix is documented instead of ad hoc.

---

## Phase 5: Optional Future Expansion

### Goal
Add carefully approved improvements without violating the server-cost boundary.

### Candidate Items

- Better desktop-to-OBS handoff automation.
- Secondary encoder support matrix expansion.
- More local media preprocessing where it saves upload time or operator effort.
- More advanced sync filtering and routing rules.
- Optional desktop wrapper for a broader operator dashboard.

### Must Not Change

- Cloudflare remains delivery/transcode backbone.
- RawDrive servers remain control-plane systems unless a separate architecture decision says otherwise.

---

## 5. Task Breakdown by Workstream

| Workstream | Scope | Primary Surface |
|---|---|---|
| W1 | Desktop shell, install, auth, token storage | Desktop client |
| W2 | Live broadcaster preflight and OBS-first workflow | Desktop client + live APIs |
| W3 | Folder watch, queueing, resumable sync | Desktop client + upload/sync APIs |
| W4 | Diagnostics, logs, support bundle, observability | Desktop client + support tooling |
| W5 | UX alignment and browser fallback behavior | Web app + desktop client |
| W6 | Backend API adjustments only where orchestration requires them | Backend control plane |

---

## 6. Dependency Graph

| Task ID | Task | Depends On | Wave |
|---|---|---|---|
| T1 | Desktop shell ADR | None | 1 |
| T2 | Support matrix definition | T1 | 1 |
| T3 | Desktop auth/token storage | T1 | 2 |
| T4 | Desktop logging/support bundle | T1 | 2 |
| T5 | Workspace/session foundation | T3 | 2 |
| T6 | Live preflight engine | T3, T5 | 3 |
| T7 | OBS-first setup UX | T6 | 3 |
| T8 | Live event/backend reconciliation | T6 | 3 |
| T9 | Folder watch engine | T3, T5 | 4 |
| T10 | Resumable upload queue | T9 | 4 |
| T11 | Live Sync workspace integration | T10 | 4 |
| T12 | Notifications/crash recovery | T4, T10 | 5 |
| T13 | Secondary encoder support policy | T7, T12 | 6 |
| T14 | Pilot rollout and support runbooks | T12, T13 | 6 |

---

## 7. Recommended Implementation Order

### Wave 1
- T1 Desktop shell ADR
- T2 Support matrix definition

### Wave 2
- T3 Desktop auth/token storage
- T4 Desktop logging/support bundle
- T5 Workspace/session foundation

### Wave 3
- T6 Live preflight engine
- T7 OBS-first setup UX
- T8 Live event/backend reconciliation

### Wave 4
- T9 Folder watch engine
- T10 Resumable upload queue
- T11 Live Sync workspace integration

### Wave 5
- T12 Notifications/crash recovery

### Wave 6
- T13 Secondary encoder support policy
- T14 Pilot rollout and support runbooks

---

## 8. MVP Definition

The MVP is complete when all of the following are true:

- Windows/macOS desktop install works.
- Shared auth/workspace context works.
- OBS Studio is the first-class supported live encoder path.
- Broadcaster live preflight works before go-live.
- Folder watch + resumable upload works for large media.
- Existing browser/PWA viewer flows remain untouched.
- RawDrive servers are still orchestration-only for media workloads.

---

## 9. Acceptance Traceability

| Requirement Area | Covered By |
|---|---|
| Windows/macOS support | Phases 0-1 |
| Shared auth/workspace | Phase 1 |
| Source-side live encoding | Phase 2 |
| OBS-first support | Phase 2 |
| Local diagnostics | Phases 1-2 |
| Folder watch and resumable upload | Phase 3 |
| Local preprocessing/checksuming | Phase 3 |
| Browser fallback | Phases 1, 5 |
| No RawDrive server-side media farm | All phases, architecture guardrail |

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Desktop shell decision stalls delivery | High | Timebox ADR in Phase 0 |
| Overreaching into a full production app | High | Keep OBS-first and orchestration-only scope |
| Hidden server-side media creep | High | Enforce explicit architecture gate for any such proposal |
| Sync reliability issues on sleep/wake | Medium | Add restart recovery and session reconciliation early |
| Broad encoder compatibility demands | Medium | Publish support matrix and label unsupported paths clearly |
| Desktop product duplicates web product | Medium | Restrict MVP to heavy local workflows only |

---

## 11. Recommended Next Build Slice

If we start implementation immediately, the best first slice is:

1. Desktop shell ADR and app bootstrap
2. Shared auth/workspace session
3. Support bundle/logging foundation
4. OBS-first live-event preflight MVP

That gives the fastest proof that the product direction works without forcing any server-side media architecture.
