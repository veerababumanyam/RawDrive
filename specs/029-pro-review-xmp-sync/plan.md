# Implementation Plan: Pro Review Mode & Desktop Sync

**Branch**: `029-pro-review-xmp-sync` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/029-pro-review-xmp-sync/spec.md`

## Summary

This feature introduces a professional photo culling workflow ("Review Mode") to RawDrive's web application with Lightroom-style keyboard shortcuts (1-5 ratings, P/U/X flags), bidirectional XMP sidecar sync for Lightroom Classic integration, and native desktop applications (Windows + macOS) for automated folder-to-gallery live sync similar to Google Drive/OneDrive.

**Three major components:**
1. **Review Mode UI** - 3-pane Lightroom-style interface in React
2. **XMP Sync API** - Backend services for XMP import/export with SOC2/GDPR compliance
3. **Desktop Sync Apps** - Native Windows/macOS apps using Tauri for folder watching and bidirectional sync

## Technical Context

**Language/Version**:
- Backend: Python 3.11 (FastAPI)
- Frontend: TypeScript 5.3+ (React 18.3, Vite)
- Desktop App: Rust + TypeScript (Tauri 2.x for native shell, React for UI)

**Primary Dependencies**:
- Backend: FastAPI, SQLAlchemy 2.0, python-xmp-toolkit or lxml (XMP parsing), zipfile
- Frontend: React 18.3, TailwindCSS 3.x, react-hotkeys-hook (keyboard shortcuts), react-virtualized
- Desktop: Tauri 2.x, notify (file watcher), keyring (secure credential storage), reqwest (HTTP)

**Storage**:
- PostgreSQL 16 (ratings, flags, color labels, sync API keys, folder mappings, sync logs)
- Redis 7 (sync queue, real-time notifications)
- Local filesystem (desktop app config, sync queue persistence)

**Testing**:
- Backend: pytest, pytest-asyncio
- Frontend: Vitest, React Testing Library, Playwright (E2E)
- Desktop: Rust unit tests, Tauri test utilities, manual testing on Windows/macOS

**Target Platform**:
- Web: Modern browsers (Chrome, Firefox, Safari, Edge)
- Desktop: Windows 10/11 (64-bit), macOS 12+ (Apple Silicon + Intel)

**Project Type**: Web + Desktop (multi-platform)

**Performance Goals**:
- Keyboard shortcut response: <100ms
- Review Mode load: <1s
- File change detection: <5s
- XMP export (500 files): <30s
- Upload (50MB file): <60s on 10Mbps

**Constraints**:
- Desktop app memory: <200MB for 10 folder mappings
- API key storage: OS-native secure storage only
- No admin privileges for installation
- Offline-capable sync queue

**Scale/Scope**:
- Galleries with 10,000+ images
- Up to 10 folder mappings per user
- Concurrent sync across multiple folders

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution template is not yet customized for RawDrive. Proceeding with standard best practices:

| Gate | Status | Notes |
|------|--------|-------|
| Test-First | PASS | Unit tests for keyboard handlers, XMP parser, sync logic |
| Integration Testing | PASS | API contract tests, E2E for Review Mode, desktop-to-cloud sync tests |
| Observability | PASS | Sync operation logging, error tracking, metrics |
| Security | PASS | OS-native credential storage, API key scoping, SOC2 audit trail |
| Simplicity | REVIEW | Desktop app adds complexity; justified by user value |

## Project Structure

### Documentation (this feature)

```text
specs/029-pro-review-xmp-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output - technology decisions
├── data-model.md        # Phase 1 output - database schema
├── quickstart.md        # Phase 1 output - development setup
├── contracts/           # Phase 1 output - API specifications
│   ├── xmp-sync-api.yaml
│   └── desktop-sync-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Web Application (existing structure - extended)
frontend/
├── src/
│   ├── components/
│   │   └── features/
│   │       └── gallery/
│   │           └── review/           # NEW: Review Mode components
│   │               ├── ReviewWorkbench.tsx
│   │               ├── ReviewFilmstrip.tsx
│   │               ├── ReviewCanvas.tsx
│   │               ├── ReviewMetadataPanel.tsx
│   │               ├── RatingStars.tsx
│   │               ├── FlagIndicator.tsx
│   │               ├── HistogramDisplay.tsx
│   │               └── KeyboardShortcutHelp.tsx
│   ├── hooks/
│   │   ├── useReviewMode.ts          # NEW: Review state management
│   │   ├── useKeyboardShortcuts.ts   # NEW: Rating/flag shortcuts
│   │   └── useXmpSync.ts             # NEW: XMP import/export
│   └── services/
│       └── xmpSyncService.ts         # NEW: XMP API client
└── tests/
    └── components/
        └── review/                    # NEW: Review Mode tests

# Backend Services (existing structure - extended)
services/gallery-service/
├── src/
│   ├── api/v1/
│   │   ├── xmp_sync.py               # NEW: XMP import/export endpoints
│   │   └── sync_keys.py              # NEW: API key management
│   ├── services/
│   │   ├── xmp_service.py            # NEW: XMP generation/parsing
│   │   └── sync_key_service.py       # NEW: API key lifecycle
│   ├── schemas/
│   │   └── xmp_sync.py               # NEW: Request/response models
│   └── repositories/
│       └── sync_key_repository.py    # NEW: API key persistence
└── tests/
    └── services/
        └── test_xmp_service.py       # NEW: XMP golden master tests

# Desktop Sync Application (NEW - Tauri project)
desktop/
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs                   # Entry point
│   │   ├── commands/                 # Tauri commands
│   │   │   ├── auth.rs               # Authentication
│   │   │   ├── sync.rs               # Sync operations
│   │   │   └── config.rs             # Settings management
│   │   ├── services/
│   │   │   ├── file_watcher.rs       # Folder monitoring
│   │   │   ├── sync_queue.rs         # Upload queue
│   │   │   ├── xmp_handler.rs        # XMP file detection
│   │   │   └── api_client.rs         # RawDrive API client
│   │   ├── storage/
│   │   │   ├── keyring.rs            # Secure credential storage
│   │   │   └── config.rs             # Local config persistence
│   │   └── tray/
│   │       └── mod.rs                # System tray integration
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                              # React frontend (shared with web concepts)
│   ├── App.tsx
│   ├── components/
│   │   ├── SetupWizard.tsx           # First-run configuration
│   │   ├── FolderMappingList.tsx     # Manage sync folders
│   │   ├── SyncStatus.tsx            # Current sync state
│   │   └── Settings.tsx              # Preferences
│   └── services/
│       └── tauriApi.ts               # Tauri command wrappers
├── package.json
└── vite.config.ts

# Database Migrations
backend/migrations/versions/
├── 0169_add_asset_rating_flag.py     # NEW: Rating/flag columns
├── 0170_add_sync_api_keys.py         # NEW: API key table
└── 0171_add_sync_audit_log.py        # NEW: Sync operation audit
```

**Structure Decision**: Hybrid Web + Desktop architecture. The desktop app is a separate Tauri project (`desktop/`) with its own build pipeline, while web components extend the existing `frontend/` and `services/gallery-service/` structure. This maintains separation of concerns while sharing API contracts.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Desktop app (new platform) | Users require seamless Lightroom integration without manual file handling | Web-only XMP export requires tedious manual download/upload workflow |
| Tauri (Rust + JS) | Cross-platform native app with small binary size, OS-native security APIs | Electron rejected due to 200MB+ bundle size; pure web rejected due to file system access limitations |
| Dual sync mechanism (XMP + Folder) | Web-only users need simple export; power users need automated sync | Single approach would exclude one user segment |

## Phase 0 Outputs

**Status**: Complete

See: [`research.md`](./research.md)
- XMP parsing library decision: lxml with custom handler
- Desktop framework decision: Tauri 2.x
- File watching: notify crate
- Keyboard shortcuts: react-hotkeys-hook
- API key security design

## Phase 1 Outputs

**Status**: Complete

See:
- [`data-model.md`](./data-model.md) - Database schema for ratings, flags, API keys, sync logs
- [`contracts/xmp-sync-api.yaml`](./contracts/xmp-sync-api.yaml) - OpenAPI spec for XMP import/export
- [`contracts/desktop-sync-api.yaml`](./contracts/desktop-sync-api.yaml) - OpenAPI spec for desktop sync endpoints
- [`quickstart.md`](./quickstart.md) - Development environment setup

## Next Steps

1. Run `/speckit.tasks` to generate `tasks.md` with implementation task breakdown
2. Begin implementation following the task order
3. Create database migrations (0169, 0170, 0171)
4. Implement Review Mode UI components
5. Implement XMP sync API
6. Initialize Tauri desktop project
7. Implement desktop sync functionality
