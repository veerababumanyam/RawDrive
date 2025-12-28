# Implementation Tasks: Face Group Merge & Primary Face Selection

**Feature**: 008-face-group-merge
**Approach**: Microservice (all face operations in face-worker)
**Date**: 2025-12-28

## Task Overview

This implementation adds multi-group merge, primary face selection, and merge suggestions to the existing face-worker microservice.

---

## Phase 1: Backend Schema & Service Layer

### Task 1.1: Add Pydantic Schemas for Multi-Merge
- [ ] **File**: `backend/src/app/api/face_schemas.py`
- [ ] Add `MultiMergeFaceGroupsRequest` schema
- [ ] Add `SetRepresentativeFaceRequest` schema
- [ ] Add `MergeSuggestionResponse` schema
- [ ] Add `MergeResultResponse` schema

### Task 1.2: Add Repository Method for Similar Pairs
- [ ] **File**: `backend/src/app/repositories/face_group_repository.py`
- [ ] Add `find_similar_pairs()` method using pgvector cosine distance
- [ ] Add `find_similar_to_group()` method for single group similarity

### Task 1.3: Extend FaceClusterService with Multi-Merge
- [ ] **File**: `backend/src/app/services/face_cluster_service.py`
- [ ] Add `multi_merge_groups()` method with transaction support
- [ ] Add `recalculate_weighted_centroid()` with 2x primary face weight
- [ ] Add `set_representative_face()` method
- [ ] Add `get_merge_suggestions()` method

---

## Phase 2: Backend API Endpoints

### Task 2.1: Add Multi-Merge Endpoint
- [ ] **File**: `backend/src/app/api/v1/face_groups.py`
- [ ] Add `POST /face-groups/multi-merge` endpoint
- [ ] Validate all groups belong to same workspace
- [ ] Return merged group with face count

### Task 2.2: Add Set Representative Endpoint
- [ ] **File**: `backend/src/app/api/v1/face_groups.py`
- [ ] Add `PUT /face-groups/{group_id}/representative` endpoint
- [ ] Validate face belongs to the group
- [ ] Trigger centroid recalculation

### Task 2.3: Add Suggestions Endpoint
- [ ] **File**: `backend/src/app/api/v1/face_groups.py`
- [ ] Add `GET /face-groups/suggestions` endpoint
- [ ] Add `GET /face-groups/{group_id}/similar` endpoint
- [ ] Support threshold and limit parameters

### Task 2.4: Add Faces-in-Group Endpoint
- [ ] **File**: `backend/src/app/api/v1/face_groups.py`
- [ ] Add `GET /face-groups/{group_id}/faces` endpoint
- [ ] Include is_representative indicator
- [ ] Return signed thumbnail URLs

---

## Phase 3: Frontend API Service

### Task 3.1: Extend faceApiService
- [ ] **File**: `frontend/src/services/faceApiService.ts`
- [ ] Add `multiMergeFaceGroups()` method
- [ ] Add `setRepresentativeFace()` method
- [ ] Add `getMergeSuggestions()` method
- [ ] Add `getSimilarGroups()` method
- [ ] Add `getFacesInGroup()` method
- [ ] Add TypeScript interfaces for new responses

---

## Phase 4: Frontend Components

### Task 4.1: Add Selection Mode to PeoplePanel
- [ ] **File**: `frontend/src/components/features/gallery/PeoplePanel.tsx`
- [ ] Add `selectionMode` state and toggle button
- [ ] Add `selectedGroupIds` Set for tracking selections
- [ ] Add checkboxes on PersonCard when in selection mode
- [ ] Add action bar with merge button (enabled when 2+ selected)
- [ ] Add keyboard navigation (Tab, Space to toggle)

### Task 4.2: Create FaceGroupMergeModal
- [ ] **File**: `frontend/src/components/features/gallery/FaceGroupMergeModal.tsx` (NEW)
- [ ] Show selected groups with thumbnails and face counts
- [ ] Allow selecting target group (default: named or largest)
- [ ] Allow selecting primary face from any group
- [ ] Handle name conflict (prompt if multiple named groups)
- [ ] Confirm/Cancel buttons with loading state
- [ ] Accessibility: focus trap, escape to close

### Task 4.3: Create FaceGroupDetailPanel
- [ ] **File**: `frontend/src/components/features/gallery/FaceGroupDetailPanel.tsx` (NEW)
- [ ] Show all faces in group as thumbnail grid
- [ ] Highlight current primary face with visual indicator
- [ ] Click face to set as primary (with confirmation)
- [ ] Show similar groups as merge suggestions
- [ ] Link to source photo on face click

### Task 4.4: Create useFaceGroupMerge Hook
- [ ] **File**: `frontend/src/hooks/useFaceGroupMerge.ts` (NEW)
- [ ] React Query mutation for multi-merge
- [ ] Invalidate face groups query on success
- [ ] Handle errors with toast notifications
- [ ] Loading and success states

### Task 4.5: Update Gallery Index Exports
- [ ] **File**: `frontend/src/components/features/gallery/index.ts`
- [ ] Export FaceGroupMergeModal
- [ ] Export FaceGroupDetailPanel

---

## Phase 5: Integration & Testing

### Task 5.1: Backend Unit Tests
- [ ] **File**: `backend/tests/unit/test_face_cluster_service.py`
- [ ] Test `multi_merge_groups()` with 3+ groups
- [ ] Test `recalculate_weighted_centroid()` math
- [ ] Test validation errors (same group, wrong workspace)

### Task 5.2: Backend Integration Tests
- [ ] **File**: `backend/tests/integration/test_face_group_merge_api.py` (NEW)
- [ ] Test multi-merge endpoint end-to-end
- [ ] Test set representative endpoint
- [ ] Test suggestions endpoint
- [ ] Test workspace isolation

### Task 5.3: Frontend Component Tests
- [ ] **File**: `frontend/src/components/features/gallery/__tests__/FaceGroupMergeModal.test.tsx` (NEW)
- [ ] Test modal opens with selected groups
- [ ] Test target group selection
- [ ] Test primary face selection
- [ ] Test confirm triggers API call

---

## Phase 6: Polish & Documentation

### Task 6.1: Add Loading & Error States
- [ ] Add skeleton loading in PeoplePanel during fetch
- [ ] Add error boundary for merge failures
- [ ] Add optimistic updates for better UX

### Task 6.2: Add Translations
- [ ] **File**: `frontend/public/locales/en/common.json`
- [ ] Add merge-related strings
- [ ] Add error messages
- [ ] Add success messages

### Task 6.3: Update Technical Documentation
- [ ] Update `docs/TechnicalSpecs/face_detection_service.json`
- [ ] Add new endpoints to API documentation

---

## Execution Order

1. Phase 1 (Backend Schema & Service) - Sequential
2. Phase 2 (Backend API) - Sequential, depends on Phase 1
3. Phase 3 (Frontend API) - Can start after Phase 2.1
4. Phase 4 (Frontend Components) - Depends on Phase 3
5. Phase 5 (Testing) - Parallel with Phase 4
6. Phase 6 (Polish) - After Phase 4 & 5

## Notes

- All face group operations remain in main backend (not microservice)
- Existing merge/split endpoints continue to work unchanged
- Multi-merge is additive - uses existing `merge_groups()` sequentially
- No database migrations required
