"""Authentication and authorization helpers for MCP tools.

Provides context extraction, permission checking, and workspace validation
for MCP tool calls.
"""

from typing import Any
from uuid import UUID
from pydantic import BaseModel


class AuthContext(BaseModel):
    """Authentication context extracted from MCP call."""

    user_id: UUID
    workspace_id: UUID
    permissions: list[str] = []
    email: str | None = None


class MCPAuthError(Exception):
    """Raised when MCP authentication fails."""

    pass


class MCPPermissionError(Exception):
    """Raised when MCP permission check fails."""

    pass


def extract_auth_context(context: dict[str, Any]) -> AuthContext:
    """Extract and validate authentication context from MCP call.

    Args:
        context: MCP call context containing auth information

    Returns:
        AuthContext: Validated authentication context

    Raises:
        MCPAuthError: If authentication context is invalid or missing

    Example:
        >>> context = {"auth": {"user_id": "...", "workspace_id": "..."}}
        >>> auth = extract_auth_context(context)
        >>> print(auth.workspace_id)
    """
    auth_data = context.get("auth", {})

    if not auth_data.get("user_id"):
        raise MCPAuthError("Missing user_id in authentication context")

    if not auth_data.get("workspace_id"):
        raise MCPAuthError("Missing workspace_id in authentication context")

    try:
        return AuthContext(
            user_id=UUID(auth_data["user_id"]),
            workspace_id=UUID(auth_data["workspace_id"]),
            permissions=auth_data.get("permissions", []),
            email=auth_data.get("email"),
        )
    except (ValueError, KeyError) as e:
        raise MCPAuthError(f"Invalid authentication context: {str(e)}") from e


def check_permission(auth: AuthContext, required: str) -> None:
    """Check if authenticated user has required permission.

    Args:
        auth: Authentication context
        required: Required permission (e.g., "galleries:read")

    Raises:
        MCPPermissionError: If user lacks the required permission

    Example:
        >>> auth = AuthContext(...)
        >>> check_permission(auth, "galleries:read")
    """
    # Wildcard permission grants all access
    if "*" in auth.permissions:
        return

    # Check for exact permission match
    if required not in auth.permissions:
        raise MCPPermissionError(
            f"Permission denied: {required} (user has: {', '.join(auth.permissions)})"
        )


def check_workspace_access(workspace_id: UUID, resource_workspace_id: UUID) -> None:
    """Verify resource belongs to the authenticated workspace.

    Args:
        workspace_id: Authenticated workspace ID
        resource_workspace_id: Resource's workspace ID

    Raises:
        MCPPermissionError: If workspace IDs don't match

    Example:
        >>> check_workspace_access(auth.workspace_id, gallery.workspace_id)
    """
    if workspace_id != resource_workspace_id:
        raise MCPPermissionError(
            "Access denied: Resource belongs to a different workspace"
        )
