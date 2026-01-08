import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from app.repositories.face_embedding_repository import FaceEmbeddingRepository
from app.services.milvus_service import MilvusService

@pytest.fixture
def mock_milvus_service():
    with patch("app.repositories.face_embedding_repository.get_milvus_service") as mock_get:
        service = MagicMock(spec=MilvusService)
        mock_get.return_value = service
        yield service

@pytest.fixture
def mock_settings():
    with patch("app.repositories.face_embedding_repository.get_settings") as mock_get:
        settings = MagicMock()
        settings.milvus_enabled = True
        mock_get.return_value = settings
        yield settings

@pytest.fixture
def repository():
    return FaceEmbeddingRepository()

@pytest.mark.asyncio
async def test_find_similar_milvus_enabled(repository, mock_milvus_service, mock_settings):
    # Setup
    workspace_id = uuid4()
    embedding = [0.1] * 512
    # Ensure embedding is normalized for validation
    norm = sum(x*x for x in embedding)**0.5
    embedding = [x/norm for x in embedding]
    
    mock_hit = MagicMock()
    mock_hit.id = str(uuid4())
    mock_hit.score = 0.9
    mock_milvus_service.search_vectors.return_value = [mock_hit]
    
    # Mock PostgreSQL re-hydration
    with patch("app.repositories.face_embedding_repository.get_postgres_pool") as mock_pool_get:
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_acquire_ctx = AsyncMock()
        mock_acquire_ctx.__aenter__.return_value = mock_conn
        mock_acquire_ctx.__aexit__.return_value = None
        mock_pool.acquire.return_value = mock_acquire_ctx
        
        # Mock the async call to get_postgres_pool
        async def get_mock_pool():
            return mock_pool
        mock_pool_get.side_effect = get_mock_pool
        
        mock_conn.fetch.return_value = [
            {
                "id": UUID(mock_hit.id),
                "workspace_id": workspace_id,
                "photo_id": uuid4(),
                "face_group_id": None,
                "bounding_box": [0, 0, 100, 100],
                "confidence": 0.99,
                "embedding_str": "[" + ",".join(str(x) for x in embedding) + "]",
                "provider": "insightface",
                "detection_metadata": {},
                "thumbnail_urls": {},
                "created_at": None,
                "updated_at": None
            }
        ]
        
        # Execute
        results = await repository.find_similar(embedding, workspace_id, threshold=0.8)
        
        # Assert
        assert len(results) == 1
        assert results[0]["similarity"] == 0.9
        assert results[0]["face"]["id"] == UUID(mock_hit.id)
        mock_milvus_service.search_vectors.assert_called_once()
        mock_conn.fetch.assert_called_once()

@pytest.mark.asyncio
async def test_bulk_insert_dual_write(repository, mock_milvus_service, mock_settings):
    # Setup
    workspace_id = uuid4()
    face_id = uuid4()
    embedding = [0.1] * 512
    norm = sum(x*x for x in embedding)**0.5
    embedding = [x/norm for x in embedding]
    
    faces = [{"id": face_id, "workspace_id": workspace_id, "embedding": embedding}]
    
    with patch("app.repositories.face_embedding_repository.get_postgres_pool") as mock_pool_get:
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_acquire_ctx = AsyncMock()
        mock_acquire_ctx.__aenter__.return_value = mock_conn
        mock_acquire_ctx.__aexit__.return_value = None
        mock_pool.acquire.return_value = mock_acquire_ctx
        
        async def get_mock_pool():
            return mock_pool
        mock_pool_get.side_effect = get_mock_pool
        
        mock_conn.execute.return_value = "UPDATE 1"
        
        # Execute
        count = await repository.bulk_insert_embeddings(faces)
        
        # Assert
        assert count == 1
        mock_milvus_service.upsert_vectors.assert_called_once()
        # Verify dual-write to PG happened
        mock_conn.copy_records_to_table.assert_called_once()

@pytest.mark.asyncio
async def test_clear_embedding_dual_delete(repository, mock_milvus_service, mock_settings):
    # Setup
    workspace_id = uuid4()
    face_id = uuid4()
    
    with patch("app.repositories.face_embedding_repository.get_postgres_pool") as mock_pool_get:
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_acquire_ctx = AsyncMock()
        mock_acquire_ctx.__aenter__.return_value = mock_conn
        mock_acquire_ctx.__aexit__.return_value = None
        mock_pool.acquire.return_value = mock_acquire_ctx
        
        async def get_mock_pool():
            return mock_pool
        mock_pool_get.side_effect = get_mock_pool
        
        mock_conn.execute.return_value = "UPDATE 1"
        
        # Execute
        success = await repository.clear_embedding(face_id, workspace_id)
        
        # Assert
        assert success is True
        mock_milvus_service.delete_vectors.assert_called_once_with(
            collection_name="faces", 
            ids=[str(face_id)]
        )
