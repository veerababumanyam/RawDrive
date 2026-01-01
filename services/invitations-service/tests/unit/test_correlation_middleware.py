"""
Unit Tests for Correlation ID Middleware.

Tests the correlation ID generation, extraction, and propagation
throughout request lifecycle.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

from src.middleware.correlation import (
    generate_correlation_id,
    extract_correlation_id,
    get_correlation_id_from_request,
    CORRELATION_ID_HEADERS,
)


class TestCorrelationIdGeneration:
    """Test correlation ID generation."""

    def test_generate_correlation_id_returns_uuid(self):
        """Generated correlation ID is a valid UUID."""
        correlation_id = generate_correlation_id()

        # Should be a string
        assert isinstance(correlation_id, str)

        # Should be a valid UUID
        parsed = UUID(correlation_id)
        assert str(parsed) == correlation_id

    def test_generate_correlation_id_unique(self):
        """Each call generates a unique ID."""
        ids = [generate_correlation_id() for _ in range(100)]

        # All should be unique
        assert len(set(ids)) == 100


class TestCorrelationIdExtraction:
    """Test correlation ID extraction from requests."""

    @pytest.fixture
    def mock_request(self):
        """Create a mock request object."""
        request = MagicMock()
        request.headers = {}
        return request

    def test_extract_from_x_correlation_id_header(self, mock_request):
        """Extracts from X-Correlation-ID header."""
        mock_request.headers = {"X-Correlation-ID": "test-correlation-123"}

        result = extract_correlation_id(mock_request)

        assert result == "test-correlation-123"

    def test_extract_from_x_request_id_header(self, mock_request):
        """Extracts from X-Request-ID header."""
        mock_request.headers = {"X-Request-ID": "request-id-456"}

        result = extract_correlation_id(mock_request)

        assert result == "request-id-456"

    def test_extract_from_x_trace_id_header(self, mock_request):
        """Extracts from X-Trace-ID header."""
        mock_request.headers = {"X-Trace-ID": "trace-id-789"}

        result = extract_correlation_id(mock_request)

        assert result == "trace-id-789"

    def test_prefers_x_correlation_id_over_others(self, mock_request):
        """X-Correlation-ID takes precedence over other headers."""
        mock_request.headers = {
            "X-Correlation-ID": "correlation-winner",
            "X-Request-ID": "request-loser",
            "X-Trace-ID": "trace-loser",
        }

        result = extract_correlation_id(mock_request)

        assert result == "correlation-winner"

    def test_generates_new_id_when_no_header(self, mock_request):
        """Generates new ID when no header present."""
        mock_request.headers = {}

        result = extract_correlation_id(mock_request)

        # Should be a valid UUID
        UUID(result)  # Will raise if invalid

    def test_generates_new_id_when_header_empty(self, mock_request):
        """Generates new ID when header is empty string."""
        mock_request.headers = {"X-Correlation-ID": ""}

        result = extract_correlation_id(mock_request)

        # Empty string is falsy, so should generate new
        assert result != ""
        UUID(result)


class TestGetCorrelationIdFromRequest:
    """Test retrieving correlation ID from request state."""

    def test_returns_id_from_state(self):
        """Returns correlation ID stored in request state."""
        request = MagicMock()
        request.state.correlation_id = "state-correlation-id"

        result = get_correlation_id_from_request(request)

        assert result == "state-correlation-id"

    def test_generates_new_id_when_not_in_state(self):
        """Generates new ID when not in request state."""
        request = MagicMock()
        request.state = MagicMock(spec=[])  # No correlation_id attribute

        result = get_correlation_id_from_request(request)

        # Should generate a valid UUID
        UUID(result)


class TestCorrelationHeaders:
    """Test correlation header configuration."""

    def test_supported_headers_defined(self):
        """Required headers are in the supported list."""
        assert "X-Correlation-ID" in CORRELATION_ID_HEADERS
        assert "X-Request-ID" in CORRELATION_ID_HEADERS
        assert "X-Trace-ID" in CORRELATION_ID_HEADERS

    def test_at_least_three_headers_supported(self):
        """At least three header formats are supported."""
        assert len(CORRELATION_ID_HEADERS) >= 3
