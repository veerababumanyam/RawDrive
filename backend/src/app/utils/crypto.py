"""Cryptographic utilities for RawDrive.

Provides consistent hashing functions used across authentication and session services.
This module ensures that hash functions are centralized and consistent.
"""

import hashlib


def hash_token(token: str) -> str:
    """SHA-256 hash of token for storage.

    Used by both AuthService and SessionService to ensure hash consistency.

    Args:
        token: The refresh token to hash

    Returns:
        SHA-256 hex digest of the token
    """
    return hashlib.sha256(token.encode()).hexdigest()
