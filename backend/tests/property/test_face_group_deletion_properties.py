import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from app.repositories.face_group_repository import FaceGroupRepository

# Async helper
import asyncio

class TestFaceGroupDeletionProperties:

    @pytest.mark.asyncio
    async def test_face_group_deletion_preserves_faces(self):
        """Property: Deleting a face group explicitly ungroups faces."""
        repo = FaceGroupRepository()
        workspace_id = uuid4()
        group_id = uuid4()
        
        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        
        # Mock transaction: async with conn.transaction()
        mock_conn.transaction = MagicMock()
        mock_transaction = AsyncMock()
        mock_conn.transaction.return_value.__aenter__.return_value = mock_transaction
        mock_pool.acquire = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        
        # Result of delete
        mock_conn.execute.return_value = "DELETE 1"

        with patch("app.repositories.face_group_repository.get_postgres_pool", return_value=mock_pool):
            await repo.delete(group_id, workspace_id)
            
        # Verify UPDATE faces SET face_group_id = NULL was called
        calls = mock_conn.execute.call_args_list
        
        update_called = False
        for args, _ in calls:
            query = args[0]
            if "UPDATE faces" in query and "SET face_group_id = NULL" in query:
                update_called = True
                break
                
        assert update_called, "Faces MUST be explicitly ungrouped before deletion"
