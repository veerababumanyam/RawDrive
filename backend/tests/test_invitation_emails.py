"""Tests for invitation email migration from SendGrid to PostalClient.

Verifies that all 3 Celery tasks in the invitations-service email_worker
use PostalClient instead of SendGrid for sending emails.

These tests run locally (not in Docker) since the invitations-service
code is in a separate container and not accessible from the backend container.
"""

import ast
import os
import sys
import textwrap
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Root of the repo
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
INVITATIONS_SRC = REPO_ROOT / "services" / "invitations-service" / "src"
EMAIL_WORKER_PATH = INVITATIONS_SRC / "workers" / "email_worker.py"
POSTAL_CLIENT_PATH = INVITATIONS_SRC / "services" / "postal_client.py"
CONFIG_PATH = INVITATIONS_SRC / "config.py"


# ---------------------------------------------------------------------------
# Fixtures: stub out invitations-service dependencies so we can import
# email_worker in the backend test environment.
# ---------------------------------------------------------------------------


def _stub_invitations_modules():
    """Insert stub modules for invitations-service dependencies."""
    stubs = {}

    # Fake celery app with pass-through task decorator
    fake_celery_mod = MagicMock()
    fake_celery = MagicMock()

    def fake_task(*args, **kwargs):
        if args and callable(args[0]):
            # @celery_app.task without parens
            fn = args[0]
            fn.delay = MagicMock()
            return fn

        def decorator(fn):
            fn.delay = MagicMock()
            # Simulate bind=True by making self a mock with request.retries
            if kwargs.get("bind"):
                original_fn = fn
                def bound_fn(self_arg, *a, **kw):
                    if self_arg is None:
                        self_arg = MagicMock()
                        self_arg.request.retries = 0
                    return original_fn(self_arg, *a, **kw)
                bound_fn.delay = MagicMock()
                bound_fn.__name__ = fn.__name__
                return bound_fn
            return fn
        return decorator

    fake_celery.task = fake_task
    fake_celery_mod.celery_app = fake_celery

    # Fake settings
    fake_config = MagicMock()
    fake_settings = MagicMock()
    fake_settings.POSTAL_API_URL = "http://postal:5000"
    fake_settings.POSTAL_API_KEY = "test-postal-key"
    fake_settings.POSTAL_FROM_EMAIL = "noreply@rawdrive.in"
    fake_settings.POSTAL_FROM_NAME = "RawDrive"
    fake_settings.SENDGRID_API_KEY = ""
    fake_settings.EMAIL_FROM_ADDRESS = "noreply@rawdrive.in"
    fake_settings.EMAIL_FROM_NAME = "RawDrive"
    fake_config.settings = fake_settings

    # Fake logging
    fake_logging = MagicMock()
    fake_logging.get_logger.return_value = MagicMock()

    # Fake security utils
    fake_security = MagicMock()
    fake_security.safe_html_escape = lambda s: (
        str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )
    fake_security.safe_url = lambda u: u
    fake_security.sanitize_email_template_data = lambda d: d

    fake_utils = MagicMock()
    fake_utils.security = fake_security

    # Wire up src package hierarchy
    fake_src = MagicMock()
    fake_src.config = fake_config
    fake_src.config.settings = fake_settings
    fake_src.logging = fake_logging
    fake_src.utils = fake_utils
    fake_src.utils.security = fake_security

    # Fake bulk invite service
    fake_bulk = MagicMock()
    fake_src.services = MagicMock()
    fake_src.services.bulk_invite_service = fake_bulk

    # Register all stubs
    stubs["src"] = fake_src
    stubs["src.config"] = fake_config
    stubs["src.logging"] = fake_logging
    stubs["src.utils"] = fake_utils
    stubs["src.utils.security"] = fake_security
    stubs["src.services"] = fake_src.services
    stubs["src.services.bulk_invite_service"] = fake_bulk
    stubs["src.workers"] = MagicMock()
    stubs["src.workers.celery_app"] = fake_celery_mod

    return stubs


def _load_email_worker(monkeypatch):
    """Load the email_worker module with stubbed dependencies."""
    stubs = _stub_invitations_modules()
    for mod_name, mod in stubs.items():
        monkeypatch.setitem(sys.modules, mod_name, mod)

    # Also stub the postal_client that email_worker imports
    # (the real one will be created in GREEN phase)
    if POSTAL_CLIENT_PATH.exists():
        # Load the real postal_client module
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "src.services.postal_client", str(POSTAL_CLIENT_PATH)
        )
        postal_mod = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, "src.services.postal_client", postal_mod)
        spec.loader.exec_module(postal_mod)
    else:
        fake_postal = MagicMock()
        monkeypatch.setitem(sys.modules, "src.services.postal_client", fake_postal)

    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "src.workers.email_worker", str(EMAIL_WORKER_PATH)
    )
    mod = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "src.workers.email_worker", mod)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# Test 1: send_invitation_email calls PostalClient.send_message (not SendGrid)
# ---------------------------------------------------------------------------


class TestSendInvitationEmail:
    def test_uses_postal_client(self, monkeypatch):
        email_worker = _load_email_worker(monkeypatch)

        mock_postal = AsyncMock()
        mock_postal.send_message.return_value = {
            "message_id": "test-123",
            "messages": {"test@example.com": "token-abc"},
        }

        with patch.object(email_worker, "get_postal_client", return_value=mock_postal):
            result = email_worker.send_invitation_email(
                None,  # self (celery task bound arg)
                guest_id="guest-1",
                invitation_id="inv-1",
                workspace_id="ws-1",
                recipient_email="test@example.com",
                recipient_name="Test User",
                invitation_url="https://app.rawdrive.in/invite/abc",
            )

        mock_postal.send_message.assert_called_once()
        assert result["status"] == "sent"


# ---------------------------------------------------------------------------
# Test 2: send_bulk_invitations sends N emails for N guests
# ---------------------------------------------------------------------------


class TestSendBulkInvitations:
    def test_queues_n_emails_for_n_guests(self, monkeypatch):
        email_worker = _load_email_worker(monkeypatch)

        guest_ids = ["g1", "g2", "g3"]
        result = email_worker.send_bulk_invitations(
            None,
            invitation_id="inv-1",
            workspace_id="ws-1",
            guest_ids=guest_ids,
            invitation_url_template="https://app.rawdrive.in/invite/{guest_id}",
        )

        assert result["total_queued"] == 3
        assert result["failed"] == 0


# ---------------------------------------------------------------------------
# Test 3: send_reminder_email calls PostalClient.send_message
# ---------------------------------------------------------------------------


class TestSendReminderEmail:
    def test_uses_postal_client(self, monkeypatch):
        email_worker = _load_email_worker(monkeypatch)

        mock_postal = AsyncMock()
        mock_postal.send_message.return_value = {
            "message_id": "rem-123",
            "messages": {"test@example.com": "token-rem"},
        }

        with patch.object(email_worker, "get_postal_client", return_value=mock_postal):
            result = email_worker.send_reminder_email(
                guest_id="guest-1",
                invitation_id="inv-1",
                workspace_id="ws-1",
                recipient_email="test@example.com",
                recipient_name="Test User",
                invitation_url="https://app.rawdrive.in/invite/abc",
                days_until_event=7,
            )

        mock_postal.send_message.assert_called_once()
        assert result["status"] == "sent"


# ---------------------------------------------------------------------------
# Test 4: Skips gracefully when POSTAL_API_URL not configured
# ---------------------------------------------------------------------------


class TestPostalNotConfigured:
    def test_skips_when_postal_not_configured(self, monkeypatch):
        email_worker = _load_email_worker(monkeypatch)

        with patch.object(email_worker, "get_postal_client", return_value=None):
            result = email_worker.send_invitation_email(
                None,
                guest_id="guest-1",
                invitation_id="inv-1",
                workspace_id="ws-1",
                recipient_email="test@example.com",
                recipient_name="Test User",
                invitation_url="https://app.rawdrive.in/invite/abc",
            )

        assert result["status"] == "skipped"


# ---------------------------------------------------------------------------
# Test 5: Handles PostalClient errors without crashing Celery task
# ---------------------------------------------------------------------------


class TestPostalErrorHandling:
    def test_handles_postal_errors_gracefully(self, monkeypatch):
        email_worker = _load_email_worker(monkeypatch)

        mock_postal = AsyncMock()
        mock_postal.send_message.side_effect = Exception("Postal connection refused")

        # Simulate exhausted retries so the task returns failed instead of retrying
        mock_self = MagicMock()
        mock_self.request.retries = MAX_RETRIES = 3

        with patch.object(email_worker, "get_postal_client", return_value=mock_postal):
            result = email_worker.send_invitation_email(
                mock_self,
                guest_id="guest-1",
                invitation_id="inv-1",
                workspace_id="ws-1",
                recipient_email="test@example.com",
                recipient_name="Test User",
                invitation_url="https://app.rawdrive.in/invite/abc",
            )

        assert result["status"] == "failed"


# ---------------------------------------------------------------------------
# Static analysis: Verify no SendGrid imports remain in email_worker
# ---------------------------------------------------------------------------


class TestNoSendGridImports:
    def test_email_worker_has_no_sendgrid_imports(self):
        """The email_worker source must not contain SendGrid imports."""
        source = EMAIL_WORKER_PATH.read_text()
        assert "SendGridAPIClient" not in source, (
            "email_worker.py still imports SendGridAPIClient"
        )
        assert "from sendgrid" not in source, (
            "email_worker.py still imports from sendgrid"
        )

    def test_email_worker_imports_postal_client(self):
        """The email_worker source must import PostalClient."""
        source = EMAIL_WORKER_PATH.read_text()
        assert "PostalClient" in source or "postal_client" in source, (
            "email_worker.py does not reference PostalClient"
        )

    def test_postal_config_in_config_py(self):
        """invitations-service config.py must have POSTAL_API_URL."""
        source = CONFIG_PATH.read_text()
        assert "POSTAL_API_URL" in source, (
            "config.py missing POSTAL_API_URL setting"
        )
