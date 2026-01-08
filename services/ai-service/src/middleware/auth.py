"""Authentication middleware for AI Service.

Handles JWT verification and workspace context extraction.
Similar to gallery-service and upload-service patterns.
"""

import os
import logging
from typing import Optional, Dict, Any
from uuid import UUID
from fastapi import Request, HTTPException, Security, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from jose.exceptions import JWKError

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def get_jwt_secret() -> str:
    """Get JWT secret from environment.
    
    Security: In production, fails hard if JWT key is not properly configured.
    """
    app_env = os.getenv("APP_ENV", "production")
    
    # Try public key path first (EdDSA)
    public_key_path = os.getenv("JWT_PUBLIC_KEY_PATH")
    if public_key_path:
        if os.path.exists(public_key_path):
            with open(public_key_path, "r") as f:
                key_content = f.read().strip()
                if not key_content:
                    logger.error(f"JWT public key file is empty: {public_key_path}")
                    if app_env == "production":
                        raise ValueError("JWT public key file is empty - cannot start in production")
                else:
                    logger.info(f"Loaded JWT public key from {public_key_path}")
                    return key_content
        else:
            logger.error(f"JWT public key file not found: {public_key_path}")
            if app_env == "production":
                raise ValueError(f"JWT public key not found at {public_key_path} - cannot start in production")
    
    # Fallback to secret
    jwt_secret = os.getenv("JWT_SECRET", "")
    if not jwt_secret and app_env == "production":
        raise ValueError("JWT_SECRET not configured - cannot start in production")
    
    return jwt_secret


def get_jwt_algorithm() -> str:
    """Get JWT algorithm from environment."""
    return os.getenv("JWT_ALGORITHM", "EdDSA")


def get_jwt_issuer() -> str:
    """Get JWT issuer from environment."""
    return os.getenv("JWT_ISSUER", "rawdrive")


async def get_current_user(
    token: Optional[HTTPAuthorizationCredentials] = Security(security),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Extract and validate JWT token.
    
    Returns:
        Dict with user_id, workspace_id, and other JWT claims
        
    Raises:
        HTTPException 401: If token is missing or invalid
    """
    # Try Security dependency first, then Header
    token_str = None
    if token:
        token_str = token.credentials
    elif authorization and authorization.startswith("Bearer "):
        token_str = authorization[7:]
    
    if not token_str:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    try:
        jwt_secret = get_jwt_secret()
        jwt_algorithm = get_jwt_algorithm()
        jwt_issuer = get_jwt_issuer()
        
        # Try EdDSA verification first if public key is available
        if jwt_algorithm == "EdDSA" and jwt_secret:
            payload = jwt.decode(
                token_str,
                jwt_secret,
                algorithms=[jwt_algorithm],
                issuer=jwt_issuer,
            )
        else:
            # Fallback to HS256 with secret
            payload = jwt.decode(
                token_str,
                jwt_secret,
                algorithms=["HS256"],
                issuer=jwt_issuer,
            )
        
        # Normalize user_id
        if "sub" in payload:
            payload["user_id"] = payload["sub"]
            
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (JWTError, JWKError) as e:
        # In development, allow unverified decode for testing
        if os.getenv("APP_ENV", "production") == "development":
            try:
                payload = jwt.get_unverified_claims(token_str)
                logger.warning(
                    f"JWT signature verification failed, using unverified claims in dev mode: {e}"
                )
                if "sub" in payload:
                    payload["user_id"] = payload["sub"]
                return payload
            except Exception as ex:
                logger.error(f"Failed to decode token unverified: {ex}")
                raise HTTPException(status_code=401, detail="Invalid token")
        else:
            logger.warning(f"Invalid token: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


def get_workspace_id(request: Request) -> str:
    """Extract workspace ID from request path or header.
    
    Priority:
    1. Path parameter workspace_id
    2. Header X-Workspace-Id
    """
    # Try path params first
    if "workspace_id" in request.path_params:
        try:
            return str(UUID(request.path_params["workspace_id"]))
        except ValueError:
            pass
    
    # Try header
    header_val = request.headers.get("X-Workspace-Id")
    if header_val:
        try:
            return str(UUID(header_val))
        except ValueError:
            pass

    raise HTTPException(status_code=400, detail="Missing or invalid Workspace ID")
