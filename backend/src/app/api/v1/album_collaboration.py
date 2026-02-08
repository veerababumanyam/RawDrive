"""Album Collaboration API Endpoints.

Provides REST API endpoints for collaborative album design editing,
including session management, operations, version history, templates,
and commenting with @mentions.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user as _get_raw_user, CurrentUser, get_workspace_id_from_access
from app.api.dependencies.db import get_db
from app.db.redis import get_redis_client
from app.models.user import User
from app.services.album_collaboration_service import (
    AlbumCollaborationService,
    AlbumOperationType,
    get_album_collaboration_service,
)


async def get_current_user(
    user: Annotated[CurrentUser, Depends(_get_raw_user)],
    workspace_id: Annotated[UUID, Depends(get_workspace_id_from_access)],
) -> Any:
    """Compatibility dependency to inject active_workspace_id."""
    user.active_workspace_id = workspace_id # type: ignore
    return user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/albums", tags=["album-collaboration"])


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------

class PageSize(BaseModel):
    width: float = Field(default=12, ge=4, le=24)
    height: float = Field(default=12, ge=4, le=24)
    unit: str = Field(default="inch", pattern="^(inch|cm|mm)$")


class CreateAlbumRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    gallery_id: UUID | None = None
    template_id: UUID | None = None
    album_type: str = Field(default="wedding", pattern="^(wedding|portrait|event|family|newborn|boudoir|commercial|custom)$")
    page_size: PageSize = Field(default_factory=PageSize)


class UpdateAlbumRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(draft|in_review|approved|ordered|archived)$")
    design_config: dict[str, Any] | None = None
    cover_config: dict[str, Any] | None = None


class CreateSpreadRequest(BaseModel):
    spread_type: str = Field(default="double", pattern="^(cover_front|cover_back|single|double|foldout)$")
    layout_template_id: str | None = None
    layout_config: dict[str, Any] = Field(default_factory=dict)
    background_config: dict[str, Any] = Field(default_factory=lambda: {"type": "color", "value": "#ffffff"})
    position: int | None = None


class UpdateSpreadRequest(BaseModel):
    layout_template_id: str | None = None
    layout_config: dict[str, Any] | None = None
    background_config: dict[str, Any] | None = None


class ReorderSpreadsRequest(BaseModel):
    spread_ids: list[UUID]


class ElementPosition(BaseModel):
    x: float = 0
    y: float = 0
    width: float = 100
    height: float = 100
    rotation: float = 0
    z_index: int = 0


class CreateElementRequest(BaseModel):
    spread_id: UUID
    element_type: str = Field(..., pattern="^(photo|text|shape|frame|decoration|qr_code|page_number)$")
    asset_id: UUID | None = None
    position: ElementPosition = Field(default_factory=ElementPosition)
    content: dict[str, Any] = Field(default_factory=dict)
    style: dict[str, Any] = Field(default_factory=dict)
    effects: list[dict[str, Any]] = Field(default_factory=list)
    crop_config: dict[str, Any] = Field(default_factory=lambda: {"x": 0, "y": 0, "width": 100, "height": 100})


class UpdateElementRequest(BaseModel):
    position: ElementPosition | None = None
    content: dict[str, Any] | None = None
    style: dict[str, Any] | None = None
    effects: list[dict[str, Any]] | None = None
    crop_config: dict[str, Any] | None = None


class CreateCommentRequest(BaseModel):
    spread_id: UUID | None = None
    element_id: UUID | None = None
    parent_comment_id: UUID | None = None
    content: str = Field(..., min_length=1, max_length=5000)
    mentions: list[UUID] = Field(default_factory=list)
    position: dict[str, Any] | None = None


class ResolveCommentRequest(BaseModel):
    comment_ids: list[UUID]


class CollaborativeOperationRequest(BaseModel):
    operation_type: str
    target_type: str = Field(..., pattern="^(album|spread|element|comment)$")
    target_id: UUID
    payload: dict[str, Any]
    vector_clock: dict[str, int] = Field(default_factory=dict)


class RollbackRequest(BaseModel):
    version_number: int = Field(..., ge=1)


# ---------------------------------------------------------------------------
# Album CRUD Endpoints
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_album(
    request: CreateAlbumRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Create a new album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    album_id = uuid4()

    # If template is provided, get template settings
    template_settings = {}
    if request.template_id:
        result = await db.execute(
            text("""
                SELECT page_size, default_spread_layout, color_palette, typography
                FROM album_templates
                WHERE template_id = :template_id AND (workspace_id = :workspace_id OR is_system = TRUE)
            """),
            {"template_id": str(request.template_id), "workspace_id": str(workspace_id)},
        )
        row = result.fetchone()
        if row:
            template_settings = {
                "page_size": row[0],
                "default_spread_layout": row[1],
                "color_palette": row[2],
                "typography": row[3],
            }

    page_size = template_settings.get("page_size") or request.page_size.model_dump()

    result = await db.execute(
        text("""
            INSERT INTO albums
            (album_id, workspace_id, gallery_id, template_id, title, description,
             album_type, status, page_size, design_config, created_by)
            VALUES (:album_id, :workspace_id, :gallery_id, :template_id, :title, :description,
                    :album_type, 'draft', :page_size, :design_config, :created_by)
            RETURNING album_id, created_at
        """),
        {
            "album_id": str(album_id),
            "workspace_id": str(workspace_id),
            "gallery_id": str(request.gallery_id) if request.gallery_id else None,
            "template_id": str(request.template_id) if request.template_id else None,
            "title": request.title,
            "description": request.description,
            "album_type": request.album_type,
            "page_size": json.dumps(page_size),
            "design_config": json.dumps(template_settings.get("typography", {})),
            "created_by": str(current_user.user_id),
        },
    )
    await db.commit()

    # Create initial spreads (cover + first spread)
    for idx, spread_type in enumerate(["cover_front", "double"]):
        await db.execute(
            text("""
                INSERT INTO album_spreads
                (album_id, workspace_id, spread_number, spread_type, layout_config, background_config)
                VALUES (:album_id, :workspace_id, :spread_number, :spread_type, :layout_config, :background_config)
            """),
            {
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "spread_number": idx + 1,
                "spread_type": spread_type,
                "layout_config": json.dumps(template_settings.get("default_spread_layout", {})),
                "background_config": json.dumps({"type": "color", "value": "#ffffff"}),
            },
        )
    await db.commit()

    # Create initial version
    service = get_album_collaboration_service(db)
    await service.create_version_snapshot(
        album_id=album_id,
        workspace_id=workspace_id,
        user_id=current_user.user_id,
        change_type="create",
        change_summary="Album created",
    )

    return {
        "album_id": str(album_id),
        "title": request.title,
        "album_type": request.album_type,
        "status": "draft",
        "page_size": page_size,
    }


@router.get("")
async def list_albums(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status: str | None = Query(None, pattern="^(draft|in_review|approved|ordered|archived)$"),
    album_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """List albums for the workspace."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    conditions = ["workspace_id = :workspace_id"]
    params: dict[str, Any] = {"workspace_id": str(workspace_id), "limit": limit, "offset": offset}

    if status:
        conditions.append("status = :status")
        params["status"] = status

    if album_type:
        conditions.append("album_type = :album_type")
        params["album_type"] = album_type

    where_clause = " AND ".join(conditions)

    result = await db.execute(
        text(f"""
            SELECT album_id, title, description, album_type, status,
                   page_count, created_at, updated_at
            FROM albums
            WHERE {where_clause}
            ORDER BY updated_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )

    albums = [
        {
            "album_id": str(row[0]),
            "title": row[1],
            "description": row[2],
            "album_type": row[3],
            "status": row[4],
            "page_count": row[5],
            "created_at": row[6].isoformat() if row[6] else None,
            "updated_at": row[7].isoformat() if row[7] else None,
        }
        for row in result.fetchall()
    ]

    # Get total count
    result = await db.execute(
        text(f"SELECT COUNT(*) FROM albums WHERE {where_clause}"),
        params,
    )
    total = result.fetchone()[0]

    return {
        "albums": albums,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{album_id}")
async def get_album(
    album_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Get album with all spreads and elements."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    # Get album
    result = await db.execute(
        text("""
            SELECT a.album_id, a.title, a.description, a.album_type, a.status,
                   a.page_size, a.page_count, a.cover_config, a.spine_config,
                   a.design_config, a.current_version, a.created_at, a.updated_at,
                   t.name as template_name
            FROM albums a
            LEFT JOIN album_templates t ON a.template_id = t.template_id
            WHERE a.album_id = :album_id AND a.workspace_id = :workspace_id
        """),
        {"album_id": str(album_id), "workspace_id": str(workspace_id)},
    )
    album_row = result.fetchone()

    if not album_row:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get spreads
    result = await db.execute(
        text("""
            SELECT spread_id, spread_number, spread_type, layout_template_id,
                   layout_config, background_config, is_locked
            FROM album_spreads
            WHERE album_id = :album_id
            ORDER BY spread_number
        """),
        {"album_id": str(album_id)},
    )
    spreads = []
    spread_ids = []
    for row in result.fetchall():
        spread_ids.append(str(row[0]))
        spreads.append({
            "spread_id": str(row[0]),
            "spread_number": row[1],
            "spread_type": row[2],
            "layout_template_id": row[3],
            "layout_config": row[4],
            "background_config": row[5],
            "is_locked": row[6],
            "elements": [],
        })

    # Get elements for all spreads
    if spread_ids:
        result = await db.execute(
            text("""
                SELECT element_id, spread_id, element_type, asset_id,
                       position, content, style, effects, crop_config,
                       is_locked, is_visible, layer_name, group_id
                FROM album_spread_elements
                WHERE album_id = :album_id
                ORDER BY (position->>'z_index')::int
            """),
            {"album_id": str(album_id)},
        )

        elements_by_spread: dict[str, list] = {sid: [] for sid in spread_ids}
        for row in result.fetchall():
            spread_id = str(row[1])
            if spread_id in elements_by_spread:
                elements_by_spread[spread_id].append({
                    "element_id": str(row[0]),
                    "element_type": row[2],
                    "asset_id": str(row[3]) if row[3] else None,
                    "position": row[4],
                    "content": row[5],
                    "style": row[6],
                    "effects": row[7],
                    "crop_config": row[8],
                    "is_locked": row[9],
                    "is_visible": row[10],
                    "layer_name": row[11],
                    "group_id": str(row[12]) if row[12] else None,
                })

        for spread in spreads:
            spread["elements"] = elements_by_spread.get(spread["spread_id"], [])

    return {
        "album_id": str(album_row[0]),
        "title": album_row[1],
        "description": album_row[2],
        "album_type": album_row[3],
        "status": album_row[4],
        "page_size": album_row[5],
        "page_count": album_row[6],
        "cover_config": album_row[7],
        "spine_config": album_row[8],
        "design_config": album_row[9],
        "current_version": album_row[10],
        "template_name": album_row[13],
        "spreads": spreads,
        "created_at": album_row[11].isoformat() if album_row[11] else None,
        "updated_at": album_row[12].isoformat() if album_row[12] else None,
    }


@router.patch("/{album_id}")
async def update_album(
    album_id: UUID,
    request: UpdateAlbumRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Update album details."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    updates = ["last_edited_by = :user_id", "last_edited_at = NOW()", "updated_at = NOW()"]
    params: dict[str, Any] = {
        "album_id": str(album_id),
        "workspace_id": str(workspace_id),
        "user_id": str(current_user.user_id),
    }

    if request.title is not None:
        updates.append("title = :title")
        params["title"] = request.title
    if request.description is not None:
        updates.append("description = :description")
        params["description"] = request.description
    if request.status is not None:
        updates.append("status = :status")
        params["status"] = request.status
    if request.design_config is not None:
        updates.append("design_config = :design_config")
        params["design_config"] = json.dumps(request.design_config)
    if request.cover_config is not None:
        updates.append("cover_config = :cover_config")
        params["cover_config"] = json.dumps(request.cover_config)

    result = await db.execute(
        text(f"""
            UPDATE albums
            SET {", ".join(updates)}
            WHERE album_id = :album_id AND workspace_id = :workspace_id
            RETURNING album_id, title, status, updated_at
        """),
        params,
    )
    row = result.fetchone()
    await db.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Album not found")

    return {
        "album_id": str(row[0]),
        "title": row[1],
        "status": row[2],
        "updated_at": row[3].isoformat() if row[3] else None,
    }


@router.delete("/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_album(
    album_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Delete an album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    result = await db.execute(
        text("""
            DELETE FROM albums
            WHERE album_id = :album_id AND workspace_id = :workspace_id
            RETURNING album_id
        """),
        {"album_id": str(album_id), "workspace_id": str(workspace_id)},
    )
    row = result.fetchone()
    await db.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Album not found")


# ---------------------------------------------------------------------------
# Spread Endpoints
# ---------------------------------------------------------------------------

@router.post("/{album_id}/spreads", status_code=status.HTTP_201_CREATED)
async def create_spread(
    album_id: UUID,
    request: CreateSpreadRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Create a new spread in the album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    # Get max spread number
    result = await db.execute(
        text("""
            SELECT COALESCE(MAX(spread_number), 0) + 1
            FROM album_spreads
            WHERE album_id = :album_id
        """),
        {"album_id": str(album_id)},
    )
    spread_number = result.fetchone()[0]

    if request.position is not None and request.position < spread_number:
        # Shift existing spreads
        await db.execute(
            text("""
                UPDATE album_spreads
                SET spread_number = spread_number + 1
                WHERE album_id = :album_id AND spread_number >= :position
            """),
            {"album_id": str(album_id), "position": request.position},
        )
        spread_number = request.position

    spread_id = uuid4()
    result = await db.execute(
        text("""
            INSERT INTO album_spreads
            (spread_id, album_id, workspace_id, spread_number, spread_type,
             layout_template_id, layout_config, background_config)
            VALUES (:spread_id, :album_id, :workspace_id, :spread_number, :spread_type,
                    :layout_template_id, :layout_config, :background_config)
            RETURNING spread_id, spread_number
        """),
        {
            "spread_id": str(spread_id),
            "album_id": str(album_id),
            "workspace_id": str(workspace_id),
            "spread_number": spread_number,
            "spread_type": request.spread_type,
            "layout_template_id": request.layout_template_id,
            "layout_config": json.dumps(request.layout_config),
            "background_config": json.dumps(request.background_config),
        },
    )
    row = result.fetchone()
    await db.commit()

    return {
        "spread_id": str(row[0]),
        "spread_number": row[1],
        "spread_type": request.spread_type,
    }


@router.patch("/{album_id}/spreads/{spread_id}")
async def update_spread(
    album_id: UUID,
    spread_id: UUID,
    request: UpdateSpreadRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Update a spread."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    updates = ["updated_at = NOW()"]
    params: dict[str, Any] = {
        "spread_id": str(spread_id),
        "album_id": str(album_id),
        "workspace_id": str(workspace_id),
    }

    if request.layout_template_id is not None:
        updates.append("layout_template_id = :layout_template_id")
        params["layout_template_id"] = request.layout_template_id
    if request.layout_config is not None:
        updates.append("layout_config = :layout_config")
        params["layout_config"] = json.dumps(request.layout_config)
    if request.background_config is not None:
        updates.append("background_config = :background_config")
        params["background_config"] = json.dumps(request.background_config)

    result = await db.execute(
        text(f"""
            UPDATE album_spreads
            SET {", ".join(updates)}
            WHERE spread_id = :spread_id AND album_id = :album_id AND workspace_id = :workspace_id
            RETURNING spread_id, spread_number, spread_type
        """),
        params,
    )
    row = result.fetchone()
    await db.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Spread not found")

    return {
        "spread_id": str(row[0]),
        "spread_number": row[1],
        "spread_type": row[2],
    }


@router.post("/{album_id}/spreads/reorder")
async def reorder_spreads(
    album_id: UUID,
    request: ReorderSpreadsRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Reorder spreads in the album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    for idx, spread_id in enumerate(request.spread_ids):
        await db.execute(
            text("""
                UPDATE album_spreads
                SET spread_number = :number, updated_at = NOW()
                WHERE spread_id = :spread_id AND album_id = :album_id AND workspace_id = :workspace_id
            """),
            {
                "spread_id": str(spread_id),
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "number": idx + 1,
            },
        )
    await db.commit()

    return {"success": True, "spread_count": len(request.spread_ids)}


@router.delete("/{album_id}/spreads/{spread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_spread(
    album_id: UUID,
    spread_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Delete a spread."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    # Get spread number for reordering
    result = await db.execute(
        text("""
            SELECT spread_number FROM album_spreads
            WHERE spread_id = :spread_id AND album_id = :album_id AND workspace_id = :workspace_id
        """),
        {"spread_id": str(spread_id), "album_id": str(album_id), "workspace_id": str(workspace_id)},
    )
    row = result.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Spread not found")

    spread_number = row[0]

    # Delete spread
    await db.execute(
        text("""
            DELETE FROM album_spreads
            WHERE spread_id = :spread_id AND workspace_id = :workspace_id
        """),
        {"spread_id": str(spread_id), "workspace_id": str(workspace_id)},
    )

    # Reorder remaining spreads
    await db.execute(
        text("""
            UPDATE album_spreads
            SET spread_number = spread_number - 1
            WHERE album_id = :album_id AND spread_number > :number
        """),
        {"album_id": str(album_id), "number": spread_number},
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Element Endpoints
# ---------------------------------------------------------------------------

@router.post("/{album_id}/elements", status_code=status.HTTP_201_CREATED)
async def create_element(
    album_id: UUID,
    request: CreateElementRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Create a new element on a spread."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    element_id = uuid4()
    result = await db.execute(
        text("""
            INSERT INTO album_spread_elements
            (element_id, spread_id, album_id, workspace_id, element_type,
             asset_id, position, content, style, effects, crop_config)
            VALUES (:element_id, :spread_id, :album_id, :workspace_id, :element_type,
                    :asset_id, :position, :content, :style, :effects, :crop_config)
            RETURNING element_id
        """),
        {
            "element_id": str(element_id),
            "spread_id": str(request.spread_id),
            "album_id": str(album_id),
            "workspace_id": str(workspace_id),
            "element_type": request.element_type,
            "asset_id": str(request.asset_id) if request.asset_id else None,
            "position": json.dumps(request.position.model_dump()),
            "content": json.dumps(request.content),
            "style": json.dumps(request.style),
            "effects": json.dumps(request.effects),
            "crop_config": json.dumps(request.crop_config),
        },
    )
    await db.commit()

    return {
        "element_id": str(element_id),
        "spread_id": str(request.spread_id),
        "element_type": request.element_type,
    }


@router.patch("/{album_id}/elements/{element_id}")
async def update_element(
    album_id: UUID,
    element_id: UUID,
    request: UpdateElementRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Update an element."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    updates = ["updated_at = NOW()"]
    params: dict[str, Any] = {
        "element_id": str(element_id),
        "album_id": str(album_id),
        "workspace_id": str(workspace_id),
    }

    if request.position is not None:
        updates.append("position = :position")
        params["position"] = json.dumps(request.position.model_dump())
    if request.content is not None:
        updates.append("content = :content")
        params["content"] = json.dumps(request.content)
    if request.style is not None:
        updates.append("style = :style")
        params["style"] = json.dumps(request.style)
    if request.effects is not None:
        updates.append("effects = :effects")
        params["effects"] = json.dumps(request.effects)
    if request.crop_config is not None:
        updates.append("crop_config = :crop_config")
        params["crop_config"] = json.dumps(request.crop_config)

    result = await db.execute(
        text(f"""
            UPDATE album_spread_elements
            SET {", ".join(updates)}
            WHERE element_id = :element_id AND album_id = :album_id AND workspace_id = :workspace_id
            RETURNING element_id, element_type
        """),
        params,
    )
    row = result.fetchone()
    await db.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Element not found")

    return {
        "element_id": str(row[0]),
        "element_type": row[1],
    }


@router.delete("/{album_id}/elements/{element_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_element(
    album_id: UUID,
    element_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Delete an element."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    result = await db.execute(
        text("""
            DELETE FROM album_spread_elements
            WHERE element_id = :element_id AND album_id = :album_id AND workspace_id = :workspace_id
            RETURNING element_id
        """),
        {
            "element_id": str(element_id),
            "album_id": str(album_id),
            "workspace_id": str(workspace_id),
        },
    )
    row = result.fetchone()
    await db.commit()

    if not row:
        raise HTTPException(status_code=404, detail="Element not found")


# ---------------------------------------------------------------------------
# Collaboration Session Endpoints
# ---------------------------------------------------------------------------

@router.post("/{album_id}/collaboration/session")
async def create_collaboration_session(
    album_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Create or join a collaborative editing session for an album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    service = get_album_collaboration_service(db)
    result = await service.create_session(
        workspace_id=workspace_id,
        album_id=album_id,
        user_id=current_user.user_id,
    )

    return result


@router.delete("/{album_id}/collaboration/session/{session_id}")
async def leave_collaboration_session(
    album_id: UUID,
    session_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Leave a collaborative editing session."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    service = get_album_collaboration_service(db)
    await service.leave_session(
        session_id=session_id,
        user_id=current_user.user_id,
    )

    return {"success": True}


@router.post("/{album_id}/collaboration/operation")
async def apply_collaborative_operation(
    album_id: UUID,
    request: CollaborativeOperationRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Apply a collaborative operation to the album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    # Get active session
    result = await db.execute(
        text("""
            SELECT session_id FROM album_collaboration_sessions
            WHERE album_id = :album_id AND status = 'active'
            LIMIT 1
        """),
        {"album_id": str(album_id)},
    )
    row = result.fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="No active collaboration session")

    session_id = UUID(str(row[0]))

    service = get_album_collaboration_service(db)
    result = await service.apply_operation(
        session_id=session_id,
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        album_id=album_id,
        operation_type=request.operation_type,
        target_type=request.target_type,
        target_id=request.target_id,
        payload=request.payload,
        vector_clock=request.vector_clock,
    )

    return result


# ---------------------------------------------------------------------------
# Version History Endpoints
# ---------------------------------------------------------------------------

@router.get("/{album_id}/versions")
async def get_version_history(
    album_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Get version history for an album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    service = get_album_collaboration_service(db)
    versions = await service.get_version_history(
        album_id=album_id,
        workspace_id=workspace_id,
        limit=limit,
    )

    return {"versions": versions}


@router.post("/{album_id}/versions/snapshot")
async def create_version_snapshot(
    album_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    change_summary: str | None = Query(None),
) -> dict[str, Any]:
    """Create a manual version snapshot."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    service = get_album_collaboration_service(db)
    result = await service.create_version_snapshot(
        album_id=album_id,
        workspace_id=workspace_id,
        user_id=current_user.user_id,
        change_type="manual_save",
        change_summary=change_summary,
    )

    return result


@router.post("/{album_id}/versions/rollback")
async def rollback_to_version(
    album_id: UUID,
    request: RollbackRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Rollback album to a specific version."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    service = get_album_collaboration_service(db)
    result = await service.rollback_to_version(
        album_id=album_id,
        workspace_id=workspace_id,
        user_id=current_user.user_id,
        version_number=request.version_number,
    )

    return result


# ---------------------------------------------------------------------------
# Comments Endpoints
# ---------------------------------------------------------------------------

@router.post("/{album_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    album_id: UUID,
    request: CreateCommentRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Create a comment on an album, spread, or element."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    comment_id = uuid4()
    result = await db.execute(
        text("""
            INSERT INTO album_comments
            (comment_id, album_id, spread_id, element_id, workspace_id,
             user_id, parent_comment_id, content, mentions, position)
            VALUES (:comment_id, :album_id, :spread_id, :element_id, :workspace_id,
                    :user_id, :parent_comment_id, :content, :mentions, :position)
            RETURNING comment_id, created_at
        """),
        {
            "comment_id": str(comment_id),
            "album_id": str(album_id),
            "spread_id": str(request.spread_id) if request.spread_id else None,
            "element_id": str(request.element_id) if request.element_id else None,
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "parent_comment_id": str(request.parent_comment_id) if request.parent_comment_id else None,
            "content": request.content,
            "mentions": [str(m) for m in request.mentions],
            "position": json.dumps(request.position) if request.position else None,
        },
    )
    row = result.fetchone()
    await db.commit()

    # TODO: Send notifications to mentioned users

    return {
        "comment_id": str(row[0]),
        "created_at": row[1].isoformat() if row[1] else None,
    }


@router.get("/{album_id}/comments")
async def get_comments(
    album_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    spread_id: UUID | None = Query(None),
    status: str | None = Query(None, pattern="^(open|resolved|archived)$"),
) -> dict[str, Any]:
    """Get comments for an album."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    conditions = ["c.album_id = :album_id", "c.workspace_id = :workspace_id"]
    params: dict[str, Any] = {
        "album_id": str(album_id),
        "workspace_id": str(workspace_id),
    }

    if spread_id:
        conditions.append("c.spread_id = :spread_id")
        params["spread_id"] = str(spread_id)

    if status:
        conditions.append("c.status = :status")
        params["status"] = status

    where_clause = " AND ".join(conditions)

    result = await db.execute(
        text(f"""
            SELECT c.comment_id, c.spread_id, c.element_id, c.parent_comment_id,
                   c.content, c.mentions, c.position, c.status, c.created_at,
                   u.user_id, u.email, u.first_name, u.last_name
            FROM album_comments c
            JOIN users u ON c.user_id = u.user_id
            WHERE {where_clause}
            ORDER BY c.created_at ASC
        """),
        params,
    )

    comments = []
    for row in result.fetchall():
        display_name = f"{row[11] or ''} {row[12] or ''}".strip() or row[10]
        comments.append({
            "comment_id": str(row[0]),
            "spread_id": str(row[1]) if row[1] else None,
            "element_id": str(row[2]) if row[2] else None,
            "parent_comment_id": str(row[3]) if row[3] else None,
            "content": row[4],
            "mentions": row[5] or [],
            "position": row[6],
            "status": row[7],
            "created_at": row[8].isoformat() if row[8] else None,
            "user": {
                "user_id": str(row[9]),
                "display_name": display_name,
            },
        })

    return {"comments": comments}


@router.post("/{album_id}/comments/resolve")
async def resolve_comments(
    album_id: UUID,
    request: ResolveCommentRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Resolve multiple comments."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    for comment_id in request.comment_ids:
        await db.execute(
            text("""
                UPDATE album_comments
                SET status = 'resolved', resolved_by = :user_id, resolved_at = NOW()
                WHERE comment_id = :comment_id AND album_id = :album_id AND workspace_id = :workspace_id
            """),
            {
                "comment_id": str(comment_id),
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )
    await db.commit()

    return {"resolved_count": len(request.comment_ids)}


# ---------------------------------------------------------------------------
# Templates Endpoints
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    album_type: str | None = Query(None),
    category: str | None = Query(None, pattern="^(standard|premium|custom)$"),
) -> dict[str, Any]:
    """List available album templates."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    conditions = ["(workspace_id = :workspace_id OR is_system = TRUE)", "is_active = TRUE"]
    params: dict[str, Any] = {"workspace_id": str(workspace_id)}

    if album_type:
        conditions.append("album_type = :album_type")
        params["album_type"] = album_type

    if category:
        conditions.append("category = :category")
        params["category"] = category

    where_clause = " AND ".join(conditions)

    result = await db.execute(
        text(f"""
            SELECT template_id, name, description, album_type, category,
                   page_size, spread_templates, thumbnail_url, is_system
            FROM album_templates
            WHERE {where_clause}
            ORDER BY is_system DESC, sort_order, name
        """),
        params,
    )

    templates = [
        {
            "template_id": str(row[0]),
            "name": row[1],
            "description": row[2],
            "album_type": row[3],
            "category": row[4],
            "page_size": row[5],
            "spread_template_count": len(row[6]) if row[6] else 0,
            "thumbnail_url": row[7],
            "is_system": row[8],
        }
        for row in result.fetchall()
    ]

    return {"templates": templates}


@router.get("/templates/{template_id}")
async def get_template(
    template_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Get template details including spread layouts."""
    workspace_id = current_user.active_workspace_id
    if not workspace_id:
        raise HTTPException(status_code=400, detail="No active workspace")

    result = await db.execute(
        text("""
            SELECT template_id, name, description, album_type, category,
                   page_size, default_spread_layout, spread_templates,
                   cover_options, spine_options, color_palette, typography, thumbnail_url
            FROM album_templates
            WHERE template_id = :template_id AND (workspace_id = :workspace_id OR is_system = TRUE)
        """),
        {"template_id": str(template_id), "workspace_id": str(workspace_id)},
    )
    row = result.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Template not found")

    return {
        "template_id": str(row[0]),
        "name": row[1],
        "description": row[2],
        "album_type": row[3],
        "category": row[4],
        "page_size": row[5],
        "default_spread_layout": row[6],
        "spread_templates": row[7],
        "cover_options": row[8],
        "spine_options": row[9],
        "color_palette": row[10],
        "typography": row[11],
        "thumbnail_url": row[12],
    }


# ---------------------------------------------------------------------------
# WebSocket Endpoint for Real-time Collaboration
# ---------------------------------------------------------------------------

class AlbumConnectionManager:
    """Manages WebSocket connections for album collaboration."""

    def __init__(self):
        self.active_connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, session_id: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = {}
        self.active_connections[session_id][user_id] = websocket

    def disconnect(self, session_id: str, user_id: str) -> None:
        if session_id in self.active_connections:
            self.active_connections[session_id].pop(user_id, None)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast_to_session(self, session_id: str, message: dict, exclude_user: str | None = None) -> None:
        if session_id in self.active_connections:
            for user_id, websocket in self.active_connections[session_id].items():
                if user_id != exclude_user:
                    try:
                        await websocket.send_json(message)
                    except Exception:
                        pass


manager = AlbumConnectionManager()


@router.websocket("/collaboration/ws/{session_id}")
async def album_collaboration_websocket(
    websocket: WebSocket,
    session_id: UUID,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time album collaboration."""
    from app.db.session import async_session_maker

    # Validate token
    redis = await get_redis_client()
    token_data = await redis.get(f"album:token:{token}")

    if not token_data:
        await websocket.close(code=4001, reason="Invalid token")
        return

    token_info = json.loads(token_data)
    if token_info["session_id"] != str(session_id):
        await websocket.close(code=4002, reason="Token session mismatch")
        return

    user_id = token_info["user_id"]

    # Connect
    await manager.connect(str(session_id), user_id, websocket)

    # Subscribe to Redis channel
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"album:channel:{session_id}")

    try:
        # Send initial state
        async with async_session_maker() as db:
            service = get_album_collaboration_service(db)
            session_data = await service._get_session_data(session_id)
            await websocket.send_json({
                "type": "album:session_state",
                "session": session_data,
            })

        # Start listening for Redis messages in background
        import asyncio

        async def redis_listener():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    # Don't send to the user who originated the message
                    if data.get("user_id") != user_id:
                        await websocket.send_json(data)

        redis_task = asyncio.create_task(redis_listener())

        # Handle incoming messages
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            async with async_session_maker() as db:
                service = get_album_collaboration_service(db)

                if message_type == "album:presence":
                    await service.update_presence(
                        session_id=session_id,
                        user_id=UUID(user_id),
                        cursor=data.get("cursor"),
                        selected_elements=data.get("selected_elements"),
                        current_spread_id=UUID(data["current_spread_id"]) if data.get("current_spread_id") else None,
                    )
                elif message_type == "album:operation":
                    # Operations go through REST API for proper CRDT handling
                    pass
                elif message_type == "album:ping":
                    await websocket.send_json({"type": "album:pong"})

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected from album session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        redis_task.cancel()
        await pubsub.unsubscribe(f"album:channel:{session_id}")
        manager.disconnect(str(session_id), user_id)

        # Mark user as disconnected
        async with async_session_maker() as db:
            service = get_album_collaboration_service(db)
            await service.leave_session(session_id, UUID(user_id))
