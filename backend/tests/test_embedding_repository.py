"""Tests for EmbeddingRepository.

Verifies:
- find_similar_by_embedding returns top-N sorted by cosine similarity descending
- find_similar_by_embedding filters by workspace_id (multi-tenant isolation)
- find_similar_by_embedding excludes the query asset_id from results
- find_similar_by_embedding respects similarity_threshold parameter
- store_embedding upserts (INSERT ON CONFLICT UPDATE)
- batch_store_embeddings handles multiple embeddings in one call
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.embedding_repository import (
    EmbeddingRepository,
    get_embedding_repository,
)


def _make_mock_pool(mock_conn):
    """Create a mock pool whose acquire() works as an async context manager."""
    mock_pool = MagicMock()

    @asynccontextmanager
    async def _acquire():
        yield mock_conn

    mock_pool.acquire = _acquire
    return mock_pool


@pytest.fixture
def mock_conn():
    """Mock asyncpg connection."""
    return AsyncMock()


@pytest.fixture
def mock_pool(mock_conn):
    """Mock asyncpg pool with working acquire() context manager."""
    return _make_mock_pool(mock_conn)


@pytest.fixture
def repo():
    """Create a fresh EmbeddingRepository for each test."""
    return EmbeddingRepository()


@pytest.fixture
def workspace_id():
    return uuid.uuid4()


@pytest.fixture
def asset_id():
    return uuid.uuid4()


@pytest.fixture
def session_id():
    return uuid.uuid4()


@pytest.fixture
def sample_embedding():
    """512-dim embedding vector."""
    return [0.1] * 512


PATCH_TARGET = "app.repositories.embedding_repository.get_postgres_pool"


class TestFindSimilarByEmbedding:
    """Tests for find_similar_by_embedding method."""

    @pytest.mark.asyncio
    async def test_returns_top_n_sorted_by_similarity(
        self, repo, mock_pool, mock_conn, workspace_id, sample_embedding
    ):
        """Test 1: Returns top-N results sorted by cosine similarity descending."""
        mock_conn.fetch.return_value = [
            {"asset_id": uuid.uuid4(), "similarity_score": 0.98},
            {"asset_id": uuid.uuid4(), "similarity_score": 0.95},
            {"asset_id": uuid.uuid4(), "similarity_score": 0.90},
        ]

        with patch(PATCH_TARGET, new=AsyncMock(return_value=mock_pool)):
            results = await repo.find_similar_by_embedding(
                workspace_id=workspace_id,
                embedding=sample_embedding,
                exclude_asset_id=uuid.uuid4(),
                limit=10,
            )

        assert len(results) == 3
        call_args = mock_conn.fetch.call_args
        sql = call_args[0][0]
        assert "<=>" in sql
        assert "LIMIT" in sql.upper()

    @pytest.mark.asyncio
    async def test_filters_by_workspace_id(
        self, repo, mock_pool, mock_conn, workspace_id, sample_embedding
    ):
        """Test 2: Filters by workspace_id for multi-tenant isolation."""
        mock_conn.fetch.return_value = []

        with patch(PATCH_TARGET, new=AsyncMock(return_value=mock_pool)):
            await repo.find_similar_by_embedding(
                workspace_id=workspace_id,
                embedding=sample_embedding,
                exclude_asset_id=uuid.uuid4(),
            )

        call_args = mock_conn.fetch.call_args
        sql = call_args[0][0]
        assert "workspace_id" in sql.lower()
        params = call_args[0][1:]
        assert workspace_id in params

    @pytest.mark.asyncio
    async def test_excludes_query_asset_id(
        self, repo, mock_pool, mock_conn, workspace_id, sample_embedding
    ):
        """Test 3: Excludes the query asset_id from results."""
        mock_conn.fetch.return_value = []
        exclude_id = uuid.uuid4()

        with patch(PATCH_TARGET, new=AsyncMock(return_value=mock_pool)):
            await repo.find_similar_by_embedding(
                workspace_id=workspace_id,
                embedding=sample_embedding,
                exclude_asset_id=exclude_id,
            )

        call_args = mock_conn.fetch.call_args
        sql = call_args[0][0]
        assert "asset_id" in sql.lower()
        assert "!=" in sql or "<>" in sql
        params = call_args[0][1:]
        assert exclude_id in params

    @pytest.mark.asyncio
    async def test_respects_similarity_threshold(
        self, repo, mock_pool, mock_conn, workspace_id, sample_embedding
    ):
        """Test 4: Respects similarity_threshold parameter."""
        mock_conn.fetch.return_value = []
        threshold = 0.90

        with patch(PATCH_TARGET, new=AsyncMock(return_value=mock_pool)):
            await repo.find_similar_by_embedding(
                workspace_id=workspace_id,
                embedding=sample_embedding,
                exclude_asset_id=uuid.uuid4(),
                threshold=threshold,
            )

        call_args = mock_conn.fetch.call_args
        params = call_args[0][1:]
        assert threshold in params or (1 - threshold) in params


class TestStoreEmbedding:
    """Tests for store_embedding method."""

    @pytest.mark.asyncio
    async def test_upserts_on_conflict(
        self, repo, mock_pool, mock_conn, workspace_id, asset_id, session_id, sample_embedding
    ):
        """Test 5: store_embedding uses INSERT ON CONFLICT UPDATE."""
        mock_conn.fetchrow.return_value = {
            "id": uuid.uuid4(),
            "workspace_id": workspace_id,
            "asset_id": asset_id,
        }

        with patch(PATCH_TARGET, new=AsyncMock(return_value=mock_pool)):
            await repo.store_embedding(
                workspace_id=workspace_id,
                asset_id=asset_id,
                session_id=session_id,
                embedding=sample_embedding,
            )

        call_args = mock_conn.fetchrow.call_args
        sql = call_args[0][0]
        assert "ON CONFLICT" in sql.upper()
        assert "UPDATE" in sql.upper()


class TestBatchStoreEmbeddings:
    """Tests for batch_store_embeddings method."""

    @pytest.mark.asyncio
    async def test_handles_multiple_embeddings(
        self, repo, mock_pool, mock_conn, workspace_id, session_id, sample_embedding
    ):
        """Test 6: batch_store_embeddings handles multiple embeddings in one call."""

        @asynccontextmanager
        async def _mock_transaction():
            yield

        mock_conn.transaction = _mock_transaction

        embeddings = [
            {
                "asset_id": uuid.uuid4(),
                "session_id": session_id,
                "embedding": sample_embedding,
                "model_version": "clip-vit-b-32",
            }
            for _ in range(5)
        ]

        with patch(PATCH_TARGET, new=AsyncMock(return_value=mock_pool)):
            await repo.batch_store_embeddings(
                workspace_id=workspace_id,
                embeddings=embeddings,
            )

        assert mock_conn.executemany.called
        call_args = mock_conn.executemany.call_args
        sql = call_args[0][0]
        values = call_args[0][1]
        assert "INSERT" in sql.upper()
        assert "ON CONFLICT" in sql.upper()
        assert len(values) == 5


class TestSingleton:
    """Tests for the singleton factory."""

    def test_get_embedding_repository_returns_singleton(self):
        """get_embedding_repository returns the same instance."""
        import app.repositories.embedding_repository as mod
        mod._repository = None

        repo1 = get_embedding_repository()
        repo2 = get_embedding_repository()
        assert repo1 is repo2

        mod._repository = None
