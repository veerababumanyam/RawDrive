# Research: Face Group Merge & Primary Face Selection

**Feature**: 008-face-group-merge
**Date**: 2025-12-28

## Research Summary

This document resolves technical unknowns and documents best practices for implementing multi-group merge functionality with primary face selection and merge suggestions.

---

## 1. Multi-Group Merge Strategy

### Decision: Sequential Merge with Transaction

Merge N groups by iteratively merging each source group into a single target group within a database transaction.

### Rationale

- **Atomic operation**: All-or-nothing via PostgreSQL transaction ensures data integrity
- **Reuses existing logic**: The `merge_groups(source, target)` method is battle-tested
- **Simpler error handling**: If any merge fails, entire operation rolls back
- **Audit trail**: Single merged group ID in history for all source groups

### Alternatives Considered

| Approach | Rejected Because |
|----------|------------------|
| Bulk face reassignment in single query | Loses per-group validation, harder to audit |
| Parallel merge operations | Risk of race conditions, complex rollback |
| Create new group, delete all sources | Changes group ID (breaks external references) |

### Implementation

```python
async def multi_merge_groups(
    self,
    source_group_ids: list[UUID],  # Groups to merge from
    target_group_id: UUID,          # Primary group (kept)
    workspace_id: UUID,
    representative_face_id: Optional[UUID] = None,  # Optional primary face override
) -> dict[str, Any]:
    """Merge multiple groups into target, then set primary face."""
    async with transaction():
        for source_id in source_group_ids:
            await self.merge_groups(source_id, target_group_id, workspace_id)

        if representative_face_id:
            await self.set_representative_face(target_group_id, representative_face_id)

        await self.recalculate_weighted_centroid(target_group_id, workspace_id)

    return await self.group_repo.get_by_id(target_group_id, workspace_id)
```

---

## 2. Weighted Centroid Calculation

### Decision: Primary Face Gets 2x Weight in Centroid Average

When recalculating group centroid after merge, the primary (representative) face embedding is weighted 2x compared to other faces.

### Rationale

- **Improved matching**: New uploads more likely to match against user-selected "best" face
- **User intent**: If user chose a face as primary, they believe it's most representative
- **Minimal complexity**: Simple weighted average, no complex ML retraining

### Algorithm

```python
async def recalculate_weighted_centroid(
    self, group_id: UUID, workspace_id: UUID
) -> list[float]:
    """Recalculate centroid with 2x weight on representative face."""
    group = await self.group_repo.get_by_id(group_id, workspace_id)
    rep_face_id = group.get("representative_face_id")

    faces = await self.face_repo.find_by_group_id(group_id, workspace_id)

    weighted_sum = [0.0] * 512
    total_weight = 0.0

    for face in faces:
        embedding = face.get("embedding")
        if not embedding:
            continue

        weight = 2.0 if face["id"] == rep_face_id else 1.0
        for i, val in enumerate(embedding):
            weighted_sum[i] += val * weight
        total_weight += weight

    if total_weight == 0:
        return None  # No embeddings available

    centroid = [v / total_weight for v in weighted_sum]
    # Normalize to unit vector (required by pgvector cosine distance)
    norm = math.sqrt(sum(x*x for x in centroid))
    centroid = [x / norm for x in centroid]

    await self.group_repo.update_centroid(group_id, workspace_id, centroid)
    return centroid
```

### Alternatives Considered

| Approach | Rejected Because |
|----------|------------------|
| No weighting (simple average) | Ignores user preference |
| 10x weight on primary | May distort centroid too much |
| Recalculate on every new face | Performance overhead |

---

## 3. Merge Suggestion Algorithm

### Decision: Pairwise Centroid Similarity with Threshold

Query all face groups with centroids, compute pairwise similarities using pgvector, return pairs above threshold.

### Rationale

- **Leverages pgvector**: Native cosine distance is highly optimized
- **Single query**: Gets all suggestions in one database round-trip
- **Threshold filtering**: 0.75 default filters noise while catching obvious duplicates

### Implementation

```sql
-- Find all similar group pairs in workspace
SELECT
    fg1.id as group1_id,
    fg2.id as group2_id,
    1 - (fg1.centroid <=> fg2.centroid) as similarity
FROM face_groups fg1
CROSS JOIN face_groups fg2
WHERE fg1.workspace_id = $1
  AND fg2.workspace_id = $1
  AND fg1.id < fg2.id  -- Avoid duplicates (A,B) and (B,A)
  AND fg1.centroid IS NOT NULL
  AND fg2.centroid IS NOT NULL
  AND (fg1.centroid <=> fg2.centroid) <= 0.25  -- similarity >= 0.75
ORDER BY (fg1.centroid <=> fg2.centroid) ASC
LIMIT 50;
```

### Performance Considerations

- **IVFFlat index**: Already exists on `face_groups.centroid`
- **Limit 50**: Prevents overwhelming UI
- **Workspace filter**: Uses index, limits to ~1000 groups max

### Alternatives Considered

| Approach | Rejected Because |
|----------|------------------|
| HDBSCAN re-clustering | Expensive, may change existing groups |
| On-demand per-group query | N+1 problem, slow for many groups |
| Background job | Adds complexity, suggestions may be stale |

---

## 4. Frontend Selection Mode Pattern

### Decision: Toggle-Based Multi-Select with Action Bar

User enters "selection mode" via button, selects groups by clicking, action bar appears with merge button.

### Rationale

- **Familiar pattern**: Matches file manager, email client selection UX
- **Clear affordance**: Checkboxes indicate selectable state
- **Batch actions**: Action bar scales for future operations (delete, tag, etc.)

### UI Flow

```
Normal Mode → Click "Select" button → Selection Mode
  ↓
Selection Mode:
  - Checkboxes appear on group cards
  - Click group = toggle selection
  - Selected count shows in action bar
  - "Merge" button enabled when 2+ selected
  - "Cancel" returns to normal mode
  ↓
Click "Merge" → Confirmation Modal:
  - Shows all selected groups with thumbnails
  - User can set primary face
  - Confirm → API call → Refresh groups
```

### Accessibility

- Checkbox inputs for screen readers
- `aria-selected` on cards
- Focus management on modal open/close
- Keyboard navigation (Tab, Space to toggle, Enter to merge)

---

## 5. Name Conflict Resolution

### Decision: Prompt User When Multiple Groups Have Names

If merging groups where 2+ have names, show selection UI. If only one is named, use that name.

### Rationale

- **User control**: Names are manually assigned, user should decide
- **Simple default**: Single named group case is common, avoid extra clicks
- **Non-blocking**: Empty names never cause conflicts

### Logic

```typescript
function getTargetName(groups: FaceGroup[]): { name: string | null; needsChoice: boolean } {
  const namedGroups = groups.filter(g => g.name || g.person_name);

  if (namedGroups.length === 0) {
    return { name: null, needsChoice: false };
  }
  if (namedGroups.length === 1) {
    return { name: namedGroups[0].name || namedGroups[0].person_name, needsChoice: false };
  }
  // Multiple named groups - user must choose
  return { name: null, needsChoice: true };
}
```

---

## 6. Primary Face Auto-Selection on Delete

### Decision: Select Highest-Confidence Face When Primary Deleted

If the current representative face's source photo is deleted, automatically select the face with highest detection confidence as new primary.

### Rationale

- **Quality proxy**: Higher confidence often correlates with clearer face
- **Deterministic**: Same result if run multiple times
- **No user action needed**: Graceful degradation

### Trigger

- Listen for `asset.deleted` event
- Check if any face in deleted asset was a representative
- If so, run auto-selection for affected groups

---

## 7. Database Indexes

### Existing Indexes (Sufficient)

| Index | Purpose |
|-------|---------|
| `idx_faces_group` on `faces(face_group_id)` | Fast lookup of faces in group |
| `idx_face_groups_workspace` on `face_groups(workspace_id)` | Tenant filtering |
| `idx_face_groups_centroid` (IVFFlat) on `face_groups(centroid)` | Similarity search |

### No New Indexes Needed

The pairwise similarity query uses the IVFFlat index for distance calculations. Face count per group is maintained as a denormalized field.

---

## 8. Audit Logging

### Decision: Log Merge Operations to Existing Audit System

Use RawDrive's standard audit logging for merge operations.

### Fields

```python
await audit_log({
    "workspace_id": workspace_id,
    "user_id": current_user.id,
    "action": "face_group.merge",
    "resource_type": "face_group",
    "resource_id": str(target_group_id),
    "details": {
        "source_group_ids": [str(id) for id in source_group_ids],
        "faces_merged": total_face_count,
        "representative_face_id": str(representative_face_id) if representative_face_id else None,
    }
})
```

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Multi-group merge | Sequential in transaction |
| Centroid weighting | 2x weight on primary face |
| Merge suggestions | Pairwise centroid similarity ≥0.75 |
| Selection mode | Toggle-based multi-select with action bar |
| Name conflicts | User chooses if multiple named groups |
| Primary face deletion | Auto-select highest confidence face |
| New indexes | None required |
| Audit logging | Standard RawDrive audit format |
