"""Authentication middleware for Gallery Service.

Handles JWT verification and workspace context extraction.
"""

from typing import Optional, Dict, Any
from uuid import UUID
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from src.config import settings
from src.log_config import get_logger

logger = get_logger(__name__)
security = HTTPBearer(auto_error=False)

# Type alias for JWT payload (backwards compatibility)
JWTPayload = Dict[str, Any]

# Load JWT public key for EdDSA verification
_jwt_public_key: Optional[str] = None

def get_jwt_verification_key() -> str:
    """Get the key used to verify JWT tokens.

    For EdDSA algorithm, reads the public key from file.
    For HS256, uses the JWT_SECRET.
    """
    global _jwt_public_key

    if settings.JWT_ALGORITHM == "EdDSA":
        if _jwt_public_key is None:
            if settings.JWT_PUBLIC_KEY_PATH:
                try:
                    with open(settings.JWT_PUBLIC_KEY_PATH, "r") as f:
                        _jwt_public_key = f.read().strip()
                    logger.info(f"Loaded JWT public key from {settings.JWT_PUBLIC_KEY_PATH}")
                except FileNotFoundError:
                    logger.error(f"JWT public key not found at {settings.JWT_PUBLIC_KEY_PATH}")
                    raise RuntimeError(f"JWT public key not found at {settings.JWT_PUBLIC_KEY_PATH}")
                except Exception as e:
                    logger.error(f"Error reading JWT public key: {e}")
                    raise
            else:
                logger.error("JWT_PUBLIC_KEY_PATH not configured for EdDSA")
                raise RuntimeError("JWT_PUBLIC_KEY_PATH must be configured when using EdDSA algorithm")
        return _jwt_public_key
    else:
        # For HS256 and other symmetric algorithms, use the secret
        return settings.JWT_SECRET


def get_workspace_id(request: Request) -> str:
    """Extract workspace ID from request path or header.
    
    Priority:
    1. Header X-Workspace-Id
    2. Path parameter workspace_id
    """
    # Try header first (simpler for API gateways)
    header_val = request.headers.get("X-Workspace-Id")
    if header_val:
        try:
            # Validate UUID format
            val = str(UUID(header_val))
            return val
        except ValueError:
            pass # Invalid format, try other methods

    # Try path params
    # Note: request.path_params might be empty if used in middleware before routing
    # But as a Dependency it works.
    if "workspace_id" in request.path_params:
        try:
             return str(UUID(request.path_params["workspace_id"]))
        except ValueError:
             pass

    # If I am here, maybe query param?
    query_val = request.query_params.get("workspace_id")
    if query_val:
        try:
            return str(UUID(query_val))
        except ValueError:
            pass

    # If we are in dev mode and fail, maybe return a default?
    # No, security first.
    raise HTTPException(status_code=400, detail="Missing or invalid Workspace ID")


async def get_current_user(
    token: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Dict[str, Any]:
    """Verify JWT token and return user payload."""
    if not token and settings.DEBUG:
         # Dev backdoor if needed, but better to enforce auth
         pass

    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    try:
        # Get the appropriate verification key (public key for EdDSA, secret for HS256)
        verification_key = get_jwt_verification_key()

        payload = jwt.decode(
            token.credentials,
            verification_key,
            algorithms=[settings.JWT_ALGORITHM]
        )

        # Normalize user_id
        if "sub" in payload:
            payload["user_id"] = payload["sub"]

        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


def verify_jwt_token(token: str) -> Dict[str, Any]:
    """Verify JWT token from query parameter (for WebSocket).

    Args:
        token: JWT token string

    Returns:
        Dict containing decoded JWT payload

    Raises:
        HTTPException: If token is invalid, expired, or missing
    """
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    try:
        # Get the appropriate verification key (public key for EdDSA, secret for HS256)
        verification_key = get_jwt_verification_key()

        payload = jwt.decode(
            token,
            verification_key,
            algorithms=[settings.JWT_ALGORITHM]
        )

        # Normalize user_id
        if "sub" in payload:
            payload["user_id"] = payload["sub"]

        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")
