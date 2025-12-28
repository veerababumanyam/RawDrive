# Quickstart: Face Group Merge & Primary Face Selection

**Feature**: 008-face-group-merge
**Date**: 2025-12-28

## Overview

This guide provides quick reference for implementing face group merge functionality with primary face selection and merge suggestions.

---

## Prerequisites

- RawDrive development environment running (`npm run dev:all`)
- PostgreSQL with pgvector extension
- Test workspace with multiple detected face groups (see Test Data section)

---

## Key Files to Modify

### Backend

| File | Changes |
|------|---------|
| `backend/src/app/api/face_schemas.py` | Add `MultiMergeFaceGroupsRequest`, `SetRepresentativeFaceRequest` |
| `backend/src/app/api/v1/face_groups.py` | Add `/multi-merge`, `/representative`, `/suggestions`, `/similar` endpoints |
| `backend/src/app/services/face_cluster_service.py` | Add `multi_merge_groups()`, `recalculate_weighted_centroid()` |
| `backend/src/app/repositories/face_group_repository.py` | Add `find_similar_pairs()` |

### Frontend

| File | Changes |
|------|---------|
| `frontend/src/components/features/gallery/PeoplePanel.tsx` | Add selection mode, action bar |
| `frontend/src/components/features/gallery/FaceGroupMergeModal.tsx` | **NEW** - Merge confirmation dialog |
| `frontend/src/components/features/gallery/FaceGroupDetailPanel.tsx` | **NEW** - View faces, set primary |
| `frontend/src/services/faceApiService.ts` | Add `multiMergeFaceGroups()`, `setRepresentativeFace()`, `getMergeSuggestions()` |
| `frontend/src/hooks/useFaceGroupMerge.ts` | **NEW** - React Query mutation hook |

---

## Backend Implementation Steps

### 1. Add Pydantic Schemas

```python
# backend/src/app/api/face_schemas.py

class MultiMergeFaceGroupsRequest(BaseModel):
    """Request to merge multiple face groups."""
    source_group_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=99,
        description="Groups to merge from (will be deleted)"
    )
    target_group_id: UUID = Field(
        ...,
        description="Group to merge into (will be preserved)"
    )
    representative_face_id: Optional[UUID] = Field(
        None,
        description="Face to set as primary for merged group"
    )
    name: Optional[str] = Field(
        None,
        max_length=255,
        description="Name for merged group"
    )

class SetRepresentativeFaceRequest(BaseModel):
    """Request to set primary face."""
    face_id: UUID = Field(..., description="Face to designate as primary")
    recalculate_centroid: bool = Field(True)
```

### 2. Add Multi-Merge Service Method

```python
# backend/src/app/services/face_cluster_service.py

async def multi_merge_groups(
    self,
    source_group_ids: list[UUID],
    target_group_id: UUID,
    workspace_id: UUID,
    representative_face_id: Optional[UUID] = None,
    name: Optional[str] = None,
) -> dict[str, Any]:
    """Merge multiple groups into target within a transaction."""
    # Validate target not in sources
    if target_group_id in source_group_ids:
        raise InvalidMergeOperationError(
            source_group_id=target_group_id,
            target_group_id=target_group_id,
            reason="Target group cannot be in source list"
        )

    total_faces_merged = 0

    async with self.group_repo.transaction() as conn:
        # Sequential merge
        for source_id in source_group_ids:
            result = await self.merge_groups(
                source_group_id=source_id,
                target_group_id=target_group_id,
                workspace_id=workspace_id,
            )
            total_faces_merged += len(result.get("faces_moved", []))

        # Set representative if provided
        if representative_face_id:
            await self.group_repo.update(
                group_id=target_group_id,
                workspace_id=workspace_id,
                updates={"representative_face_id": representative_face_id},
            )

        # Set name if provided
        if name:
            await self.group_repo.update(
                group_id=target_group_id,
                workspace_id=workspace_id,
                updates={"name": name},
            )

        # Recalculate centroid with weighting
        await self.recalculate_weighted_centroid(target_group_id, workspace_id)

    return await self.group_repo.get_by_id(target_group_id, workspace_id)
```

### 3. Add Similar Pairs Query

```python
# backend/src/app/repositories/face_group_repository.py

async def find_similar_pairs(
    self,
    workspace_id: UUID,
    threshold: float = 0.75,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Find pairs of groups with similar centroids."""
    max_distance = 1.0 - threshold

    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                fg1.id as group1_id,
                fg1.name as group1_name,
                fg1.face_count as group1_face_count,
                fg2.id as group2_id,
                fg2.name as group2_name,
                fg2.face_count as group2_face_count,
                1 - (fg1.centroid <=> fg2.centroid) as similarity
            FROM face_groups fg1
            CROSS JOIN face_groups fg2
            WHERE fg1.workspace_id = $1
              AND fg2.workspace_id = $1
              AND fg1.id < fg2.id
              AND fg1.centroid IS NOT NULL
              AND fg2.centroid IS NOT NULL
              AND (fg1.centroid <=> fg2.centroid) <= $2
            ORDER BY (fg1.centroid <=> fg2.centroid) ASC
            LIMIT $3
            """,
            workspace_id,
            max_distance,
            limit,
        )
        return [dict(row) for row in rows]
```

---

## Frontend Implementation Steps

### 1. Add Selection Mode State

```typescript
// frontend/src/components/features/gallery/PeoplePanel.tsx

const [selectionMode, setSelectionMode] = useState(false);
const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
const [showMergeModal, setShowMergeModal] = useState(false);

const toggleSelection = (groupId: string) => {
  setSelectedGroupIds(prev => {
    const next = new Set(prev);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    return next;
  });
};

const handleMerge = () => {
  if (selectedGroupIds.size >= 2) {
    setShowMergeModal(true);
  }
};
```

### 2. Add API Service Methods

```typescript
// frontend/src/services/faceApiService.ts

async multiMergeFaceGroups(
  workspaceId: string,
  sourceGroupIds: string[],
  targetGroupId: string,
  options?: { representativeFaceId?: string; name?: string }
): Promise<MergeResult> {
  const response = await apiClient.post<MergeResult>(
    `${this.baseUrl}/workspaces/${workspaceId}/face-groups/multi-merge`,
    {
      source_group_ids: sourceGroupIds,
      target_group_id: targetGroupId,
      representative_face_id: options?.representativeFaceId,
      name: options?.name,
    }
  );
  return extractData(response);
}

async setRepresentativeFace(
  workspaceId: string,
  groupId: string,
  faceId: string
): Promise<FaceGroup> {
  const response = await apiClient.put<FaceGroup>(
    `${this.baseUrl}/workspaces/${workspaceId}/face-groups/${groupId}/representative`,
    { face_id: faceId }
  );
  return extractData(response);
}

async getMergeSuggestions(
  workspaceId: string,
  options?: { threshold?: number; limit?: number }
): Promise<MergeSuggestion[]> {
  const params = new URLSearchParams();
  if (options?.threshold) params.set('threshold', String(options.threshold));
  if (options?.limit) params.set('limit', String(options.limit));

  const response = await apiClient.get<{ suggestions: MergeSuggestion[] }>(
    `${this.baseUrl}/workspaces/${workspaceId}/face-groups/suggestions?${params}`
  );
  return extractData(response).suggestions;
}
```

### 3. Merge Confirmation Modal Pattern

```typescript
// frontend/src/components/features/gallery/FaceGroupMergeModal.tsx

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGroups: FaceGroup[];
  onConfirm: (targetId: string, representativeFaceId?: string) => void;
}

export const FaceGroupMergeModal: React.FC<MergeModalProps> = ({
  isOpen, onClose, selectedGroups, onConfirm
}) => {
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [selectedPrimaryFace, setSelectedPrimaryFace] = useState<string | null>(null);

  // Auto-select first named group as target, or largest group
  useEffect(() => {
    if (selectedGroups.length > 0) {
      const named = selectedGroups.find(g => g.name || g.person_name);
      const target = named || selectedGroups.reduce((a, b) =>
        a.face_count > b.face_count ? a : b
      );
      setTargetGroupId(target.id);
    }
  }, [selectedGroups]);

  return (
    <Dialog open={isOpen} onClose={onClose}>
      {/* Modal content with group selection, primary face picker, confirm button */}
    </Dialog>
  );
};
```

---

## Test Data Setup

```bash
# Create test face groups with similar embeddings
cd backend
pytest tests/integration/test_face_group_merge_api.py::test_setup_merge_data -v
```

Or manually via API:

```bash
# Create 3 groups for same person (similar centroids)
curl -X POST "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/face-groups" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "John Group 1"}'

# Upload photos with same person to each group
# Face detection will auto-cluster
```

---

## Testing Checklist

- [ ] Multi-merge with 3+ groups works
- [ ] Target group retains name when sources are unnamed
- [ ] Name conflict prompts user selection
- [ ] Primary face changes thumbnail in People panel
- [ ] Centroid recalculation uses 2x weight on primary
- [ ] Merge suggestions show with >0.75 similarity
- [ ] Split still works after merge
- [ ] Keyboard navigation in selection mode
- [ ] Screen reader announces selection state
- [ ] Merge persists after logout/login

---

## Common Issues

| Issue | Solution |
|-------|----------|
| "Groups belong to different workspaces" | Ensure all group IDs are from user's current workspace |
| Centroid not recalculating | Check that faces have embeddings (some providers may not generate) |
| Merge suggestions empty | Need at least 2 groups with centroids and similarity ≥0.75 |
| Selection mode not entering | Check selectionMode state not being reset |

---

## API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/face-groups/multi-merge` | POST | Merge 2+ groups |
| `/face-groups/{id}/representative` | PUT | Set primary face |
| `/face-groups/suggestions` | GET | Get merge suggestions |
| `/face-groups/{id}/similar` | GET | Similar groups for one group |
| `/face-groups/{id}/faces` | GET | All faces in group |
