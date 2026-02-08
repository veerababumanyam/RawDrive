"""Google A2A (Agent-to-Agent) API endpoints.

Implements the Google A2A protocol for multi-agent communication.
Provides 3 specialized agents for gallery operations:
1. Gallery Manager - CRUD operations
2. Proofing Assistant - Proofing workflows
3. Batch Processor - Bulk operations
"""

from fastapi import APIRouter, Header, Depends, Request
from typing import Dict, Any
from uuid import UUID

from src.services.gallery_service import (
    GalleryService,
    GalleryNotFoundError,
    GalleryError,
)
from src.services.magic_link_service import MagicLinkService
from src.services.proofing_service import ProofingService
from src.services.batch import BatchOperationService
from src.schemas.agents import (
    A2ARunRequest,
    A2ARunResponse,
    A2ANextAction,
)
from src.middleware.auth import get_current_user
from src.api.v1.errors import (
    raise_http_exception,
    ErrorCode,
    ErrorMessage,
    get_request_id,
)
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Helper Functions
# =============================================================================


def create_success_response(
    result: Dict[str, Any],
    next_actions: list[A2ANextAction] | None = None,
    session_id: str | None = None,
) -> A2ARunResponse:
    """Create a successful A2A response."""
    return A2ARunResponse(
        result=result,
        status="completed",
        next_actions=next_actions,
        session_id=session_id,
    )


def create_error_response(
    error: str,
    session_id: str | None = None,
) -> A2ARunResponse:
    """Create an error A2A response."""
    return A2ARunResponse(
        result={},
        status="failed",
        error=error,
        session_id=session_id,
    )


# =============================================================================
# Gallery Manager Agent
# =============================================================================


@router.post("/gallery-manager/run", response_model=A2ARunResponse)
async def gallery_manager_agent(
    req: Request,
    request: A2ARunRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Gallery Manager Agent - Handles gallery CRUD operations.

    **Supported Actions:**
    - `list_galleries`: List galleries with filters
    - `create_gallery`: Create a new gallery
    - `update_gallery`: Update gallery metadata
    - `add_assets`: Add assets to a gallery
    - `create_share_link`: Create a Magic Link for sharing

    **Security:**
    - Requires valid JWT token in Authorization header
    - Validates workspace_id and user_id match JWT claims

    **Example Request:**
    ```json
    {
        "task": {
            "action": "create_gallery",
            "params": {"title": "Wedding Photos", "client_name": "John & Jane"}
        },
        "context": {
            "user_id": "uuid",
            "workspace_id": "uuid",
            "permissions": ["galleries:write"]
        }
    }
    ```
    """
    request_id = get_request_id(req)
    action = request.task.action
    params = request.task.params
    context = request.context
    workspace_id = context.workspace_id

    # SECURITY: Validate JWT claims match request context
    if context.user_id != current_user.get("user_id"):
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "User ID in context does not match authenticated user",
            request_id=request_id
        )
    if context.workspace_id != current_user.get("workspace_id"):
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "Workspace ID in context does not match authenticated workspace",
            request_id=request_id
        )

    try:
        gallery_service = GalleryService()

        # Action: list_galleries
        if action == "list_galleries":
            result = await gallery_service.list_galleries(
                workspace_id=workspace_id,
                page=params.get("page", 1),
                limit=params.get("limit", 20),
                sort=params.get("sort", "created_at"),
                status=params.get("status"),
                search=params.get("search"),
            )
            return create_success_response(
                result=result,
                next_actions=[
                    A2ANextAction(
                        action="create_gallery",
                        description="Create a new gallery",
                        params={"title": "New Gallery"}
                    )
                ],
                session_id=request.session_id,
            )

        # Action: create_gallery
        elif action == "create_gallery":
            result = await gallery_service.create_gallery(
                workspace_id=UUID(workspace_id),
                user_id=UUID(context.user_id),
                title=params.get("title", "Untitled Gallery"),
                description=params.get("description"),
                client_name=params.get("client_name"),
                client_id=UUID(params["client_id"]) if params.get("client_id") else None,
            )
            return create_success_response(
                result=result,
                next_actions=[
                    A2ANextAction(
                        action="add_assets",
                        description="Add assets to this gallery",
                        params={"gallery_id": result["gallery_id"], "asset_ids": []}
                    ),
                    A2ANextAction(
                        action="create_share_link",
                        description="Create a Magic Link to share this gallery",
                        params={"gallery_id": result["gallery_id"]}
                    ),
                ],
                session_id=request.session_id,
            )

        # Action: update_gallery
        elif action == "update_gallery":
            gallery_id = params.get("gallery_id")
            if not gallery_id:
                return create_error_response("gallery_id is required")

            # Extract update fields
            updates = {
                k: v for k, v in params.items()
                if k not in ["gallery_id"] and v is not None
            }

            result = await gallery_service.update_gallery(
                workspace_id=UUID(workspace_id),
                gallery_id=UUID(gallery_id),
                **updates,
            )
            return create_success_response(
                result=result,
                session_id=request.session_id,
            )

        # Action: add_assets
        elif action == "add_assets":
            gallery_id = params.get("gallery_id")
            asset_ids = params.get("asset_ids", [])

            if not gallery_id:
                return create_error_response("gallery_id is required")
            if not asset_ids:
                return create_error_response("asset_ids is required")

            result = await gallery_service.add_assets(
                workspace_id=UUID(workspace_id),
                gallery_id=UUID(gallery_id),
                asset_ids=[UUID(aid) for aid in asset_ids],
            )
            return create_success_response(
                result=result,
                next_actions=[
                    A2ANextAction(
                        action="create_share_link",
                        description="Create a Magic Link to share this gallery",
                        params={"gallery_id": gallery_id}
                    ),
                ],
                session_id=request.session_id,
            )

        # Action: create_share_link
        elif action == "create_share_link":
            gallery_id = params.get("gallery_id")
            if not gallery_id:
                return create_error_response("gallery_id is required")

            magic_link_service = MagicLinkService()
            result = await magic_link_service.create_magic_link(
                workspace_id=UUID(workspace_id),
                gallery_id=UUID(gallery_id),
                created_by_user_id=UUID(context.user_id),
                expires_at=params.get("expires_at"),
                view_limit=params.get("view_limit"),
                password=params.get("password"),
                require_email=params.get("require_email", False),
            )
            return create_success_response(
                result=result,
                session_id=request.session_id,
            )

        else:
            return create_error_response(
                f"Unknown action: {action}. Supported actions: list_galleries, create_gallery, update_gallery, add_assets, create_share_link"
            )

    except GalleryNotFoundError as e:
        return create_error_response(str(e), session_id=request.session_id)
    except GalleryError as e:
        return create_error_response(str(e), session_id=request.session_id)
    except Exception as e:
        logger.error(f"Gallery Manager Agent error: {e}", exc_info=True)
        return create_error_response(
            f"Internal error: {str(e)}",
            session_id=request.session_id,
        )


# =============================================================================
# Proofing Assistant Agent
# =============================================================================


@router.post("/proofing-assistant/run", response_model=A2ARunResponse)
async def proofing_assistant_agent(
    req: Request,
    request: A2ARunRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Proofing Assistant Agent - Handles proofing workflows.

    **Supported Actions:**
    - `get_selections`: Get client selections and favorites
    - `analyze_engagement`: Analyze proofing engagement metrics
    - `export_selections`: Export selections in various formats

    **Example Request:**
    ```json
    {
        "task": {
            "action": "get_selections",
            "params": {"gallery_id": "uuid"}
        },
        "context": {
            "user_id": "uuid",
            "workspace_id": "uuid",
            "permissions": ["galleries:read"]
        }
    }
    ```
    """
    request_id = get_request_id(req)
    action = request.task.action
    params = request.task.params
    context = request.context
    workspace_id = context.workspace_id

    # SECURITY: Validate JWT claims match request context
    if context.user_id != current_user.get("user_id"):
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "User ID in context does not match authenticated user",
            request_id=request_id
        )
    if context.workspace_id != current_user.get("workspace_id"):
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "Workspace ID in context does not match authenticated workspace",
            request_id=request_id
        )

    try:
        proofing_service = ProofingService()

        # Action: get_selections
        if action == "get_selections":
            gallery_id = params.get("gallery_id")
            if not gallery_id:
                return create_error_response("gallery_id is required")

            result = await proofing_service.get_proofing_selections(
                workspace_id=UUID(workspace_id),
                gallery_id=UUID(gallery_id),
            )
            return create_success_response(
                result=result,
                next_actions=[
                    A2ANextAction(
                        action="analyze_engagement",
                        description="Analyze engagement metrics for this gallery",
                        params={"gallery_id": gallery_id}
                    ),
                    A2ANextAction(
                        action="export_selections",
                        description="Export selections to a file",
                        params={"gallery_id": gallery_id, "format": "json"}
                    ),
                ],
                session_id=request.session_id,
            )

        # Action: analyze_engagement
        elif action == "analyze_engagement":
            gallery_id = params.get("gallery_id")
            if not gallery_id:
                return create_error_response("gallery_id is required")

            # Get selections and calculate metrics
            selections = await proofing_service.get_proofing_selections(
                workspace_id=UUID(workspace_id),
                gallery_id=UUID(gallery_id),
            )

            # Calculate engagement metrics
            total_selections = selections.get("selections", {}).get("count", 0)
            total_favorites = selections.get("favorites", {}).get("count", 0)
            total_actions = selections.get("total_proofing_actions", 0)

            result = {
                "gallery_id": gallery_id,
                "engagement_metrics": {
                    "total_selections": total_selections,
                    "total_favorites": total_favorites,
                    "total_actions": total_actions,
                    "selection_rate": f"{total_selections}/{total_actions}" if total_actions > 0 else "0/0",
                    "favorite_rate": f"{total_favorites}/{total_actions}" if total_actions > 0 else "0/0",
                },
                "insights": {
                    "high_engagement": total_actions > 50,
                    "has_selections": total_selections > 0,
                    "has_favorites": total_favorites > 0,
                }
            }
            return create_success_response(
                result=result,
                session_id=request.session_id,
            )

        # Action: export_selections
        elif action == "export_selections":
            gallery_id = params.get("gallery_id")
            export_format = params.get("format", "json")

            if not gallery_id:
                return create_error_response("gallery_id is required")

            selections = await proofing_service.get_proofing_selections(
                workspace_id=UUID(workspace_id),
                gallery_id=UUID(gallery_id),
            )

            result = {
                "gallery_id": gallery_id,
                "format": export_format,
                "data": selections,
                "export_url": f"/api/v1/exports/{gallery_id}/selections.{export_format}",  # Placeholder
            }
            return create_success_response(
                result=result,
                session_id=request.session_id,
            )

        else:
            return create_error_response(
                f"Unknown action: {action}. Supported actions: get_selections, analyze_engagement, export_selections"
            )

    except GalleryNotFoundError as e:
        return create_error_response(str(e), session_id=request.session_id)
    except Exception as e:
        logger.error(f"Proofing Assistant Agent error: {e}", exc_info=True)
        return create_error_response(
            f"Internal error: {str(e)}",
            session_id=request.session_id,
        )


# =============================================================================
# Batch Processor Agent
# =============================================================================


@router.post("/batch-processor/run", response_model=A2ARunResponse)
async def batch_processor_agent(
    req: Request,
    request: A2ARunRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Batch Processor Agent - Handles bulk operations.

    **Supported Actions:**
    - `bulk_create_galleries`: Create multiple galleries in one request
    - `bulk_add_assets`: Add assets to multiple galleries
    - `clone_gallery`: Clone a gallery structure

    **Example Request:**
    ```json
    {
        "task": {
            "action": "bulk_create_galleries",
            "params": {
                "galleries": [
                    {"title": "Gallery 1", "client_name": "Client A"},
                    {"title": "Gallery 2", "client_name": "Client B"}
                ]
            }
        },
        "context": {
            "user_id": "uuid",
            "workspace_id": "uuid",
            "permissions": ["galleries:write"]
        }
    }
    ```
    """
    request_id = get_request_id(req)
    action = request.task.action
    params = request.task.params
    context = request.context
    workspace_id = context.workspace_id

    # SECURITY: Validate JWT claims match request context
    if context.user_id != current_user.get("user_id"):
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "User ID in context does not match authenticated user",
            request_id=request_id
        )
    if context.workspace_id != current_user.get("workspace_id"):
        raise_http_exception(
            ErrorCode.FORBIDDEN,
            "Workspace ID in context does not match authenticated workspace",
            request_id=request_id
        )

    try:
        batch_service = BatchOperationService()

        # Action: bulk_create_galleries
        if action == "bulk_create_galleries":
            galleries_data = params.get("galleries", [])
            if not galleries_data:
                return create_error_response("galleries list is required")

            result = await batch_service.bulk_create_galleries(
                workspace_id=UUID(workspace_id),
                user_id=UUID(context.user_id),
                galleries=galleries_data,
            )

            return create_success_response(
                result=result,
                next_actions=[
                    A2ANextAction(
                        action="bulk_add_assets",
                        description="Add assets to the created galleries",
                        params={
                            "gallery_ids": [g["gallery_id"] for g in result["created_galleries"]]
                        }
                    )
                ] if result["success_count"] > 0 else None,
                session_id=request.session_id,
            )

        # Action: bulk_add_assets
        elif action == "bulk_add_assets":
            operations = params.get("operations", [])
            if not operations:
                return create_error_response("operations list is required")

            result = await batch_service.bulk_add_assets(
                workspace_id=UUID(workspace_id),
                operations=operations,
            )

            return create_success_response(
                result=result,
                session_id=request.session_id,
            )

        # Action: clone_gallery
        elif action == "clone_gallery":
            source_gallery_id = params.get("source_gallery_id")
            target_name = params.get("target_name")
            include_assets = params.get("include_assets", True)

            if not source_gallery_id:
                return create_error_response("source_gallery_id is required")
            if not target_name:
                return create_error_response("target_name is required")

            result = await batch_service.clone_gallery(
                workspace_id=UUID(workspace_id),
                user_id=UUID(context.user_id),
                source_gallery_id=UUID(source_gallery_id),
                target_name=target_name,
                include_assets=include_assets,
            )

            return create_success_response(
                result=result,
                next_actions=[
                    A2ANextAction(
                        action="add_assets",
                        description="Add more assets to the cloned gallery",
                        params={"gallery_id": result["cloned_gallery"]["gallery_id"]}
                    )
                ],
                session_id=request.session_id,
            )

        else:
            return create_error_response(
                f"Unknown action: {action}. Supported actions: bulk_create_galleries, bulk_add_assets, clone_gallery"
            )

    except GalleryNotFoundError as e:
        return create_error_response(str(e), session_id=request.session_id)
    except GalleryError as e:
        return create_error_response(str(e), session_id=request.session_id)
    except Exception as e:
        logger.error(f"Batch Processor Agent error: {e}", exc_info=True)
        return create_error_response(
            f"Internal error: {str(e)}",
            session_id=request.session_id,
        )
