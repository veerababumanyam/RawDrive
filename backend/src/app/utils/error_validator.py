"""Tenant-safe error validator utility.

Ensures error responses do not leak information across tenants.
Requirements: 6.1, 6.2, 6.5
"""

from typing import Any, Dict, List, Optional, Union

class TenantSafeErrorValidator:
    """Validates error responses for tenant safety."""

    @staticmethod
    def validate_error_response(
        error_response: Dict[str, Any],
        workspace_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> bool:
        """Validate that error response is safe for the given tenant context.

        Checks for:
        - No cross-tenant data leakage
        - Appropriate error sanitization
        - Workspace isolation

        Args:
            error_response: The error response dict
            workspace_id: Current workspace ID
            user_id: Current user ID

        Returns:
            True if response is safe, False otherwise
        """
        # Check if error contains workspace-specific data that doesn't match current workspace
        if workspace_id:
            # Look for workspace_id in error details or message
            error_str = str(error_response).lower()
            if "workspace" in error_str and workspace_id not in error_str:
                # Potential cross-tenant leak - flag for review
                return False

        # Check for sensitive information patterns in the message only
        error_message = error_response.get("error", {}).get("message", "")
        sensitive_patterns = [
            "password",
            "token",
            "secret",
            "key",
            "stack trace",
            "traceback"
        ]

        error_content = error_message.lower()
        for pattern in sensitive_patterns:
            if pattern in error_content:
                return False

        return True

    @staticmethod
    def sanitize_error_details(details: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sanitize error details to remove sensitive information.

        Args:
            details: List of error detail dicts

        Returns:
            Sanitized details
        """
        sanitized = []
        for detail in details:
            sanitized_detail = {}
            for key, value in detail.items():
                # Remove sensitive keys
                if key.lower() not in ["password", "token", "secret", "internal"]:
                    sanitized_detail[key] = value
            sanitized.append(sanitized_detail)
        return sanitized