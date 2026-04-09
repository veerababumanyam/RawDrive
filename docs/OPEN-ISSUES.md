# Open Issues — M2/M11 Build Gaps

> **Last Updated:** 2026-04-09 (v0.0.12)  
> **Source of Truth:** `_cobolt-output/latest/planning/issue-and-blocker-tracker.json`  
> **Status:** 16 open, 3 resolved

## Implementation Sequence

Issues must be resolved in this order due to dependencies between milestones:

```
Phase 1: M11 P1 blockers (blocks M12, M13)
  ├── ISS-009: Derivatives (cover variants, HEIC, video poster) ← BLOCKS M12
  ├── ISS-016: Gallery state machine (draft→shared→expired)    ← BLOCKS M13  
  ├── ISS-008: Burst grouping + aesthetic scoring
  └── ISS-017: Composable filters + bulk endpoint

Phase 2: M2 P1 blockers (blocks M13, M15)
  ├── ISS-004: PWA service worker + manifest                   ← BLOCKS M13
  ├── ISS-001: TUS protocol compliance
  ├── ISS-002: Share link access modes + analytics
  └── ISS-003: Batch/ZIP download

Phase 3: P2 items (can run in parallel, no blockers)
  ├── ISS-010: Real LQIP base64 generation
  ├── ISS-013: Virtual collections cascade logic
  ├── ISS-014: Storage analytics handler
  ├── ISS-019: useStorageQuota frontend hook
  ├── ISS-005: BYOS storage settings UI
  ├── ISS-006: Cover photo crop UI
  ├── ISS-007: Processing pipeline integration test
  └── ISS-018: Timeline endpoint + asset detail panel
```

## Blocking Dependencies

| Issue | Blocks | Why |
|-------|--------|-----|
| ISS-009 (derivatives) | M12 (Gallery Design Studio) | Cover variants (1920/1280/640) needed for design editor |
| ISS-016 (gallery states) | M13 (Gallery Viewer) | Viewer needs published/shared/expired states |
| ISS-004 (PWA) | M13 (Gallery Viewer) | Viewer must be installable PWA with offline support |
| ISS-002 (share links) | M13 (Gallery Sharing) | Sharing needs access modes and analytics |

## M11 Open Issues (10)

### P1 — Must fix before M12/M13

| ID | Story | Title | What's needed |
|----|-------|-------|---------------|
| ISS-008 | E32-S1 | Burst grouping + aesthetic scoring | Add burst clustering (3s threshold) and AI quality score to exif_service.go |
| ISS-009 | E32-S2 | Cover variants, HEIC, video poster | Extend thumbnail_service.go: 6 derivative sizes, HEIC→WebP, ffmpeg poster, asset_derivatives table |
| ISS-016 | E34-S2 | Gallery state machine | Add state transitions (draft→shared→expired→archived→deleted) to gallery_service.go + background expiry job |
| ISS-017 | E34-S3 | Composable filters + bulk ops | Build query builder in asset_repo.go, POST /bulk endpoint in asset_handler.go, frontend filter UI |

### P2 — Can defer

| ID | Story | Title |
|----|-------|-------|
| ISS-007 | E32-S4 | Processing pipeline integration test |
| ISS-010 | E32-S3 | Real LQIP base64 (replace placeholder) |
| ISS-013 | E33-S3 | Virtual collections cascade warnings |
| ISS-014 | E33-S4 | Storage analytics handler |
| ISS-018 | E34-S4 | Timeline endpoint + asset detail panel |
| ISS-019 | E33-S1 | useStorageQuota frontend hook |

## M2 Open Issues (6)

### P1

| ID | Story | Title | What's needed |
|----|-------|-------|---------------|
| ISS-001 | E4-S1 | TUS protocol compliance | Add Tus-Resumable/Upload-Offset/Upload-Length headers to chunked_upload.go; add resume to use-upload.ts |
| ISS-002 | E7-S2 | Share link enforcement | Add access modes (view-only/download), PIN verification, analytics tracking, expiry check to share_link_service.go |
| ISS-003 | E7-S2 | Batch/ZIP download | New endpoint + ZIP generation for bulk gallery downloads |
| ISS-004 | E7-S1 | PWA service worker | Create g/[slug]/layout.tsx, public/sw.js, manifest.json |

### P2

| ID | Story | Title |
|----|-------|-------|
| ISS-005 | E5-S2 | BYOS storage settings UI page |
| ISS-006 | E6-S3 | Cover photo crop UI page |

## How to resolve

```bash
# Resolve a specific issue:
# 1. Find the issue in this file
# 2. Read the story file: _cobolt-output/latest/planning/stories/{epic}-{story}-*.md
# 3. Implement the fix
# 4. Run tests: cd backend && go test ./internal/... -count=1
# 5. Update issue-and-blocker-tracker.json: set status="resolved"
# 6. Update this file: move issue from Open to Resolved section

# Build all remaining M11 issues:
/cobolt-build M11 --auto --resume

# Build all remaining M2 issues:
/cobolt-build M2 --auto --resume
```
