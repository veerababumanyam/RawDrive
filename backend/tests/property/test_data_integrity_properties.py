import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from app.repositories.face_repository import FaceRepository

class TestDataIntegrityProperties:

    @pytest.mark.asyncio
    async def test_workspace_cascade_delete(self):
        """Property: Workspace deletion calls delete on repository."""
        # This tests repo method 'delete_by_workspace_id' executes correct SQL
        repo = FaceRepository()
        workspace_id = uuid4()
        
        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        mock_conn.execute.return_value = "DELETE 100"
        
        with patch("app.repositories.face_repository.get_postgres_pool", return_value=mock_pool):
            count = await repo.delete_by_workspace_id(workspace_id)
            
        assert count == 100
        # Verify query
        args, _ = mock_conn.execute.call_args
        assert "DELETE FROM faces" in args[0]
        assert "workspace_id = $1" in args[0]
        
    @pytest.mark.asyncio
    async def test_photo_cascade_delete(self):
        """Property: Photo deletion calls delete_by_photo_id on repository."""
        repo = FaceRepository()
        workspace_id = uuid4()
        photo_id = uuid4()
        
        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        mock_conn.execute.return_value = "DELETE 5"
        
        with patch("app.repositories.face_repository.get_postgres_pool", return_value=mock_pool):
            count = await repo.delete_by_photo_id(photo_id, workspace_id)
            
        assert count == 5
        # Verify query
        args, _ = mock_conn.execute.call_args
        assert "DELETE FROM faces" in args[0]
        assert "photo_id = $1" in args[0]
