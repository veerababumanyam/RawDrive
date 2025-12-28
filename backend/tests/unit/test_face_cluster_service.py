"""Unit tests for FaceClusterService.assign_person()."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.face_cluster_service import FaceClusterService, FaceGroupNotFoundError


class TestFaceClusterService:
    """Test FaceClusterService methods."""

    @pytest.fixture
    def service(self, mock_group_repo: MagicMock) -> FaceClusterService:
        """Create a FaceClusterService instance with mocked dependencies."""
        return FaceClusterService(
            face_group_repository=mock_group_repo,
        )

    @pytest.fixture
    def mock_group_repo(self) -> MagicMock:
        """Mock face group repository."""
        mock_repo = MagicMock()
        mock_repo.get_by_id = AsyncMock()
        return mock_repo

    @pytest.fixture
    def mock_face_repo(self) -> MagicMock:
        """Mock face repository."""
        return MagicMock()

    @pytest.mark.asyncio
    async def test_assign_person_with_existing_person(
        self,
        service: FaceClusterService,
        mock_group_repo: MagicMock,
    ) -> None:
        """Test assigning an existing person to a face group."""
        workspace_id = uuid4()
        group_id = uuid4()
        person_id = uuid4()

        # Mock group exists
        mock_group = {
            "id": str(group_id),
            "name": "Person 1",
            "face_count": 5,
        }
        mock_group_repo.get_by_id.return_value = mock_group

        with patch("app.db.postgres.get_postgres_pool", new_callable=AsyncMock) as mock_pool_func:
            # Mock the pool
            mock_pool = AsyncMock()
            mock_pool_func.return_value = mock_pool
            
            # Mock connection context manager
            mock_pool.acquire = MagicMock()
            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.acquire.return_value.__aexit__.return_value = None

            # Mock person exists query
            mock_conn.fetchrow.return_value = {"display_name": "John Doe"}

            # Mock the assign_person call result
            result = await service.assign_person(
                group_id=group_id,
                workspace_id=workspace_id,
                person_id=person_id,
            )

            assert result["person_id"] == str(person_id)
            assert result["person_name"] == "John Doe"
            assert mock_group_repo.get_by_id.call_count == 2  # Called at start and end

    @pytest.mark.asyncio
    async def test_assign_person_with_new_person(
        self,
        service: FaceClusterService,
        mock_group_repo: MagicMock,
    ) -> None:
        """Test assigning a new person (by name) to a face group."""
        workspace_id = uuid4()
        group_id = uuid4()
        person_name = "Jane Smith"

        # Mock group exists
        mock_group = {
            "id": str(group_id),
            "name": "Person 1",
            "face_count": 3,
        }
        mock_group_repo.get_by_id.return_value = mock_group

        # Mock updated group
        updated_group = {
            **mock_group,
            "person_id": str(uuid4()),
            "person_name": person_name,
        }

        with patch("app.db.postgres.get_postgres_pool", new_callable=AsyncMock) as mock_pool_func:

            # Mock the pool
            mock_pool = AsyncMock()
            mock_pool_func.return_value = mock_pool
            
            # Mock connection context manager
            mock_pool.acquire = MagicMock()
            mock_conn = AsyncMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.acquire.return_value.__aexit__.return_value = None

            # Mock person creation
            new_person_id = str(uuid4())
            mock_conn.fetchrow.side_effect = [
                {"person_id": new_person_id},  # INSERT RETURNING person_id
                {"display_name": person_name},  # SELECT display_name
            ]

            result = await service.assign_person(
                group_id=group_id,
                workspace_id=workspace_id,
                person_name=person_name,
            )

            assert result["person_name"] == person_name
            assert mock_group_repo.get_by_id.call_count == 2  # Called at start and end

    @pytest.mark.asyncio
    async def test_assign_person_group_not_found(
        self,
        service: FaceClusterService,
        mock_group_repo: MagicMock,
    ) -> None:
        """Test assigning person to non-existent face group."""
        workspace_id = uuid4()
        group_id = uuid4()

        # Mock group not found
        from app.services.face_exceptions import FaceGroupNotFoundError
        mock_group_repo.get_by_id.side_effect = FaceGroupNotFoundError(group_id)

        with pytest.raises(FaceGroupNotFoundError):
            await service.assign_person(
                group_id=group_id,
                workspace_id=workspace_id,
                person_name="Test Person",
            )

    @pytest.mark.asyncio
    async def test_assign_person_invalid_params(
        self,
        service: FaceClusterService,
    ) -> None:
        """Test assigning person with invalid parameters."""
        workspace_id = uuid4()
        group_id = uuid4()

        # Test with no person_id or person_name
        with pytest.raises(ValueError, match="Either person_id or person_name must be provided"):
            await service.assign_person(
                group_id=group_id,
                workspace_id=workspace_id,
            )

        # Test with both person_id and person_name
        with pytest.raises(ValueError, match="Provide either person_id or person_name, not both"):
            await service.assign_person(
                group_id=group_id,
                workspace_id=workspace_id,
                person_id=uuid4(),
                person_name="Test Person",
            )