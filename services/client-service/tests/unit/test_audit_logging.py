"""Tests for Audit Logging enhancements (SOC2 CC6.3).

Verifies comprehensive audit logging for PII field access and data operations.

NOTE: These tests use mocking to avoid the full import chain.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
import sys

# =============================================================================
# Mock the problematic imports before importing the module under test
# =============================================================================

# Mock the database module
mock_execute_query = AsyncMock()
sys.modules['src.database'] = MagicMock(execute_query=mock_execute_query)

# Mock the log_config module
mock_logger = MagicMock()
mock_get_logger = MagicMock(return_value=mock_logger)
sys.modules['src.log_config'] = MagicMock(get_logger=mock_get_logger)

# Mock the services __init__ to prevent cascade imports
sys.modules['src.services'] = MagicMock()

# Now we can import the modules that depend on these
from src.constants.pii_fields import PII_FIELDS, is_pii_field


class TestPIIFieldDefinition:
    """Test PII field definitions and helper functions."""

    def test_pii_fields_client_entity(self):
        """Verify client entity has expected PII fields defined."""
        assert "client" in PII_FIELDS
        assert "email" in PII_FIELDS["client"]
        assert "phone" in PII_FIELDS["client"]
        assert "mobile_phone" in PII_FIELDS["client"]
        assert "date_of_birth" in PII_FIELDS["client"]

    def test_is_pii_field_detection(self):
        """Test that is_pii_field correctly identifies PII fields."""
        # Test known PII fields for client entity (field_name first, entity_type second)
        assert is_pii_field("email", "client") is True
        assert is_pii_field("phone", "client") is True
        assert is_pii_field("mobile_phone", "client") is True
        assert is_pii_field("date_of_birth", "client") is True

        # Test non-PII fields
        assert is_pii_field("name", "client") is False
        assert is_pii_field("status", "client") is False
        assert is_pii_field("created_at", "client") is False

        # Test unknown entity type returns False
        assert is_pii_field("email", "unknown_entity") is False


class TestAuditServiceBasics:
    """Test basic audit logging functionality."""

    @pytest.fixture
    def audit_service(self):
        """Create an AuditService instance with mocked dependencies."""
        # Reset the mock before each test
        mock_execute_query.reset_mock()
        mock_logger.reset_mock()

        # Import the actual service directly from the module file
        # to bypass the services/__init__.py cascade
        import importlib.util
        import os

        # Get the path to the audit_service module
        service_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "src", "services", "audit_service.py"
        )
        service_path = os.path.normpath(service_path)

        spec = importlib.util.spec_from_file_location("audit_service_direct", service_path)
        module = importlib.util.module_from_spec(spec)

        # Set up the module's globals with our mocks
        module.execute_query = mock_execute_query
        module.get_logger = mock_get_logger
        module.logger = mock_logger
        module.PII_FIELDS = PII_FIELDS
        module.get_pii_fields_for_entity = lambda e: PII_FIELDS.get(e.lower(), frozenset())
        module.is_pii_field = is_pii_field

        spec.loader.exec_module(module)

        return module.AuditService()

    @pytest.mark.asyncio
    async def test_gdpr_export_creates_audit_record(self, audit_service):
        """T050: GDPR export creates audit record.

        GDPR exports (Article 15 - Right to Access) MUST create
        an audit record with action='export' for compliance.
        """
        workspace_id = str(uuid4())
        user_id = str(uuid4())
        client_id = str(uuid4())

        mock_execute_query.return_value = {
            "audit_id": uuid4(),
            "workspace_id": workspace_id,
            "actor_user_id": user_id,
            "action": "export",
            "target_type": "client",
            "target_id": client_id,
        }

        result = await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="export",
            after={"export_type": "gdpr_article_15"},
            ip_address="127.0.0.1",
        )

        # Verify audit record was created
        assert mock_execute_query.called
        call_args = mock_execute_query.call_args
        # Check that the query includes the export action
        assert "INSERT INTO audit_logs" in call_args[0][0]
        assert call_args[0][4] == "export"  # action parameter

    @pytest.mark.asyncio
    async def test_access_action_type_is_valid(self, audit_service):
        """T055: 'access' action type is valid for PII field logging."""
        workspace_id = str(uuid4())
        user_id = str(uuid4())
        client_id = str(uuid4())

        mock_execute_query.return_value = {
            "audit_id": uuid4(),
            "workspace_id": workspace_id,
            "actor_user_id": user_id,
            "action": "access",
        }

        # 'access' action should be valid and not raise
        result = await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="access",
            after={"fields_accessed": ["email", "phone"]},
        )

        assert result is not None
        assert mock_execute_query.called

    @pytest.mark.asyncio
    async def test_invalid_action_raises_error(self, audit_service):
        """Test that invalid action types raise ValueError."""
        with pytest.raises(ValueError, match="Invalid action"):
            await audit_service.log_change(
                workspace_id=str(uuid4()),
                user_id=str(uuid4()),
                entity_type="client",
                entity_id=str(uuid4()),
                action="invalid_action",
            )


class TestPIIFieldLogging:
    """Test PII field access logging for SOC2 CC6.3."""

    @pytest.fixture
    def audit_service(self):
        """Create an AuditService instance with mocked dependencies."""
        mock_execute_query.reset_mock()
        mock_logger.reset_mock()

        import importlib.util
        import os

        service_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "src", "services", "audit_service.py"
        )
        service_path = os.path.normpath(service_path)

        spec = importlib.util.spec_from_file_location("audit_service_direct2", service_path)
        module = importlib.util.module_from_spec(spec)

        module.execute_query = mock_execute_query
        module.get_logger = mock_get_logger
        module.logger = mock_logger
        module.PII_FIELDS = PII_FIELDS
        module.get_pii_fields_for_entity = lambda e: PII_FIELDS.get(e.lower(), frozenset())
        module.is_pii_field = is_pii_field

        spec.loader.exec_module(module)

        return module.AuditService()

    @pytest.mark.asyncio
    async def test_pii_field_access_is_logged(self, audit_service):
        """T051: PII field access is logged.

        When a PII field (email, phone, etc.) is accessed, it MUST
        be logged for audit compliance.
        """
        workspace_id = str(uuid4())
        user_id = str(uuid4())
        client_id = str(uuid4())

        mock_execute_query.return_value = {
            "audit_id": uuid4(),
            "workspace_id": workspace_id,
            "actor_user_id": user_id,
            "action": "access",
            "target_type": "client",
            "target_id": client_id,
        }

        # Log PII field access - includes email (PII) and name (non-PII)
        result = await audit_service.log_pii_access(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            fields_accessed=["email", "phone", "name", "status"],
            ip_address="127.0.0.1",
        )

        # Verify the call was made
        assert mock_execute_query.called

        # The metadata should only include PII fields (email, phone)
        call_args = mock_execute_query.call_args
        metadata_json = call_args[0][9]  # metadata is the 9th parameter
        assert "email" in metadata_json
        assert "phone" in metadata_json
        # name is NOT a PII field for client entity
        # status is NOT a PII field

    @pytest.mark.asyncio
    async def test_no_pii_fields_skips_logging(self, audit_service):
        """Test that accessing non-PII fields doesn't create audit log."""
        workspace_id = str(uuid4())
        user_id = str(uuid4())
        client_id = str(uuid4())

        # Access only non-PII fields
        result = await audit_service.log_pii_access(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            fields_accessed=["name", "status", "created_at"],  # No PII fields
            ip_address="127.0.0.1",
        )

        # Should return None without calling execute_query
        assert result is None
        assert not mock_execute_query.called


class TestBulkOperationAuditLogging:
    """Test audit logging for bulk operations."""

    @pytest.fixture
    def audit_service(self):
        """Create an AuditService instance with mocked dependencies."""
        mock_execute_query.reset_mock()
        mock_logger.reset_mock()

        import importlib.util
        import os

        service_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "src", "services", "audit_service.py"
        )
        service_path = os.path.normpath(service_path)

        spec = importlib.util.spec_from_file_location("audit_service_direct3", service_path)
        module = importlib.util.module_from_spec(spec)

        module.execute_query = mock_execute_query
        module.get_logger = mock_get_logger
        module.logger = mock_logger
        module.PII_FIELDS = PII_FIELDS
        module.get_pii_fields_for_entity = lambda e: PII_FIELDS.get(e.lower(), frozenset())
        module.is_pii_field = is_pii_field

        spec.loader.exec_module(module)

        return module.AuditService()

    @pytest.mark.asyncio
    async def test_bulk_operation_logs_record_count(self, audit_service):
        """T052: Bulk operation logs record count.

        Bulk operations MUST log the number of records affected
        for audit compliance and security monitoring.
        """
        workspace_id = str(uuid4())
        user_id = str(uuid4())

        mock_execute_query.return_value = {
            "audit_id": uuid4(),
            "workspace_id": workspace_id,
            "actor_user_id": user_id,
            "action": "delete",
            "target_type": "client_bulk",
            "target_id": "bulk",
        }

        # Log bulk delete operation
        result = await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client_bulk",
            entity_id="bulk",
            action="delete",
            after={
                "record_count": 25,
                "client_ids": ["id1", "id2", "id3"],
                "operation": "bulk_delete",
            },
            ip_address="127.0.0.1",
        )

        # Verify metadata includes record count
        assert mock_execute_query.called
        call_args = mock_execute_query.call_args
        metadata_json = call_args[0][9]  # metadata parameter
        assert "record_count" in metadata_json
        assert "25" in metadata_json


class TestAuditLoggingResilience:
    """Test audit logging failure handling."""

    @pytest.fixture
    def audit_service(self):
        """Create an AuditService instance with mocked dependencies."""
        mock_execute_query.reset_mock()
        mock_logger.reset_mock()

        import importlib.util
        import os

        service_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "src", "services", "audit_service.py"
        )
        service_path = os.path.normpath(service_path)

        spec = importlib.util.spec_from_file_location("audit_service_direct4", service_path)
        module = importlib.util.module_from_spec(spec)

        module.execute_query = mock_execute_query
        module.get_logger = mock_get_logger
        module.logger = mock_logger
        module.PII_FIELDS = PII_FIELDS
        module.get_pii_fields_for_entity = lambda e: PII_FIELDS.get(e.lower(), frozenset())
        module.is_pii_field = is_pii_field

        spec.loader.exec_module(module)

        return module.AuditService()

    @pytest.mark.asyncio
    async def test_audit_failure_doesnt_fail_operation(self, audit_service):
        """T053: Audit failure doesn't fail operation (best effort).

        If audit logging fails (e.g., database error), the main
        operation MUST NOT fail. Audit logging is best-effort.

        SECURITY: Audit failures should be alerted/logged separately.
        """
        workspace_id = str(uuid4())
        user_id = str(uuid4())
        client_id = str(uuid4())

        # Simulate database failure
        mock_execute_query.side_effect = Exception("Database connection lost")

        # Use safe logging wrapper - should not raise
        result = await audit_service.log_change_safe(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="update",
            before={"name": "Old Name"},
            after={"name": "New Name"},
        )

        # Should return None on failure, not raise exception
        assert result is None

        # Reset side_effect for other tests
        mock_execute_query.side_effect = None

    @pytest.mark.asyncio
    async def test_audit_failure_is_logged_as_alert(self, audit_service):
        """Verify audit failures generate alerts for monitoring."""
        workspace_id = str(uuid4())
        user_id = str(uuid4())
        client_id = str(uuid4())

        mock_execute_query.side_effect = Exception("Database error")

        result = await audit_service.log_change_safe(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="update",
        )

        # Verify error was logged
        mock_logger.error.assert_called()
        call_args = mock_logger.error.call_args
        assert "AUDIT_FAILURE_ALERT" in call_args[0][0]

        # Reset side_effect for other tests
        mock_execute_query.side_effect = None
