#!/usr/bin/env python3
"""Pytest-compatible database extension verification tests.

These tests verify that PostgreSQL extensions are properly installed and configured
for vector similarity search capabilities.

Usage:
    pytest tests/verification/test_extensions_pytest.py -v
    pytest tests/verification/test_extensions_pytest.py -v -m extensions
    pytest tests/verification/test_extensions_pytest.py -v -m pgvectorscale
"""

import pytest
import pytest_asyncio
import asyncio
from typing import Optional


@pytest.fixture
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_connection(database_url):
    """Create a database connection for tests."""
    try:
        import asyncpg
        conn = await asyncpg.connect(database_url)
        yield conn
        await conn.close()
    except ImportError:
        pytest.skip("asyncpg not installed")
    except Exception as e:
        pytest.skip(f"Database connection failed: {e}")


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
async def test_postgresql_version(db_connection):
    """Test that PostgreSQL version is 15 or higher (required for pgvectorscale)."""
    result = await db_connection.fetchrow("SHOW server_version;")
    version_str = result['server_version']
    major_version = int(version_str.split('.')[0])

    assert major_version >= 15, f"PostgreSQL 15+ required, got {version_str}"


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
async def test_pgvector_available(db_connection):
    """Test that pgvector extension is available in PostgreSQL."""
    result = await db_connection.fetchrow(
        "SELECT name FROM pg_available_extensions WHERE name = 'vector'"
    )
    assert result is not None, "pgvector extension not available in PostgreSQL"


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
async def test_pgvector_enabled(db_connection):
    """Test that pgvector extension is enabled in the database."""
    result = await db_connection.fetchrow(
        "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
    )
    assert result is not None, "pgvector extension not enabled"
    assert result['extversion'] is not None, "pgvector version not found"


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
@pytest.mark.pgvectorscale
async def test_pgvectorscale_available(db_connection):
    """Test that pgvectorscale extension is available in PostgreSQL.

    This requires the timescale/timescaledb-ha Docker image.
    """
    result = await db_connection.fetchrow(
        "SELECT name FROM pg_available_extensions WHERE name = 'vectorscale'"
    )
    if result is None:
        pytest.skip(
            "pgvectorscale not available - ensure timescale/timescaledb-ha image is used"
        )


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
@pytest.mark.pgvectorscale
async def test_pgvectorscale_enabled(db_connection):
    """Test that pgvectorscale extension is enabled in the database.

    This requires running the Alembic migration 0093_enable_pgvectorscale.
    """
    # First check if available
    available = await db_connection.fetchrow(
        "SELECT name FROM pg_available_extensions WHERE name = 'vectorscale'"
    )
    if available is None:
        pytest.skip("pgvectorscale not available in PostgreSQL")

    result = await db_connection.fetchrow(
        "SELECT extname, extversion FROM pg_extension WHERE extname = 'vectorscale'"
    )
    assert result is not None, (
        "pgvectorscale extension not enabled - run 'alembic upgrade head'"
    )


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
async def test_vector_cosine_similarity(db_connection):
    """Test that vector cosine similarity operations work correctly."""
    # Create temp table
    await db_connection.execute("""
        CREATE TEMP TABLE IF NOT EXISTS _test_vectors (
            id SERIAL PRIMARY KEY,
            embedding vector(3)
        )
    """)

    # Insert test vectors
    await db_connection.execute("""
        INSERT INTO _test_vectors (embedding) VALUES
        ('[1,0,0]'::vector),
        ('[0,1,0]'::vector),
        ('[1,1,0]'::vector)
    """)

    # Test cosine distance operator (<=>)
    result = await db_connection.fetch("""
        SELECT id, embedding <=> '[1,0,0]' AS distance
        FROM _test_vectors
        ORDER BY distance
        LIMIT 1
    """)

    assert len(result) > 0, "No results from vector query"
    assert result[0]['id'] == 1, "Incorrect nearest neighbor found"
    assert result[0]['distance'] < 0.01, "Distance should be ~0 for identical vectors"


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
async def test_vector_l2_distance(db_connection):
    """Test that vector L2 (Euclidean) distance operations work correctly."""
    # Create temp table
    await db_connection.execute("""
        CREATE TEMP TABLE IF NOT EXISTS _test_vectors_l2 (
            id SERIAL PRIMARY KEY,
            embedding vector(3)
        )
    """)

    # Insert test vectors
    await db_connection.execute("""
        INSERT INTO _test_vectors_l2 (embedding) VALUES
        ('[0,0,0]'::vector),
        ('[1,1,1]'::vector),
        ('[2,2,2]'::vector)
    """)

    # Test L2 distance operator (<->)
    result = await db_connection.fetch("""
        SELECT id, embedding <-> '[1,1,1]' AS distance
        FROM _test_vectors_l2
        ORDER BY distance
        LIMIT 1
    """)

    assert len(result) > 0, "No results from vector query"
    assert result[0]['id'] == 2, "Incorrect nearest neighbor found"
    assert result[0]['distance'] < 0.01, "Distance should be 0 for identical vectors"


@pytest.mark.asyncio
@pytest.mark.verification
@pytest.mark.extensions
@pytest.mark.pgvectorscale
async def test_diskann_index_creation(db_connection):
    """Test that StreamingDiskANN indexes can be created (requires pgvectorscale)."""
    # Check if vectorscale is enabled
    result = await db_connection.fetchrow(
        "SELECT 1 FROM pg_extension WHERE extname = 'vectorscale'"
    )
    if result is None:
        pytest.skip("pgvectorscale not enabled - DiskANN indexes unavailable")

    try:
        # Create temp table
        await db_connection.execute("""
            CREATE TEMP TABLE IF NOT EXISTS _test_diskann (
                id SERIAL PRIMARY KEY,
                embedding vector(128)
            )
        """)

        # Insert some test data
        await db_connection.execute("""
            INSERT INTO _test_diskann (embedding)
            SELECT array_agg(random())::vector(128)
            FROM generate_series(1, 128)
        """)

        # Create DiskANN index
        await db_connection.execute("""
            CREATE INDEX IF NOT EXISTS _test_diskann_idx
            ON _test_diskann USING diskann (embedding)
        """)

        # Verify index was created
        result = await db_connection.fetchrow("""
            SELECT indexname FROM pg_indexes
            WHERE indexname = '_test_diskann_idx'
        """)

        assert result is not None, "DiskANN index was not created"

    except Exception as e:
        if 'diskann' in str(e).lower():
            pytest.fail(f"DiskANN index creation failed: {e}")
        raise


@pytest.mark.asyncio
@pytest.mark.verification
async def test_extension_versions(db_connection):
    """Test that extension versions are reported correctly."""
    extensions = await db_connection.fetch("""
        SELECT extname, extversion
        FROM pg_extension
        WHERE extname IN ('vector', 'vectorscale', 'timescaledb')
        ORDER BY extname
    """)

    # At minimum, pgvector should be enabled
    ext_dict = {row['extname']: row['extversion'] for row in extensions}

    assert 'vector' in ext_dict, "pgvector extension not found"
    print(f"\nEnabled extensions:")
    for name, version in ext_dict.items():
        print(f"  {name}: {version}")


@pytest.mark.asyncio
@pytest.mark.verification
async def test_all_required_extensions(db_connection):
    """Summary test: verify all required extensions are properly configured."""
    # Check pgvector (required)
    pgvector = await db_connection.fetchrow(
        "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
    )
    assert pgvector is not None, "pgvector is required but not enabled"

    # Check pgvectorscale (recommended)
    vectorscale = await db_connection.fetchrow(
        "SELECT extversion FROM pg_extension WHERE extname = 'vectorscale'"
    )

    if vectorscale:
        print(f"\npgvector: {pgvector['extversion']}")
        print(f"pgvectorscale: {vectorscale['extversion']}")
        print("StreamingDiskANN indexes are available for optimal performance")
    else:
        print(f"\npgvector: {pgvector['extversion']}")
        print("pgvectorscale: not enabled (using HNSW/IVFFlat indexes)")
