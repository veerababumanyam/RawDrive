"""JWT token validation utilities for billing service."""

import logging
from typing import Optional, Dict, Any

import jwt
from fastapi import HTTPException, status

from src.config import settings

logger = logging.getLogger(__name__)


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT token.

    Args:
        token: JWT token string

    Returns:
        Token payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


def extract_workspace_id(token: str) -> str:
    """Extract workspace_id from JWT token.

    Args:
        token: JWT token string

    Returns:
        workspace_id from token payload

    Raises:
        HTTPException: If workspace_id not in token
    """
    payload = decode_token(token)
    workspace_id = payload.get("workspace_id")

    if not workspace_id:
        logger.error("Token missing workspace_id")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing workspace_id"
        )

    return workspace_id


def extract_user_id(token: str) -> str:
    """Extract user_id from JWT token.

    Args:
        token: JWT token string

    Returns:
        user_id from token payload

    Raises:
        HTTPException: If user_id not in token
    """
    payload = decode_token(token)
    user_id = payload.get("user_id") or payload.get("sub")

    if not user_id:
        logger.error("Token missing user_id")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user_id"
        )

    return user_id


def extract_permissions(token: str) -> list[str]:
    """Extract permissions from JWT token.

    Args:
        token: JWT token string

    Returns:
        List of permission strings (e.g., ["billing:read", "billing:write"])
    """
    payload = decode_token(token)
    permissions = payload.get("permissions", [])

    if isinstance(permissions, list):
        return permissions

    logger.warning(f"Invalid permissions format in token: {type(permissions)}")
    return []
