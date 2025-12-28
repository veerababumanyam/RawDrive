# Data Model: Fix Library Photo Operations

**Feature**: 011-fix-library-photo-operations
**Date**: 2025-12-28

## Overview

This feature is a bug fix and does not introduce new data models. This document details the existing data structures and state flows that need to be corrected.

---

## Existing Database Schema (No Changes)

### Assets Table

```sql
CREATE TABLE assets (
  asset_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
  folder_id UUID REFERENCES library_folders(folder_id),  -- NULL = root
  original_object_key TEXT NOT NULL,
  original_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,  -- 'photo' | 'video'
  status VARCHAR(50) NOT NULL,  -- 'available' | 'processing' | 'deleted'
  exif JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(user_id)
);
```

### Library Folders Table

```sql
CREATE TABLE library_folders (
  folder_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
  parent_folder_id UUID REFERENCES library_folders(folder_id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(7),  -- Hex color
  cover_asset_id UUID REFERENCES assets(asset_id),
  pin VARCHAR(255),  -- Encrypted PIN
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Gallery Assets Junction Table

```sql
CREATE TABLE gallery_assets (
  gallery_id UUID NOT NULL REFERENCES galleries(gallery_id),
  asset_id UUID NOT NULL REFERENCES assets(asset_id),
  position INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by_user_id UUID REFERENCES users(user_id),
  PRIMARY KEY (gallery_id, asset_id)
);
```

---

## Frontend State Model

### LibraryPage State (Relevant to Bug)

```typescript
// Current state structure in LibraryPage.tsx
interface LibraryPageState {
  // Data state
  assets: LibraryAsset[];
  folders: LibraryFolder[];
  currentFolder: LibraryFolderDetail | null;

  // Selection state (BUG SOURCE)
  selectedIds: Set<string>;  // Asset IDs currently selected

  // Filter state
  personFilter: string | null;  // From URL param ?person=<id>
  filterPerson: FaceGroup | null;  // Fetched person details

  // Modal state
  isMoveModalOpen: boolean;  // MoveToGalleryModal
  showMoveToFolder: boolean;  // MoveToLibraryFolderModal

  // Loading state
  loading: boolean;
  loadError: string | null;
}
```

---

## State Flow Diagrams

### Current Flow (Buggy)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT BUGGY FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Root View]                                                    │
│       │                                                         │
│       ▼                                                         │
│  selectedIds = {A, B, C}  ← User selects 3 photos              │
│       │                                                         │
│       ▼                                                         │
│  User clicks person in People panel                             │
│       │                                                         │
│       ▼                                                         │
│  URL changes: ?person=123                                       │
│       │                                                         │
│       ▼                                                         │
│  fetchAssets() called with face_group_id=123                   │
│       │                                                         │
│       ▼                                                         │
│  assets = [X, Y, Z]  ← New filtered assets                     │
│  selectedIds = {A, B, C}  ← STALE! Not cleared ❌              │
│       │                                                         │
│       ▼                                                         │
│  User opens "Move to Folder" modal                              │
│       │                                                         │
│       ▼                                                         │
│  Modal submits selectedIds {A, B, C}                           │
│       │                                                         │
│       ▼                                                         │
│  API: POST /library/assets/move                                 │
│       body: { asset_ids: [A, B, C], folder_id: "targetFolder" } │
│       │                                                         │
│       ▼                                                         │
│  ❌ WRONG ASSETS MOVED!                                        │
│     (User intended to move X, Y, Z but A, B, C were moved)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Fixed Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      FIXED FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Root View]                                                    │
│       │                                                         │
│       ▼                                                         │
│  selectedIds = {A, B, C}  ← User selects 3 photos              │
│       │                                                         │
│       ▼                                                         │
│  User clicks person in People panel                             │
│       │                                                         │
│       ▼                                                         │
│  URL changes: ?person=123                                       │
│       │                                                         │
│       ▼                                                         │
│  useEffect detects personFilter change                          │
│       │                                                         │
│       ▼                                                         │
│  setSelectedIds(new Set())  ← CLEAR SELECTION ✓                │
│       │                                                         │
│       ▼                                                         │
│  fetchAssets() called with face_group_id=123                   │
│       │                                                         │
│       ▼                                                         │
│  assets = [X, Y, Z]  ← New filtered assets                     │
│  selectedIds = {}  ← Empty, fresh start ✓                      │
│       │                                                         │
│       ▼                                                         │
│  User selects X, Y from filtered view                           │
│  selectedIds = {X, Y}  ← Correct for current view              │
│       │                                                         │
│       ▼                                                         │
│  User opens "Move to Folder" modal                              │
│       │                                                         │
│       ▼                                                         │
│  Modal submits selectedIds {X, Y}                               │
│       │                                                         │
│       ▼                                                         │
│  API: POST /library/assets/move                                 │
│       body: { asset_ids: [X, Y], folder_id: "targetFolder" }   │
│       │                                                         │
│       ▼                                                         │
│  ✓ CORRECT ASSETS MOVED!                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Contracts (Existing - No Changes)

### Move Assets to Folder

```typescript
// POST /api/v1/workspaces/{workspace_id}/library/assets/move
interface MoveAssetsRequest {
  asset_ids: string[];      // UUID array
  folder_id: string | null; // null = move to root
}

interface MoveAssetsResponse {
  moved: boolean;
  count: number;
}
```

### Add Assets to Gallery

```typescript
// POST /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets
interface AddAssetsRequest {
  asset_ids: string[];  // UUID array
}

interface AddAssetsResponse {
  success: boolean;
  count: number;
}
```

---

## State Transitions

### Selection State Transitions

| Event | Current State | Next State | Notes |
|-------|--------------|------------|-------|
| User clicks photo | `selectedIds` | `selectedIds ∪ {photoId}` | Add to selection |
| User clicks selected photo | `selectedIds` | `selectedIds - {photoId}` | Remove from selection |
| Select All | `selectedIds` | `Set(allVisibleIds)` | All visible assets |
| Clear selection | `selectedIds` | `{}` | Empty set |
| **Person filter changes** | `selectedIds` | **`{}`** | **NEW: Clear on filter** |
| **Folder changes** | `selectedIds` | **`{}`** | **NEW: Clear on folder nav** |
| Move succeeds | `selectedIds` | `{}` | Clear after operation |
| Add to gallery succeeds | `selectedIds` | `{}` | Clear after operation |

### Modal State Transitions

| Event | Modal State | Action |
|-------|-------------|--------|
| Click "Move to Folder" | `showMoveToFolder = true` | Open modal |
| Click "Add to Gallery" | `isMoveModalOpen = true` | Open modal |
| Click Cancel | `* = false` | Close modal |
| Submit Success | `* = false` | Close modal, show success toast |
| Submit Error | `* = true` | Keep open, show error toast |

---

## Validation Rules (Existing - No Changes)

### Move Assets Validation

1. `asset_ids` must be non-empty array
2. All `asset_ids` must belong to same `workspace_id`
3. `folder_id` must exist in workspace (if not null)
4. User must have `assets:write` permission

### Add to Gallery Validation

1. `asset_ids` must be non-empty array
2. All `asset_ids` must belong to same `workspace_id`
3. `gallery_id` must exist in workspace
4. User must have `galleries:write` permission
