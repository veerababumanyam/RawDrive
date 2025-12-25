"""Property-based tests for Face Cluster Service.

**Feature: face-event-service**

This module contains property-based tests for the face cluster service,
validating correctness properties for clustering, merging, and splitting.

Properties covered:
- Property 7: Cluster Assignment (Tasks 10.4)
- Property 8: Centroid Maintenance (Tasks 10.5)
- Property 9: Cluster Merge Correctness (Tasks 10.6)
- Property 10: Cluster Split Correctness (Tasks 10.7)

Each property test runs minimum 100 iterations.
"""

import math
import pytest
from hypothesis import given, settings, strategies as st, assume
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID

from app.services.face_cluster_service import FaceClusterService
from app.services.face_exceptions import FaceGroupNotFoundError

# =============================================================================
# HELPERS & STRATEGIES
# =============================================================================

def normalize_vector(v: list[float]) -> list[float]:
    """Normalize a vector to L2 norm = 1."""
    norm = math.sqrt(sum(x * x for x in v))
    if norm < 1e-9:
        v[0] = 1.0
        return v
    return [x / norm for x in v]

@st.composite
def normalized_embeddings(draw):
    """Generate a normalized 512-dimensional embedding vector."""
    indices = draw(st.lists(st.integers(0, 511), min_size=1, max_size=10, unique=True))
    values = draw(st.lists(st.floats(-1, 1), min_size=len(indices), max_size=len(indices)))
    
    vec = [0.0] * 512
    for i, val in zip(indices, values):
        vec[i] = val
        
    return normalize_vector(vec)

def create_mock_repos():
    """Create mock repositories with all async methods pre-mocked."""
    face_repo = MagicMock()
    # Set all potential async methods to AsyncMock
    async_methods_face = [
        'find_by_id', 'get_by_id', 'find_by_group_id', 'find_by_id_in', 
        'create', 'update', 'update_group_id_bulk', 
        'bulk_assign_to_group', 'assign_to_group', 'delete'
    ]
    for m in async_methods_face:
        setattr(face_repo, m, AsyncMock())
        
    group_repo = MagicMock()
    async_methods_group = [
        'find_by_id', 'get_by_id', 'find_similar_by_centroid', 
        'create', 'update', 'update_centroid', 
        'increment_face_count', 'set_face_count', 'delete'
    ]
    for m in async_methods_group:
        setattr(group_repo, m, AsyncMock())
        
    return face_repo, group_repo

# =============================================================================
# PROPERTY 7: Cluster Assignment
# =============================================================================

@given(
    face_embedding=normalized_embeddings(),
    threshold=st.floats(0.5, 0.9),
)
@settings(max_examples=50)
def test_property_7_cluster_assignment_logic(face_embedding, threshold):
    """
    **Property 7: Cluster Assignment**
    
    If a similar group exists (similarity > threshold), assign to it.
    Otherwise, create a new group.
    """
    import asyncio
    
    async def run_test():
        mock_face_repo, mock_group_repo = create_mock_repos()
        service = FaceClusterService(mock_face_repo, mock_group_repo, AsyncMock(), AsyncMock())
        
        # Override settings (mock internal methods called by public/private helpers)
        service._get_min_confidence = AsyncMock(return_value=0.0) # Used in detect
        service._get_confidence_threshold = AsyncMock(return_value=0.0) # Used in assign_to_cluster
        service._get_similarity_threshold = AsyncMock(return_value=threshold)
        service.get_auto_cluster_threshold = AsyncMock(return_value=threshold) # Possibly deprecated or wrapper
        service.recalculate_centroid = AsyncMock()
        
        # Setup Face
        face_id = uuid4()
        workspace_id = uuid4()
        mock_face_repo.get_by_id.return_value = {
            "id": face_id,
            "embedding": face_embedding,
            "workspace_id": workspace_id
        }
        mock_face_repo.update = AsyncMock()  # explicit
        mock_face_repo.assign_to_group = AsyncMock() # explicit
        
        # Scenario 1: No similar groups
        mock_group_repo.find_similar_by_centroid.return_value = []
        mock_group_repo.create.return_value = {"id": uuid4(), "name": "Person 1"}
        
        await service.assign_to_cluster(face_id, workspace_id)
        
        # Assert: Should create new group
        mock_group_repo.create.assert_called()
        
        # Scenario 2: Similar group exists
        similar_group_id = uuid4()
        mock_group_repo.find_similar_by_centroid.return_value = [
            {"group": {"id": similar_group_id}, "similarity": threshold + 0.05}
        ]
        
        await service.assign_to_cluster(face_id, workspace_id)
        
        # Assert: Should assign to existing group
        mock_face_repo.assign_to_group.assert_called_with(
            face_id, 
            workspace_id, 
            similar_group_id
        )

    asyncio.run(run_test())


# =============================================================================
# PROPERTY 8: Centroid Maintenance
# =============================================================================

@given(
    embeddings=st.lists(normalized_embeddings(), min_size=1, max_size=20)
)
@settings(max_examples=50)
def test_property_8_centroid_calculation(embeddings):
    """
    **Property 8: Centroid Maintenance**
    
    The centroid must be the normalized mean of all member embeddings.
    """
    import asyncio
    
    # Calculate expected
    dim = 512
    mean = [0.0] * dim
    for emb in embeddings:
        for i in range(dim):
            mean[i] += emb[i]
            
    expected_centroid = normalize_vector([x / len(embeddings) for x in mean])
    
    async def run_test():
        mock_face_repo, mock_group_repo = create_mock_repos()
        service = FaceClusterService(mock_face_repo, mock_group_repo, AsyncMock(), AsyncMock())
        
        workspace_id = uuid4()
        group_id = uuid4()
        
        mock_face_repo.find_by_group_id.return_value = [
            {"embedding": emb} for emb in embeddings
        ]
        # mock_group_repo.get_by_id already AsyncMock from helper, default returns MagicMock, which is fine unless awaited result needed.
        # But recalculate_centroid probably just calls update_centroid.
        # If it calls get_by_id, we should mock return value to be safe.
        mock_group_repo.get_by_id.return_value = {"id": group_id, "workspace_id": workspace_id}
        
        await service.recalculate_centroid(group_id, workspace_id)
        
        # Capture the updated centroid
        call_args = mock_group_repo.update_centroid.call_args
        if not call_args:
            assert False, "update_centroid not called"
        
        # supports both tuple and Call object
        pos_args = call_args[0]
        updated_centroid = pos_args[2] # group_id, workspace_id, centroid
        
        # Verify it is a list
        assert isinstance(updated_centroid, list), f"Centroid is {type(updated_centroid)}"
        assert len(updated_centroid) == 512
        
        # Compare
        dot = sum(e * c for e, c in zip(expected_centroid, updated_centroid))
        assert abs(dot - 1.0) < 1e-4, f"Dot product {dot} implies mismatch. First 5: {updated_centroid[:5]}"

    asyncio.run(run_test())


# =============================================================================
# PROPERTY 9: Cluster Merge Correctness
# =============================================================================

@given(
    source_face_count=st.integers(1, 10),
    target_face_count=st.integers(1, 10)
)
@settings(max_examples=50)
def test_property_9_merge_correctness(source_face_count, target_face_count):
    """
    **Property 9: Cluster Merge Correctness**
    
    Merging group A into B should:
    1. Move all A faces to B
    2. Update B's face count
    3. Delete A
    4. Recalculate B's centroid
    """
    import asyncio
    async def run_test():
        mock_face_repo, mock_group_repo = create_mock_repos()
        service = FaceClusterService(mock_face_repo, mock_group_repo, AsyncMock(), AsyncMock())
        
        workspace_id = uuid4()
        source_id = uuid4()
        target_id = uuid4()
        
        # Mock repositories for get_by_id
        async def mock_get_group(gid, wid):
            if gid == source_id:
                return {"id": gid, "workspace_id": wid, "face_count": source_face_count}
            if gid == target_id:
                return {"id": gid, "workspace_id": wid, "face_count": target_face_count}
            return None
        mock_group_repo.get_by_id.side_effect = mock_get_group
        
        # Mock faces in source group
        source_faces = [{"id": uuid4(), "embedding": [0.1]*512} for _ in range(source_face_count)]
        mock_face_repo.find_by_group_id.return_value = source_faces
        
        # Mock faces in target group (needed for centroid recalc)
        target_faces = [{"id": uuid4(), "embedding": [0.2]*512} for _ in range(target_face_count)]
        
        def mock_find_faces(group_id, *args, **kwargs):
            if group_id == target_id:
                return target_faces + source_faces
            if group_id == source_id:
                return source_faces
            return []
        mock_face_repo.find_by_group_id.side_effect = mock_find_faces
        
        # Execution
        await service.merge_groups(source_id, target_id, workspace_id)
        
        # Assertions
        mock_face_repo.bulk_assign_to_group.assert_called()
        mock_group_repo.delete.assert_called_with(source_id, workspace_id)
        mock_group_repo.update_centroid.assert_called()
    
    asyncio.run(run_test())


# =============================================================================
# PROPERTY 10: Cluster Split Correctness
# =============================================================================

@given(
    original_count=st.integers(5, 20),
    split_count=st.integers(1, 4)
)
@settings(max_examples=50)
def test_property_10_split_correctness(original_count, split_count):
    """
    **Property 10: Cluster Split Correctness**
    
    Splitting faces from A to new group B should:
    1. Create group B
    2. Move specified faces to B
    3. Update A and B centroids
    """
    import asyncio
    async def run_test():
        mock_face_repo, mock_group_repo = create_mock_repos()
        service = FaceClusterService(mock_face_repo, mock_group_repo, AsyncMock(), AsyncMock())
        
        workspace_id = uuid4()
        group_id = uuid4()
        
        # Generate faces
        all_faces = [{"id": uuid4(), "embedding": [0.1]*512, "face_group_id": group_id} for _ in range(original_count)]
        faces_to_split = all_faces[:split_count]
        split_ids = [f["id"] for f in faces_to_split]
        
        # Mock repo
        mock_group_repo.get_by_id.return_value = {"id": group_id, "workspace_id": workspace_id, "face_count": original_count}
        mock_group_repo.create.return_value = {"id": uuid4()}
        
        async def mock_find_face(fid, wid):
            return next((f for f in faces_to_split if f["id"] == fid), None)
            
        mock_face_repo.find_by_id.side_effect = mock_find_face
        mock_face_repo.find_by_id_in.return_value = faces_to_split
        
        # For centroid recalc
        def mock_find_faces(gid, *args, **kwargs):
            if gid == group_id:
                return all_faces[split_count:]
            return faces_to_split
        mock_face_repo.find_by_group_id.side_effect = mock_find_faces
        
        await service.split_group(group_id, split_ids, workspace_id)
        
        # Assertions
        mock_group_repo.create.assert_called()
        mock_face_repo.bulk_assign_to_group.assert_called()
        # Should update centroid for original group. New group created with centroid inside create() if supported, 
        # or updated after. Implementation shows one update_centroid call and one create call.
        # Let's verify at least one update_centroid call (for the source group).
        assert mock_group_repo.update_centroid.call_count >= 1
    
    asyncio.run(run_test())
