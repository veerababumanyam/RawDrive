"""Tests for DSN (connection string) utilities."""

import pytest
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dsn import normalize_database_url, build_pgbouncer_dsn


class TestNormalizeDatabaseUrl:
    """Tests for normalize_database_url function."""

    def test_converts_sqlalchemy_format(self):
        """SQLAlchemy format is converted to standard format."""
        url = "postgresql+asyncpg://user:pass@localhost:5432/db"
        result = normalize_database_url(url)
        assert result == "postgresql://user:pass@localhost:5432/db"

    def test_preserves_standard_format(self):
        """Standard format is unchanged."""
        url = "postgresql://user:pass@localhost:5432/db"
        result = normalize_database_url(url)
        assert result == url

    def test_preserves_query_params(self):
        """Query parameters are preserved."""
        url = "postgresql+asyncpg://user:pass@localhost/db?sslmode=require"
        result = normalize_database_url(url)
        assert "sslmode=require" in result


class TestBuildPgbouncerDsn:
    """Tests for build_pgbouncer_dsn function."""

    def test_returns_normalized_url_when_disabled(self):
        """Returns normalized URL when PgBouncer is disabled."""
        url = "postgresql+asyncpg://user:pass@postgres:5432/db"
        result = build_pgbouncer_dsn(url, enabled=False)
        assert result == "postgresql://user:pass@postgres:5432/db"

    def test_replaces_host_and_port_when_enabled(self):
        """Host and port are replaced when PgBouncer is enabled."""
        url = "postgresql://user:pass@postgres:5432/db"
        result = build_pgbouncer_dsn(
            url,
            pgbouncer_host="pgbouncer.local",
            pgbouncer_port=6432,
            enabled=True,
        )

        assert "pgbouncer.local:6432" in result
        assert "postgres:5432" not in result

    def test_preserves_credentials(self):
        """Username and password are preserved."""
        url = "postgresql://myuser:mypass@postgres:5432/db"
        result = build_pgbouncer_dsn(
            url,
            pgbouncer_host="pgbouncer",
            enabled=True,
        )

        assert "myuser:mypass@" in result

    def test_preserves_database_name(self):
        """Database name is preserved."""
        url = "postgresql://user:pass@postgres:5432/mydb"
        result = build_pgbouncer_dsn(
            url,
            pgbouncer_host="pgbouncer",
            enabled=True,
        )

        assert "/mydb" in result

    def test_preserves_query_params(self):
        """Query parameters are preserved."""
        url = "postgresql://user:pass@postgres:5432/db?sslmode=require"
        result = build_pgbouncer_dsn(
            url,
            pgbouncer_host="pgbouncer",
            enabled=True,
        )

        assert "sslmode=require" in result

    def test_uses_default_host_and_port(self):
        """Uses default PgBouncer host and port if not specified."""
        url = "postgresql://user:pass@postgres:5432/db"
        result = build_pgbouncer_dsn(url, enabled=True)

        # Default is pgbouncer:6432
        assert "pgbouncer:6432" in result

    def test_handles_url_without_password(self):
        """Handles URLs with only username."""
        url = "postgresql://myuser@postgres:5432/db"
        result = build_pgbouncer_dsn(
            url,
            pgbouncer_host="pgbouncer",
            enabled=True,
        )

        assert "myuser@pgbouncer" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
