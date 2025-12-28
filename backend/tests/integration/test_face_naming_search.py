"""Integration test for face naming → search workflow.

Tests the complete flow: name a face group → search by person name.
"""

import pytest
from uuid import uuid4

from app.services.face_cluster_service import FaceClusterService, get_face_cluster_service
from app.services.search_service import SearchService, get_search_service


class TestFaceNamingSearchIntegration:
    """Integration tests for face naming and search functionality."""

    @pytest.fixture
    def face_cluster_service(self) -> FaceClusterService:
        """Get face cluster service."""
        return get_face_cluster_service()

    @pytest.fixture
    def search_service(self) -> SearchService:
        """Get search service."""
        return get_search_service()

    @pytest.mark.asyncio
    async def test_name_face_group_and_search(
        self,
        face_cluster_service: FaceClusterService,
        search_service: SearchService,
    ) -> None:
        """Test naming a face group and searching for photos by person name."""
        workspace_id = uuid4()
        person_name = "John Doe"

        # Skip if no face groups exist in test workspace
        # In a real test environment, we would set up test data
        # For now, this is a placeholder structure

        # 1. Find an existing face group (would need test data setup)
        # face_groups = await face_cluster_service.group_repo.get_by_workspace(workspace_id)
        # if not face_groups:
        #     pytest.skip("No face groups available for testing")

        # 2. Name the face group
        # group_id = face_groups[0]["id"]
        # result = await face_cluster_service.assign_person(
        #     group_id=group_id,
        #     workspace_id=workspace_id,
        #     person_name=person_name,
        # )

        # 3. Verify the group was named
        # assert result["person_name"] == person_name

        # 4. Search for photos by person name
        # search_results = await search_service.search_assets_by_person_name(
        #     workspace_id=workspace_id,
        #     person_name=person_name,
        # )

        # 5. Verify search results contain expected photos
        # assert len(search_results["data"]) > 0

        # For now, just test that the services can be instantiated
        assert face_cluster_service is not None
        assert search_service is not None

        # TODO: Set up test data with face groups and photos
        # This would require:
        # - Creating test assets with faces
        # - Running face detection
        # - Creating face groups
        # - Then testing naming and search

        pytest.skip("Integration test requires test data setup - face groups and photos with faces")

    @pytest.mark.asyncio
    async def test_search_by_person_id(
        self,
        search_service: SearchService,
    ) -> None:
        """Test searching photos by person ID."""
        workspace_id = uuid4()
        person_id = uuid4()

        # Search by person ID (would return photos if person has face groups)
        results = await search_service.search_assets_by_person(
            workspace_id=workspace_id,
            person_id=person_id,
        )

        # Should return empty results for non-existent person
        assert results["data"] == []
        assert results["meta"]["total"] == 0