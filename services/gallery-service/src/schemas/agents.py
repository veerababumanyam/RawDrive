"""Google A2A (Agent-to-Agent) schemas for agent endpoints.

These schemas implement the Google A2A protocol for multi-agent communication.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# =============================================================================
# A2A Protocol Schemas
# =============================================================================


class A2ATask(BaseModel):
    """A2A Task definition.

    Represents the action an agent should perform.
    """

    action: str = Field(
        ...,
        description="The action to perform (e.g., 'create_gallery', 'list_galleries')"
    )
    params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters for the action"
    )


class A2AContext(BaseModel):
    """A2A Context for authentication and workspace isolation.

    Contains the authentication information for the agent request.
    """

    user_id: str = Field(..., description="User UUID performing the action")
    workspace_id: str = Field(..., description="Workspace UUID for multi-tenant isolation")
    permissions: List[str] = Field(
        default_factory=list,
        description="List of permissions (e.g., ['galleries:read', 'galleries:write'])"
    )
    email: Optional[str] = Field(None, description="User email (optional)")


class A2ARunRequest(BaseModel):
    """A2A Agent Run Request.

    Standard Google A2A protocol request format.
    """

    task: A2ATask = Field(..., description="The task to execute")
    session_id: Optional[str] = Field(
        None,
        description="Session ID for multi-step workflows (optional)"
    )
    context: A2AContext = Field(..., description="Authentication and workspace context")


class A2ANextAction(BaseModel):
    """Suggested next action for multi-step workflows."""

    action: str = Field(..., description="Suggested action name")
    description: str = Field(..., description="Human-readable description")
    params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Suggested parameters"
    )


class A2ARunResponse(BaseModel):
    """A2A Agent Run Response.

    Standard Google A2A protocol response format.
    """

    result: Dict[str, Any] = Field(..., description="The result of the action")
    status: str = Field(
        ...,
        description="Status: 'completed', 'failed', 'pending'"
    )
    next_actions: Optional[List[A2ANextAction]] = Field(
        None,
        description="Suggested next actions for multi-step workflows"
    )
    error: Optional[str] = Field(None, description="Error message if status is 'failed'")
    session_id: Optional[str] = Field(None, description="Session ID for stateful workflows")


# =============================================================================
# Gallery Manager Agent Schemas
# =============================================================================


class GalleryManagerCreateAction(BaseModel):
    """Parameters for creating a gallery."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None


class GalleryManagerUpdateAction(BaseModel):
    """Parameters for updating a gallery."""

    gallery_id: str = Field(..., description="Gallery UUID to update")
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None


class GalleryManagerAddAssetsAction(BaseModel):
    """Parameters for adding assets to a gallery."""

    gallery_id: str = Field(..., description="Gallery UUID")
    asset_ids: List[str] = Field(..., description="List of asset UUIDs to add")


class GalleryManagerCreateShareLinkAction(BaseModel):
    """Parameters for creating a Magic Link."""

    gallery_id: str = Field(..., description="Gallery UUID")
    expires_at: Optional[str] = None
    view_limit: Optional[int] = None
    password: Optional[str] = None
    require_email: bool = False


# =============================================================================
# Proofing Assistant Agent Schemas
# =============================================================================


class ProofingAssistantGetSelectionsAction(BaseModel):
    """Parameters for getting proofing selections."""

    gallery_id: str = Field(..., description="Gallery UUID")


class ProofingAssistantAnalyzeEngagementAction(BaseModel):
    """Parameters for analyzing proofing engagement."""

    gallery_id: str = Field(..., description="Gallery UUID")


class ProofingAssistantExportSelectionsAction(BaseModel):
    """Parameters for exporting selections."""

    gallery_id: str = Field(..., description="Gallery UUID")
    format: str = Field(default="json", description="Export format (json, csv)")


# =============================================================================
# Batch Processor Agent Schemas
# =============================================================================


class BatchProcessorBulkCreateAction(BaseModel):
    """Parameters for bulk creating galleries."""

    galleries: List[Dict[str, Any]] = Field(
        ...,
        description="List of gallery data dictionaries"
    )


class BatchProcessorBulkAddAssetsAction(BaseModel):
    """Parameters for bulk adding assets."""

    operations: List[Dict[str, Any]] = Field(
        ...,
        description="List of operations: [{gallery_id, asset_ids}]"
    )


class BatchProcessorCloneGalleryAction(BaseModel):
    """Parameters for cloning a gallery."""

    source_gallery_id: str = Field(..., description="Source gallery UUID")
    target_name: str = Field(..., description="New gallery name")
    include_assets: bool = Field(default=True, description="Include assets in clone")
