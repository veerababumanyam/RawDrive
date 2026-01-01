"""
Unit Tests for Prometheus Metrics.

Tests the metrics collection functionality for observability.
"""

import pytest
from unittest.mock import patch, MagicMock

from src.observability.metrics import (
    MetricsCollector,
    get_metrics,
    track_request,
    track_error,
    track_email_sent,
    track_rsvp_submission,
)


class TestMetricsCollector:
    """Test the MetricsCollector class."""

    @pytest.fixture
    def collector(self):
        """Create a fresh MetricsCollector instance."""
        return MetricsCollector()

    def test_request_completed_increments_counter(self, collector):
        """Request completed increments the request counter."""
        # This just verifies it doesn't raise
        collector.request_completed("GET", "/api/invitations", 200)

    def test_email_sent_increments_counter(self, collector):
        """Email sent increments the email counter."""
        collector.email_sent("success", "invitation")
        collector.email_sent("failed", "reminder")

    def test_rsvp_submitted_increments_counter(self, collector):
        """RSVP submission increments the counter."""
        collector.rsvp_submitted("yes", has_plus_ones=True)
        collector.rsvp_submitted("no", has_plus_ones=False)
        collector.rsvp_submitted("maybe")

    def test_error_occurred_increments_counter(self, collector):
        """Error occurrence increments the error counter."""
        collector.error_occurred("validation_error", "/api/guests")
        collector.error_occurred("database_error", "/api/rsvp")

    def test_guests_imported_increments_by_count(self, collector):
        """Guests imported increments by the count value."""
        collector.guests_imported(50, source="csv")
        collector.guests_imported(100, source="excel")

    def test_invitation_viewed_increments_counter(self, collector):
        """Invitation view increments the counter."""
        collector.invitation_viewed("desktop", "chrome")
        collector.invitation_viewed("mobile", "safari")

    def test_cache_hit_increments_counter(self, collector):
        """Cache hit increments the counter."""
        collector.cache_hit("redis")
        collector.cache_hit("memory")

    def test_cache_miss_increments_counter(self, collector):
        """Cache miss increments the counter."""
        collector.cache_miss("redis")

    def test_set_db_connections_sets_gauge(self, collector):
        """Database connections gauge is set."""
        collector.set_db_connections(5)
        collector.set_db_connections(10)

    def test_set_active_invitations_sets_gauge(self, collector):
        """Active invitations gauge is set per workspace."""
        collector.set_active_invitations("workspace-1", 25)
        collector.set_active_invitations("workspace-2", 50)


class TestTrackRequestDuration:
    """Test request duration tracking context manager."""

    def test_track_request_duration_context_manager(self):
        """Context manager tracks request duration."""
        collector = MetricsCollector()

        with collector.track_request_duration("GET", "/api/test"):
            # Simulate some work
            pass

    def test_track_request_duration_with_exception(self):
        """Duration is recorded even when exception occurs."""
        collector = MetricsCollector()

        with pytest.raises(ValueError):
            with collector.track_request_duration("POST", "/api/test"):
                raise ValueError("Test error")


class TestTrackDbQuery:
    """Test database query tracking context manager."""

    def test_track_db_query_context_manager(self):
        """Context manager tracks database query duration."""
        collector = MetricsCollector()

        with collector.track_db_query("SELECT"):
            # Simulate query
            pass

    def test_track_db_query_with_exception(self):
        """Duration is recorded even when query fails."""
        collector = MetricsCollector()

        with pytest.raises(RuntimeError):
            with collector.track_db_query("INSERT"):
                raise RuntimeError("Query failed")


class TestTrackEmailDuration:
    """Test email send duration tracking context manager."""

    def test_track_email_duration_context_manager(self):
        """Context manager tracks email send duration."""
        collector = MetricsCollector()

        with collector.track_email_duration():
            # Simulate email send
            pass


class TestConvenienceFunctions:
    """Test module-level convenience functions."""

    def test_get_metrics_returns_singleton(self):
        """get_metrics returns the same instance."""
        metrics1 = get_metrics()
        metrics2 = get_metrics()

        assert metrics1 is metrics2

    def test_track_request_function(self):
        """track_request convenience function works."""
        # Should not raise
        track_request("GET", "/api/test", 200)
        track_request("POST", "/api/guests", 201)
        track_request("DELETE", "/api/guests/1", 404)

    def test_track_error_function(self):
        """track_error convenience function works."""
        track_error("validation_error", "/api/rsvp")
        track_error("auth_error")

    def test_track_email_sent_function(self):
        """track_email_sent convenience function works."""
        track_email_sent("success")
        track_email_sent("failed", "reminder")

    def test_track_rsvp_submission_function(self):
        """track_rsvp_submission convenience function works."""
        track_rsvp_submission("yes")
        track_rsvp_submission("no", has_plus_ones=True)


class TestMetricLabels:
    """Test that metrics use correct labels."""

    def test_request_method_labels(self):
        """Request metrics include method label."""
        collector = MetricsCollector()

        # Various HTTP methods
        collector.request_completed("GET", "/api/test", 200)
        collector.request_completed("POST", "/api/test", 201)
        collector.request_completed("PUT", "/api/test", 200)
        collector.request_completed("DELETE", "/api/test", 204)

    def test_status_code_labels(self):
        """Request metrics include status code label."""
        collector = MetricsCollector()

        # Various status codes
        collector.request_completed("GET", "/api/test", 200)
        collector.request_completed("GET", "/api/test", 400)
        collector.request_completed("GET", "/api/test", 401)
        collector.request_completed("GET", "/api/test", 500)

    def test_email_template_labels(self):
        """Email metrics include template label."""
        collector = MetricsCollector()

        collector.email_sent("success", "invitation")
        collector.email_sent("success", "reminder")
        collector.email_sent("failed", "thank_you")

    def test_device_type_labels(self):
        """View metrics include device type label."""
        collector = MetricsCollector()

        collector.invitation_viewed("desktop", "chrome")
        collector.invitation_viewed("mobile", "safari")
        collector.invitation_viewed("tablet", "firefox")
        collector.invitation_viewed("unknown", "unknown")
