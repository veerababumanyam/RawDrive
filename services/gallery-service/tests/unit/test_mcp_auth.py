"""Unit tests for MCP authentication and authorization.

Tests cover:
- AuthContext validation
- Authentication context extraction
- Permission checking
- Workspace access validation
- Error handling
"""

import pytest
from uuid import UUID, uuid4

from src.services.mcp.auth import (
    AuthContext,
    MCPAuthError,
    MCPPermissionError,
    extract_auth_context,
    check_permission,
    check_workspace_access,
)


class TestAuthContext:
    """Test AuthContext model."""

    def test_valid_auth_context(self):
        """Test creating valid AuthContext."""
        user_id = uuid4()
        workspace_id = uuid4()

        auth = AuthContext(
            user_id=user_id,
            workspace_id=workspace_id,
            permissions=["galleries:read", "galleries:write"],
            email="test@example.com",
        )

        assert auth.user_id == user_id
        assert auth.workspace_id == workspace_id
        assert len(auth.permissions) == 2
        assert auth.email == "test@example.com"

    def test_auth_context_default_permissions(self):
        """Test AuthContext with default empty permissions."""
        auth = AuthContext(
            user_id=uuid4(),
            workspace_id=uuid4(),
        )

        assert auth.permissions == []
        assert auth.email is None


class TestExtractAuthContext:
    """Test extract_auth_context function."""

    def test_extract_valid_context(self):
        """Test extracting valid authentication context."""
        user_id = str(uuid4())
        workspace_id = str(uuid4())

        context = {
            "auth": {
                "user_id": user_id,
                "workspace_id": workspace_id,
                "permissions": ["galleries:read"],
                "email": "test@example.com",
            }
        }

        auth = extract_auth_context(context)

        assert isinstance(auth, AuthContext)
        assert str(auth.user_id) == user_id
        assert str(auth.workspace_id) == workspace_id
        assert "galleries:read" in auth.permissions
        assert auth.email == "test@example.com"

    def test_extract_minimal_context(self):
        """Test extracting minimal valid context (no permissions or email)."""
        user_id = str(uuid4())
        workspace_id = str(uuid4())

        context = {
            "auth": {
                "user_id": user_id,
                "workspace_id": workspace_id,
            }
        }

        auth = extract_auth_context(context)

        assert str(auth.user_id) == user_id
        assert str(auth.workspace_id) == workspace_id
        assert auth.permissions == []
        assert auth.email is None

    def test_missing_auth_key(self):
        """Test error when 'auth' key is missing."""
        context = {}

        with pytest.raises(MCPAuthError, match="Missing user_id"):
            extract_auth_context(context)

    def test_missing_user_id(self):
        """Test error when user_id is missing."""
        context = {
            "auth": {
                "workspace_id": str(uuid4()),
            }
        }

        with pytest.raises(MCPAuthError, match="Missing user_id"):
            extract_auth_context(context)

    def test_missing_workspace_id(self):
        """Test error when workspace_id is missing."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
            }
        }

        with pytest.raises(MCPAuthError, match="Missing workspace_id"):
            extract_auth_context(context)

    def test_invalid_user_id_uuid(self):
        """Test error when user_id is not a valid UUID."""
        context = {
            "auth": {
                "user_id": "not-a-uuid",
                "workspace_id": str(uuid4()),
            }
        }

        with pytest.raises(MCPAuthError, match="Invalid authentication context"):
            extract_auth_context(context)

    def test_invalid_workspace_id_uuid(self):
        """Test error when workspace_id is not a valid UUID."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
                "workspace_id": "not-a-uuid",
            }
        }

        with pytest.raises(MCPAuthError, match="Invalid authentication context"):
            extract_auth_context(context)

    def test_empty_auth_dict(self):
        """Test error with empty auth dictionary."""
        context = {"auth": {}}

        with pytest.raises(MCPAuthError, match="Missing user_id"):
            extract_auth_context(context)


class TestCheckPermission:
    """Test check_permission function."""

    def test_permission_granted(self):
        """Test permission check when user has required permission."""
        auth = AuthContext(
            user_id=uuid4(),
            workspace_id=uuid4(),
            permissions=["galleries:read", "galleries:write"],
        )

        # Should not raise exception
        check_permission(auth, "galleries:read")
        check_permission(auth, "galleries:write")

    def test_permission_denied(self):
        """Test permission check when user lacks required permission."""
        auth = AuthContext(
            user_id=uuid4(),
            workspace_id=uuid4(),
            permissions=["galleries:read"],
        )

        with pytest.raises(MCPPermissionError, match="Permission denied: galleries:write"):
            check_permission(auth, "galleries:write")

    def test_wildcard_permission(self):
        """Test wildcard permission grants all access."""
        auth = AuthContext(
            user_id=uuid4(),
            workspace_id=uuid4(),
            permissions=["*"],
        )

        # All permissions should be granted
        check_permission(auth, "galleries:read")
        check_permission(auth, "galleries:write")
        check_permission(auth, "galleries:delete")
        check_permission(auth, "galleries:share")
        check_permission(auth, "galleries:ai:read")
        check_permission(auth, "any:random:permission")

    def test_no_permissions(self):
        """Test permission check when user has no permissions."""
        auth = AuthContext(
            user_id=uuid4(),
            workspace_id=uuid4(),
            permissions=[],
        )

        with pytest.raises(MCPPermissionError, match="Permission denied"):
            check_permission(auth, "galleries:read")

    def test_permission_error_message(self):
        """Test permission error message includes available permissions."""
        auth = AuthContext(
            user_id=uuid4(),
            workspace_id=uuid4(),
            permissions=["galleries:read", "galleries:share"],
        )

        with pytest.raises(MCPPermissionError) as exc_info:
            check_permission(auth, "galleries:write")

        error_msg = str(exc_info.value)
        assert "galleries:write" in error_msg
        assert "galleries:read" in error_msg
        assert "galleries:share" in error_msg


class TestCheckWorkspaceAccess:
    """Test check_workspace_access function."""

    def test_workspace_match(self):
        """Test workspace access when IDs match."""
        workspace_id = uuid4()

        # Should not raise exception
        check_workspace_access(workspace_id, workspace_id)

    def test_workspace_mismatch(self):
        """Test workspace access when IDs don't match."""
        workspace_id_1 = uuid4()
        workspace_id_2 = uuid4()

        with pytest.raises(MCPPermissionError, match="different workspace"):
            check_workspace_access(workspace_id_1, workspace_id_2)

    def test_workspace_access_error_message(self):
        """Test workspace access error message."""
        workspace_id_1 = uuid4()
        workspace_id_2 = uuid4()

        with pytest.raises(MCPPermissionError) as exc_info:
            check_workspace_access(workspace_id_1, workspace_id_2)

        error_msg = str(exc_info.value)
        assert "Access denied" in error_msg
        assert "different workspace" in error_msg


class TestIntegration:
    """Integration tests combining multiple auth functions."""

    def test_full_auth_flow(self):
        """Test complete authentication flow."""
        user_id = str(uuid4())
        workspace_id = str(uuid4())

        # 1. Extract auth context
        context = {
            "auth": {
                "user_id": user_id,
                "workspace_id": workspace_id,
                "permissions": ["galleries:read", "galleries:write"],
            }
        }

        auth = extract_auth_context(context)

        # 2. Check permission
        check_permission(auth, "galleries:read")
        check_permission(auth, "galleries:write")

        # 3. Check workspace access
        check_workspace_access(auth.workspace_id, UUID(workspace_id))

    def test_full_auth_flow_permission_denied(self):
        """Test authentication flow with permission denial."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
                "workspace_id": str(uuid4()),
                "permissions": ["galleries:read"],
            }
        }

        auth = extract_auth_context(context)

        # Permission check should fail
        with pytest.raises(MCPPermissionError):
            check_permission(auth, "galleries:delete")

    def test_full_auth_flow_workspace_mismatch(self):
        """Test authentication flow with workspace mismatch."""
        context = {
            "auth": {
                "user_id": str(uuid4()),
                "workspace_id": str(uuid4()),
                "permissions": ["galleries:read"],
            }
        }

        auth = extract_auth_context(context)

        # Workspace check should fail
        different_workspace_id = uuid4()
        with pytest.raises(MCPPermissionError):
            check_workspace_access(auth.workspace_id, different_workspace_id)
