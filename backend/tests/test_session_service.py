"""
Unit tests for session_service.py

Tests critical session operations including SQL parameter binding.
These tests prevent regressions like the 500 error caused by incorrect parameter binding.
"""

import pytest
import uuid
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import json

from app.services.session_service import SessionService


@pytest.fixture
def mock_pool():
    """Create a mock database pool."""
    pool = AsyncMock()
    return pool


@pytest.fixture
def session_service():
    """Create a SessionService instance."""
    return SessionService()


class TestSessionCreation:
    """Tests for session creation functionality."""

    @pytest.mark.asyncio
    async def test_create_session_sql_parameters(self, session_service, mock_pool):
        """
        Test that create_session uses correct SQL parameter binding.

        This test specifically prevents the bug where VALUES used
        ($1, $2, ..., $11, $11, $12) instead of ($1, $2, ..., $11, $12, $13).

        CRITICAL: If this test fails, check session_service.py line 157-179
        for SQL parameter binding issues.
        """
        # Arrange
        user_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        token = "test_token"
        device_info = {"platform": "web", "browser": "chrome"}
        device_fingerprint = "test_fingerprint"
        ip_address = "127.0.0.1"
        user_agent = "Mozilla/5.0"
        expires_at = datetime.utcnow() + timedelta(hours=1)

        # Mock pool.execute to capture SQL and parameters
        captured_sql = None
        captured_params = None

        async def capture_execute(sql, *params):
            nonlocal captured_sql, captured_params
            captured_sql = sql
            captured_params = params

        mock_pool.execute = AsyncMock(side_effect=capture_execute)

        # Act
        with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
            try:
                await session_service.create_session(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    token=token,
                    device_info=device_info,
                    device_fingerprint=device_fingerprint,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    expires_at=expires_at
                )
            except Exception:
                pass  # We're testing SQL structure, not execution

        # Assert
        assert captured_sql is not None, "SQL was not executed"
        assert captured_params is not None, "Parameters were not captured"

        # Check parameter count
        # SQL should use $1, $2, ..., $13 (13 parameters)
        assert len(captured_params) == 13, \
            f"Expected 13 parameters, got {len(captured_params)}. " \
            f"SQL might be using incorrect binding like ($11, $11, $12) instead of ($11, $12, $13)"

        # Verify VALUES clause uses sequential placeholders
        values_clause = captured_sql[captured_sql.find("VALUES"):captured_sql.find("VALUES") + 200]
        assert "$13" in values_clause, \
            "VALUES clause should use $13 for the last parameter (expires_at)"

        # Verify parameter order
        expected_order = [
            "session_id",  # $1
            "user_id",  # $2
            "workspace_id",  # $3
            "token_hash",  # $4
            "device_info",  # $5 (JSON)
            "device_fingerprint",  # $6
            "ip_address",  # $7
            "ip_address",  # $8 (last_ip_address)
            "None",  # $9 (refreshed_from_session_id)
            "user_agent",  # $10
            "now",  # $11 (created_at)
            "now",  # $12 (last_used_at)
            "expires_at",  # $13
        ]

        # Verify we have the right number of parameters
        assert len(captured_params) == len(expected_order)

        # Verify critical parameters are in correct positions
        assert captured_params[1] == user_id, "user_id should be $2"
        assert captured_params[2] == workspace_id, "workspace_id should be $3"
        assert captured_params[12] == expires_at, "expires_at should be $13"

    @pytest.mark.asyncio
    async def test_create_session_timestamps(self, session_service, mock_pool):
        """
        Test that created_at and last_used_at are set correctly.

        Both should be set to NOW(), passed as two separate parameters.
        """
        user_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        expires_at = datetime.utcnow() + timedelta(hours=1)

        captured_params = None

        async def capture_execute(sql, *params):
            nonlocal captured_params
            captured_params = params

        mock_pool.execute = AsyncMock(side_effect=capture_execute)

        with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
            try:
                await session_service.create_session(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    token="test",
                    expires_at=expires_at
                )
            except Exception:
                pass

        # Parameters 11 and 12 should both be timestamps (created_at and last_used_at)
        # They should be the same value (current time)
        created_at_param = captured_params[10]  # $11
        last_used_at_param = captured_params[11]  # $12

        # Both should be datetime objects
        assert isinstance(created_at_param, datetime)
        assert isinstance(last_used_at_param, datetime)

        # They should be very close in time (within 1 second)
        time_diff = abs((created_at_param - last_used_at_param).total_seconds())
        assert time_diff < 1.0, \
            f"created_at and last_used_at should be nearly identical, got {time_diff}s difference"

    @pytest.mark.asyncio
    async def test_create_session_device_info_json(self, session_service, mock_pool):
        """Test that device_info is properly JSON serialized."""
        device_info = {"platform": "ios", "version": "16.0"}

        captured_params = None

        async def capture_execute(sql, *params):
            nonlocal captured_params
            captured_params = params

        mock_pool.execute = AsyncMock(side_effect=capture_execute)

        with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
            try:
                await session_service.create_session(
                    user_id=uuid.uuid4(),
                    workspace_id=uuid.uuid4(),
                    token="test",
                    device_info=device_info,
                    expires_at=datetime.utcnow() + timedelta(hours=1)
                )
            except Exception:
                pass

        # Parameter 5 ($5) should be JSON-serialized device_info
        device_info_param = captured_params[4]
        assert isinstance(device_info_param, str)
        assert json.loads(device_info_param) == device_info


class TestSQLInjectionPrevention:
    """Tests for SQL injection prevention."""

    @pytest.mark.asyncio
    async def test_parameterized_queries(self, session_service, mock_pool):
        """
        Verify that all queries use parameterized statements.

        This prevents SQL injection attacks.
        """
        malicious_token = "'; DROP TABLE sessions; --"

        captured_sql = None

        async def capture_execute(sql, *params):
            nonlocal captured_sql
            captured_sql = sql

        mock_pool.execute = AsyncMock(side_effect=capture_execute)

        with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
            try:
                await session_service.create_session(
                    user_id=uuid.uuid4(),
                    workspace_id=uuid.uuid4(),
                    token=malicious_token,
                    expires_at=datetime.utcnow() + timedelta(hours=1)
                )
            except Exception:
                pass

        # SQL should use placeholders ($1, $2, etc.), not string interpolation
        assert "$1" in captured_sql
        assert malicious_token not in captured_sql, \
            "User input should not be directly in SQL - use parameterized queries"


class TestParameterBindingRegression:
    """
    Regression tests for the 500 error bug (2026-01-07).

    These tests ensure we don't reintroduce the parameter binding issue.
    """

    @pytest.mark.asyncio
    async def test_no_reused_placeholders(self, session_service, mock_pool):
        """
        Ensure SQL doesn't reuse placeholders like ($11, $11, $12).

        This was the bug: VALUES ($1, ..., $11, $11, $12)
        Should be: VALUES ($1, ..., $11, $12, $13)
        """
        captured_sql = None

        async def capture_execute(sql, *params):
            nonlocal captured_sql
            captured_sql = sql

        mock_pool.execute = AsyncMock(side_effect=capture_execute)

        with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
            try:
                await session_service.create_session(
                    user_id=uuid.uuid4(),
                    workspace_id=uuid.uuid4(),
                    token="test",
                    expires_at=datetime.utcnow() + timedelta(hours=1)
                )
            except Exception:
                pass

        # Extract VALUES clause
        values_start = captured_sql.find("VALUES")
        values_end = captured_sql.find(")", values_start) + 1
        values_clause = captured_sql[values_start:values_end]

        # Check for duplicate placeholders
        import re
        placeholders = re.findall(r'\$\d+', values_clause)

        # Count occurrences of each placeholder
        from collections import Counter
        placeholder_counts = Counter(placeholders)

        # No placeholder should appear more than once in VALUES
        duplicates = {ph: count for ph, count in placeholder_counts.items() if count > 1}

        assert not duplicates, \
            f"VALUES clause has duplicate placeholders: {duplicates}. " \
            f"This causes parameter binding errors. Use sequential placeholders."

    @pytest.mark.asyncio
    async def test_parameter_count_matches_placeholders(self, session_service, mock_pool):
        """
        Verify that the number of parameters matches the highest placeholder number.

        If SQL has $13, we must pass exactly 13 parameters.
        """
        captured_sql = None
        captured_params = None

        async def capture_execute(sql, *params):
            nonlocal captured_sql, captured_params
            captured_sql = sql
            captured_params = params

        mock_pool.execute = AsyncMock(side_effect=capture_execute)

        with patch('app.services.session_service.get_postgres_pool', return_value=mock_pool):
            try:
                await session_service.create_session(
                    user_id=uuid.uuid4(),
                    workspace_id=uuid.uuid4(),
                    token="test",
                    expires_at=datetime.utcnow() + timedelta(hours=1)
                )
            except Exception:
                pass

        # Find highest placeholder number
        import re
        placeholders = re.findall(r'\$(\d+)', captured_sql)
        max_placeholder = max(int(ph) for ph in placeholders)

        assert len(captured_params) == max_placeholder, \
            f"SQL uses ${max_placeholder} but only {len(captured_params)} parameters provided"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
