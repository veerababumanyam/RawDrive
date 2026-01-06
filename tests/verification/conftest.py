"""Pytest configuration for verification tests."""

import pytest
import os


def pytest_configure(config):
    """Configure pytest with custom markers for verification tests."""
    config.addinivalue_line(
        "markers", "verification: Database and infrastructure verification tests"
    )
    config.addinivalue_line(
        "markers", "extensions: PostgreSQL extension verification tests"
    )
    config.addinivalue_line(
        "markers", "pgvectorscale: Tests specific to pgvectorscale extension"
    )


@pytest.fixture(scope="module")
def database_url():
    """Get database URL from environment or use default."""
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
    )
    # Convert async URL to sync if needed
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest.fixture(scope="module")
def api_url():
    """Get API URL from environment or use default."""
    return os.environ.get("API_URL", "http://localhost:8000")
