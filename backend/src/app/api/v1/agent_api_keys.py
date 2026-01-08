"""Agent API Keys Management API.

Endpoints for creating, listing, and managing API keys for external agents.

Phase 4: Google A2A ADKS Integration
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep
from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/agent-api-keys", tags=["agent-api-keys"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CreateAgentAPIKeyRequest(BaseModel):
    """Request to create an agent API key."""

    key_name: str = Field(..., min_length=1, max_length=200, description="Human-readable name for the API key")
    scopes: list[str] = Field(..., min_items=1, description="Permission scopes for this key")
    rate_limit_rpm: int = Field(default=100, ge=1, le=10000, description="Requests per minute limit")
    expires_days: int | None = Field(default=None, ge=1, le=365, description="Expiration in days (null = never)")
    description: str | None = Field(default=None, max_length=1000, description="Optional description")


class AgentAPIKeyResponse(BaseModel):
    """Response containing agent API key details."""

    key_id: uuid.UUID
    workspace_id: uuid.UUID
    key_name: str
    api_key: str | None = None  # Only returned on creation
    scopes: list[str]
    rate_limit_rpm: int
    is_active: bool
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None
    description: str | None


class AgentAPIKeyListItem(BaseModel):
    """List item for agent API keys (without actual key value)."""

    key_id: uuid.UUID
    workspace_id: uuid.UUID
    key_name: str
    scopes: list[str]
    rate_limit_rpm: int
    is_active: bool
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None
    description: str | None


class AgentAPIKeysListResponse(BaseModel):
    """Response for listing agent API keys."""

    keys: list[AgentAPIKeyListItem]
    total: int


# ---------------------------------------------------------------------------
# Available Scopes
# ---------------------------------------------------------------------------

AVAILABLE_SCOPES = {
    "galleries:read": "List and view galleries",
    "galleries:write": "Create and modify galleries",
    "photos:read": "List and view photos",
    "photos:write": "Upload photos",
    "ai:analyze": "AI analysis (emotion, quality scoring)",
    "ai:duplicate": "Duplicate detection",
    "ai:video": "Video highlights",
    "ai:curate": "Smart curation",
    "clients:read": "List and view clients",
    "clients:write": "Create and modify clients",
}


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def generate_api_key(workspace_id: uuid.UUID) -> tuple[str, str]:
    """Generate API key and its hash.

    Format: rawdrive_sk_<workspace_id>_<random_32_chars>

    Returns:
        Tuple of (api_key, key_hash)
    """
    random_suffix = secrets.token_urlsafe(24)  # 32 characters base64url
    api_key = f"rawdrive_sk_{workspace_id}_{random_suffix}"

    # Hash the API key with SHA-256
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    return api_key, key_hash


def validate_scopes(scopes: list[str]) -> None:
    """Validate that all scopes are valid.

    Raises:
        HTTPException: If any scope is invalid
    """
    invalid_scopes = [s for s in scopes if s not in AVAILABLE_SCOPES]
    if invalid_scopes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scopes: {invalid_scopes}. Available: {list(AVAILABLE_SCOPES.keys())}",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=AgentAPIKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_api_key(
    workspace_id: uuid.UUID,
    request: CreateAgentAPIKeyRequest,
    user: CurrentUserDep,
) -> AgentAPIKeyResponse:
    """Create a new agent API key.

    The API key is only returned once during creation. Store it securely.

    Required permissions: api_keys:write
    """
    # Validate scopes
    validate_scopes(request.scopes)

    # Check if user has access to workspace
    pool = await get_postgres_pool()
    membership = await pool.fetchrow(
        """
        SELECT membership_id FROM workspace_memberships
        WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
        """,
        user.user_id,
        workspace_id,
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    # Generate API key
    api_key, key_hash = generate_api_key(workspace_id)

    # Calculate expiration
    expires_at = None
    if request.expires_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=request.expires_days)

    # Insert into database
    key_id = uuid.uuid4()
    await pool.execute(
        """
        INSERT INTO agent_api_keys (
            key_id, workspace_id, key_name, key_hash, scopes,
            rate_limit_rpm, created_by_user_id, expires_at, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
        key_id,
        workspace_id,
        request.key_name,
        key_hash,
        request.scopes,
        request.rate_limit_rpm,
        user.user_id,
        expires_at,
        request.description,
    )

    logger.info(
        "Agent API key created",
        extra={
            "key_id": str(key_id),
            "workspace_id": str(workspace_id),
            "user_id": str(user.user_id),
            "scopes": request.scopes,
        },
    )

    return AgentAPIKeyResponse(
        key_id=key_id,
        workspace_id=workspace_id,
        key_name=request.key_name,
        api_key=api_key,  # Only returned on creation
        scopes=request.scopes,
        rate_limit_rpm=request.rate_limit_rpm,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        expires_at=expires_at,
        last_used_at=None,
        description=request.description,
    )


@router.get("", response_model=AgentAPIKeysListResponse)
async def list_agent_api_keys(
    workspace_id: uuid.UUID,
    user: CurrentUserDep,
    include_inactive: bool = False,
) -> AgentAPIKeysListResponse:
    """List all agent API keys for a workspace.

    Required permissions: api_keys:read
    """
    # Check if user has access to workspace
    pool = await get_postgres_pool()
    membership = await pool.fetchrow(
        """
        SELECT membership_id FROM workspace_memberships
        WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
        """,
        user.user_id,
        workspace_id,
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    # Query API keys
    query = """
        SELECT
            key_id,
            workspace_id,
            key_name,
            scopes,
            rate_limit_rpm,
            is_active,
            created_at,
            expires_at,
            last_used_at,
            description
        FROM agent_api_keys
        WHERE workspace_id = $1
    """

    if not include_inactive:
        query += " AND is_active = TRUE"

    query += " ORDER BY created_at DESC"

    rows = await pool.fetch(query, workspace_id)

    keys = [
        AgentAPIKeyListItem(
            key_id=row["key_id"],
            workspace_id=row["workspace_id"],
            key_name=row["key_name"],
            scopes=row["scopes"],
            rate_limit_rpm=row["rate_limit_rpm"],
            is_active=row["is_active"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            last_used_at=row["last_used_at"],
            description=row["description"],
        )
        for row in rows
    ]

    return AgentAPIKeysListResponse(keys=keys, total=len(keys))


@router.get("/{key_id}", response_model=AgentAPIKeyListItem)
async def get_agent_api_key(
    workspace_id: uuid.UUID,
    key_id: uuid.UUID,
    user: CurrentUserDep,
) -> AgentAPIKeyListItem:
    """Get details of a specific agent API key.

    Note: The actual API key value is NOT returned for security.

    Required permissions: api_keys:read
    """
    # Check if user has access to workspace
    pool = await get_postgres_pool()
    membership = await pool.fetchrow(
        """
        SELECT membership_id FROM workspace_memberships
        WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
        """,
        user.user_id,
        workspace_id,
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    # Query API key
    row = await pool.fetchrow(
        """
        SELECT
            key_id,
            workspace_id,
            key_name,
            scopes,
            rate_limit_rpm,
            is_active,
            created_at,
            expires_at,
            last_used_at,
            description
        FROM agent_api_keys
        WHERE key_id = $1 AND workspace_id = $2
        """,
        key_id,
        workspace_id,
    )

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    return AgentAPIKeyListItem(
        key_id=row["key_id"],
        workspace_id=row["workspace_id"],
        key_name=row["key_name"],
        scopes=row["scopes"],
        rate_limit_rpm=row["rate_limit_rpm"],
        is_active=row["is_active"],
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        last_used_at=row["last_used_at"],
        description=row["description"],
    )


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_api_key(
    workspace_id: uuid.UUID,
    key_id: uuid.UUID,
    user: CurrentUserDep,
) -> None:
    """Delete (revoke) an agent API key.

    This permanently deactivates the key.

    Required permissions: api_keys:write
    """
    # Check if user has access to workspace
    pool = await get_postgres_pool()
    membership = await pool.fetchrow(
        """
        SELECT membership_id FROM workspace_memberships
        WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
        """,
        user.user_id,
        workspace_id,
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    # Deactivate the API key (soft delete)
    result = await pool.execute(
        """
        UPDATE agent_api_keys
        SET is_active = FALSE
        WHERE key_id = $1 AND workspace_id = $2
        """,
        key_id,
        workspace_id,
    )

    if result == "UPDATE 0":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    logger.info(
        "Agent API key deleted",
        extra={
            "key_id": str(key_id),
            "workspace_id": str(workspace_id),
            "user_id": str(user.user_id),
        },
    )


@router.get("/scopes/available", response_model=dict[str, str])
async def get_available_scopes() -> dict[str, str]:
    """Get list of available permission scopes for agent API keys.

    Public endpoint - no authentication required.
    """
    return AVAILABLE_SCOPES
