"""
Security utilities for password hashing, validation, and error sanitization.
"""

import re
from uuid import UUID
from typing import Any
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# Maximum sizes for nested arrays in batch operations
MAX_ASSETS_PER_OPERATION = 500
MAX_GALLERIES_PER_BATCH = 1000
MAX_OPERATIONS_PER_BATCH = 1000


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


def sanitize_error_message(error: Exception, default_message: str = "Operation failed") -> str:
    """Sanitize exception messages to prevent information leakage.

    Removes:
    - Database connection strings
    - File paths
    - Internal variable names
    - Stack traces
    - SQL queries

    Args:
        error: The exception to sanitize
        default_message: Default message if error is too sensitive

    Returns:
        Sanitized error message safe for external exposure
    """
    error_str = str(error)

    # Patterns that indicate sensitive information
    sensitive_patterns = [
        r'postgresql://[^\s]+',  # Database URLs
        r'postgres://[^\s]+',
        r'/[a-zA-Z0-9_\-./]+\.py',  # File paths
        r'[A-Z]:\\[^\s]+',  # Windows paths
        r'Traceback.*',  # Stack traces
        r'File ".*?"',
        r'SELECT.*FROM',  # SQL queries
        r'INSERT.*INTO',
        r'UPDATE.*SET',
        r'DELETE.*FROM',
        r'password["\s]*[:=]["\s]*[^\s]+',  # Passwords
        r'secret["\s]*[:=]["\s]*[^\s]+',  # Secrets
        r'api[_-]?key["\s]*[:=]["\s]*[^\s]+',  # API keys
    ]

    # Check if error contains sensitive information
    for pattern in sensitive_patterns:
        if re.search(pattern, error_str, re.IGNORECASE):
            return default_message

    # Known safe error types - preserve message
    safe_error_types = [
        'ValueError',
        'KeyError',
        'TypeError',
        'NotFoundError',
        'ValidationError',
        'PermissionError',
    ]

    error_type = type(error).__name__
    if any(safe_type in error_type for safe_type in safe_error_types):
        # Still check length to avoid verbose internal messages
        if len(error_str) > 200:
            return default_message
        return error_str

    # For other errors, use generic message
    return default_message


def validate_uuid_safe(value: Any, field_name: str = "id") -> UUID:
    """Validate UUID with user-friendly error messages.

    Args:
        value: Value to validate as UUID
        field_name: Field name for error message

    Returns:
        Validated UUID object

    Raises:
        ValueError: If UUID is invalid (with sanitized message)
    """
    if value is None:
        raise ValueError(f"{field_name} is required")

    if isinstance(value, UUID):
        return value

    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise ValueError(f"Invalid {field_name} format")


def validate_array_size(
    array: list,
    max_size: int,
    field_name: str = "array"
) -> None:
    """Validate array size to prevent resource exhaustion.

    Args:
        array: Array to validate
        max_size: Maximum allowed size
        field_name: Field name for error message

    Raises:
        ValueError: If array exceeds maximum size
    """
    if not isinstance(array, list):
        raise ValueError(f"{field_name} must be a list")

    if len(array) > max_size:
        raise ValueError(
            f"{field_name} size ({len(array)}) exceeds maximum ({max_size})"
        )


def validate_asset_ids(asset_ids: list[str]) -> list[UUID]:
    """Validate and convert asset IDs to UUIDs.

    Args:
        asset_ids: List of asset ID strings

    Returns:
        List of validated UUID objects

    Raises:
        ValueError: If validation fails (with sanitized message)
    """
    if not asset_ids:
        raise ValueError("asset_ids cannot be empty")

    # Check array size
    validate_array_size(asset_ids, MAX_ASSETS_PER_OPERATION, "asset_ids")

    # Validate each UUID
    validated_ids = []
    for idx, asset_id in enumerate(asset_ids):
        try:
            validated_ids.append(validate_uuid_safe(asset_id, f"asset_ids[{idx}]"))
        except ValueError:
            # Don't expose index in production
            raise ValueError("Invalid asset ID format in request")

    return validated_ids


def validate_gallery_ids(gallery_ids: list[str]) -> list[UUID]:
    """Validate and convert gallery IDs to UUIDs.

    Args:
        gallery_ids: List of gallery ID strings

    Returns:
        List of validated UUID objects

    Raises:
        ValueError: If validation fails (with sanitized message)
    """
    if not gallery_ids:
        raise ValueError("gallery_ids cannot be empty")

    # Check array size
    validate_array_size(gallery_ids, MAX_GALLERIES_PER_BATCH, "gallery_ids")

    # Validate each UUID
    validated_ids = []
    for gallery_id in gallery_ids:
        try:
            validated_ids.append(validate_uuid_safe(gallery_id, "gallery_id"))
        except ValueError:
            raise ValueError("Invalid gallery ID format in request")

    return validated_ids
