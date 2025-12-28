# Data Model: Face Group Merge & Primary Face Selection

**Feature**: 008-face-group-merge
**Date**: 2025-12-28

## Entity Overview

This feature extends existing entities rather than creating new tables. The core data model for face detection already exists.

---

## Existing Entities (No Changes Required)

### Face Group (`face_groups` table)

Represents a cluster of faces believed to be the same person.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Tenant isolation (FK to workspaces) |
| `name` | VARCHAR(255) | Optional display name |
| `representative_face_id` | UUID | **Primary face** - used for thumbnail and weighted matching |
| `centroid` | vector(512) | Average embedding of all faces in group |
| `face_count` | INTEGER | Denormalized count of faces |
| `person_id` | UUID | Optional link to Person entity |
| `hidden` | BOOLEAN | Whether to hide in UI |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last modification |

**Key Points**:
- `representative_face_id` already exists and stores the primary face
- This feature adds UI to select it and backend logic to use it for weighted centroid

### Face (`faces` table)

Individual detected face with embedding.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Tenant isolation |
| `photo_id` | UUID | Source asset (FK to assets) |
| `face_group_id` | UUID | Parent group (FK to face_groups) |
| `bounding_box` | JSONB | Position in image (x, y, width, height as %) |
| `confidence` | DECIMAL(5,4) | Detection confidence 0-1 |
| `embedding` | vector(512) | 512-dim face embedding |
| `thumbnail_urls` | JSONB | Small/medium/large thumbnail URLs |
| `provider` | VARCHAR(50) | AI provider that detected this face |
| `created_at` | TIMESTAMPTZ | Detection timestamp |

### Person (`people` table)

Named identity linked to face groups.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `workspace_id` | UUID | Tenant isolation |
| `name` | VARCHAR(255) | Display name |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

## Data Flow: Multi-Group Merge

```
Before Merge:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Group A (3 faces)│  │ Group B (5 faces)│  │ Group C (2 faces)│
│ name: "John"     │  │ name: null       │  │ name: null       │
│ rep_face: A1     │  │ rep_face: B1     │  │ rep_face: C1     │
│ centroid: [...]  │  │ centroid: [...]  │  │ centroid: [...]  │
└───────┬─────────┘  └───────┬──────────┘  └───────┬──────────┘
        │                    │                     │
        └────────────────────┼─────────────────────┘
                             ▼
After Merge (Group A is target):
┌────────────────────────────────────────────────────────────────┐
│ Group A (10 faces)                                              │
│ name: "John" (preserved from original)                          │
│ rep_face: user-selected (or original A1)                        │
│ centroid: weighted_average([A1*2, A2, A3, B1, B2, B3, B4, B5,  │
│                              C1, C2])                           │
└────────────────────────────────────────────────────────────────┘

Groups B and C: DELETED
Faces B1-B5, C1-C2: face_group_id updated to Group A's ID
```

---

## Validation Rules

### Multi-Merge Validation

| Rule | Validation |
|------|------------|
| Minimum groups | At least 2 groups required |
| Maximum groups | No more than 100 groups per operation |
| Same workspace | All groups must belong to same workspace |
| No self-merge | Target group cannot appear in source list |
| Groups exist | All group IDs must be valid |

### Primary Face Validation

| Rule | Validation |
|------|------------|
| Face exists | Face ID must exist in database |
| Same workspace | Face must belong to same workspace |
| Belongs to group | Face must be a member of the target group |

---

## State Transitions

### Face Group Lifecycle

```
┌──────────┐
│ Created  │ ◄─── New faces detected, auto-clustered
└────┬─────┘
     │
     ▼
┌──────────┐
│ Active   │ ◄─── Normal state, can be viewed/filtered
└────┬─────┘
     │ ┌─────────────────────────────────────┐
     │ │                                     │
     │ ▼                                     │
     │ ┌──────────┐     ┌──────────────────┐ │
     └►│ Merged   │ ───►│ Source: DELETED  │ │
       │ (target) │     │ Target: UPDATED  │ │
       └────┬─────┘     └──────────────────┘ │
            │                                │
            │ (split)                        │
            ▼                                │
       ┌──────────┐                          │
       │ Split    │ ─────────────────────────┘
       │ (new grp)│
       └──────────┘
```

### Merge Operation States

| State | Description |
|-------|-------------|
| `pending` | User initiated, awaiting confirmation |
| `processing` | Transaction in progress |
| `completed` | All faces reassigned, sources deleted |
| `failed` | Error during merge, rolled back |

---

## Indexes (Existing)

All required indexes already exist:

| Index | Table | Columns | Type |
|-------|-------|---------|------|
| `idx_faces_group` | faces | face_group_id | btree |
| `idx_faces_workspace` | faces | workspace_id | btree |
| `idx_face_groups_workspace` | face_groups | workspace_id | btree |
| `idx_face_groups_centroid` | face_groups | centroid | ivfflat |

---

## Migration: None Required

No database schema changes needed. The feature:
1. Uses existing `representative_face_id` column for primary face
2. Uses existing `centroid` column for weighted average
3. Uses existing merge logic with sequential calls for multi-merge

---

## API Data Shapes

### FaceGroup Response (enhanced)

```typescript
interface FaceGroup {
  id: string;
  workspace_id: string;
  name?: string;
  person_id?: string;
  person_name?: string;
  face_count: number;
  representative_face_id?: string;
  representative_thumbnail_url?: string;  // Signed URL for display
  // NEW: For suggestions feature
  similar_groups?: {
    group_id: string;
    similarity: number;  // 0.0-1.0
  }[];
  created_at: string;
  updated_at: string;
}
```

### MergeResult Response (new)

```typescript
interface MergeResult {
  merged_group: FaceGroup;
  source_group_ids: string[];  // IDs of deleted groups
  faces_merged: number;        // Total faces now in merged group
}
```
