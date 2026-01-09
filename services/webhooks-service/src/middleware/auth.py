"""
Authentication middleware for webhook service.
"""

import logging
from uuid import UUID
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from src.config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UUID:
    """
    Validate JWT token and return user ID.

    Raises HTTPException if token is invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )

        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID",
            )

        return UUID(user_id)

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def get_workspace_id(
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UUID:
    """
    Get workspace ID from header or JWT token.

    Priority:
    1. X-Workspace-ID header
    2. workspace_id claim in JWT
    """
    # #region agent log
    import json
    import os
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
            f.write(json.dumps({"id":"log_get_workspace_id_entry","timestamp":int(__import__("time").time()*1000),"location":"auth.py:62","message":"get_workspace_id called","data":{"has_header":x_workspace_id is not None,"has_credentials":credentials is not None},"sessionId":"debug-session","runId":"run1","hypothesisId":"C"})+"\n")
    except: pass
    # #endregion
    # Try header first
    if x_workspace_id:
        try:
            return UUID(x_workspace_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Workspace-ID header",
            )

    # Try JWT token
    if credentials:
        try:
            payload = jwt.decode(
                credentials.credentials,
                settings.JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
            )

            workspace_id = payload.get("workspace_id")
            if workspace_id:
                return UUID(workspace_id)

            # Try workspace_ids array (first one)
            workspace_ids = payload.get("workspace_ids", [])
            if workspace_ids:
                return UUID(workspace_ids[0])

        except (jwt.InvalidTokenError, ValueError):
            pass

    # #region agent log
    try:
        with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
            f.write(json.dumps({"id":"log_get_workspace_id_fail","timestamp":int(__import__("time").time()*1000),"location":"auth.py:104","message":"get_workspace_id failed - missing workspace ID","data":{},"sessionId":"debug-session","runId":"run1","hypothesisId":"C"})+"\n")
    except: pass
    # #endregion
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Missing workspace ID. Provide X-Workspace-ID header or workspace_id in token.",
    )


async def require_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UUID:
    """
    Require admin privileges.

    Checks for admin role or is_admin claim in token.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )

        # Check for admin privilege
        is_admin = payload.get("is_admin", False)
        roles = payload.get("roles", [])

        if is_admin or "admin" in roles or "platform_admin" in roles:
            user_id = payload.get("sub") or payload.get("user_id")
            return UUID(user_id) if user_id else UUID("00000000-0000-0000-0000-000000000000")

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )
