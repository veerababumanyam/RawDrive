"""API endpoints for webhook integration templates and workflows."""

from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...middleware.auth import get_current_user, get_workspace_id
from ...services.template_service import (
    TemplateService,
    WorkflowService,
    WorkflowExecutionService,
)
from ...schemas.template import (
    TemplateCategory,
    IntegrationType,
    WorkflowExecutionStatus,
    TemplateFilterParams,
    WebhookTemplateResponse,
    WebhookTemplateSummary,
    TemplateListResponse,
    TemplateCategoryStats,
    TemplateStatsResponse,
    CreateWorkflowFromTemplateRequest,
    CreateCustomWorkflowRequest,
    UpdateWorkflowRequest,
    WorkflowResponse,
    WorkflowSummary,
    WorkflowListResponse,
    WorkflowExecutionResponse,
    WorkflowExecutionSummary,
    WorkflowExecutionListResponse,
    RateTemplateRequest,
    SaveWorkflowBuilderRequest,
    ValidateWorkflowRequest,
    WorkflowValidationResult,
)


router = APIRouter(prefix="/templates", tags=["Webhook Templates"])
workflow_router = APIRouter(prefix="/workflows", tags=["Webhook Workflows"])


# =============================================================================
# TEMPLATE ENDPOINTS
# =============================================================================

@router.get("", response_model=TemplateListResponse)
async def list_templates(
    category: Optional[TemplateCategory] = Query(None, description="Filter by category"),
    integration_type: Optional[IntegrationType] = Query(None, description="Filter by integration type"),
    provider: Optional[str] = Query(None, description="Filter by provider (e.g., slack, asana)"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    event_type: Optional[str] = Query(None, description="Filter by trigger event type"),
    featured_only: bool = Query(False, description="Only return featured templates"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
):
    """
    List available webhook integration templates.

    Templates are pre-built integrations for common automation workflows
    like Zapier, Make.com, Slack notifications, etc.
    """
    service = TemplateService(db)

    params = TemplateFilterParams(
        category=category,
        integration_type=integration_type,
        provider=provider,
        tags=tags,
        search=search,
        event_type=event_type,
        featured_only=featured_only,
        page=page,
        page_size=page_size,
    )

    result = await service.list_templates(params)
    return TemplateListResponse(**result)


@router.get("/featured", response_model=List[WebhookTemplateSummary])
async def get_featured_templates(
    limit: int = Query(5, ge=1, le=20, description="Number of templates to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get featured integration templates."""
    service = TemplateService(db)
    templates = await service.get_featured_templates(limit)
    return [WebhookTemplateSummary(**t) for t in templates]


@router.get("/categories", response_model=List[TemplateCategoryStats])
async def get_template_categories(
    db: AsyncSession = Depends(get_db),
):
    """Get all template categories with counts."""
    service = TemplateService(db)
    categories = await service.get_template_categories()
    return [TemplateCategoryStats(**c) for c in categories]


@router.get("/stats", response_model=TemplateStatsResponse)
async def get_template_stats(
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get overall template and workflow statistics for the workspace."""
    template_service = TemplateService(db)
    workflow_service = WorkflowService(db)

    # Get category stats
    categories = await template_service.get_template_categories()

    # Get featured templates
    featured = await template_service.get_featured_templates(5)

    # Get workspace workflows
    workflows_result = await workflow_service.list_workflows(
        workspace_id=workspace_id,
        page=1,
        page_size=5,
    )

    # Calculate totals
    total_templates = sum(c.get("total_templates", 0) for c in categories)

    return TemplateStatsResponse(
        total_templates=total_templates,
        total_workflows=workflows_result["total"],
        categories=[TemplateCategoryStats(**c) for c in categories],
        top_templates=[WebhookTemplateSummary(**t) for t in featured],
        recent_workflows=[WorkflowSummary(**w) for w in workflows_result["workflows"]],
    )


@router.get("/{template_id}", response_model=WebhookTemplateResponse)
async def get_template(
    template_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
    user_id: Optional[UUID] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific template by ID."""
    service = TemplateService(db)

    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    # Record view
    await service.record_template_view(
        template_id=template_id,
        workspace_id=workspace_id,
        user_id=user_id,
    )

    return WebhookTemplateResponse(**template)


@router.get("/slug/{slug}", response_model=WebhookTemplateResponse)
async def get_template_by_slug(
    slug: str,
    workspace_id: UUID = Depends(get_workspace_id),
    user_id: Optional[UUID] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific template by slug."""
    service = TemplateService(db)

    template = await service.get_template_by_slug(slug)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    # Record view
    await service.record_template_view(
        template_id=template["template_id"],
        workspace_id=workspace_id,
        user_id=user_id,
    )

    return WebhookTemplateResponse(**template)


@router.post("/{template_id}/rate")
async def rate_template(
    template_id: UUID,
    request: RateTemplateRequest,
    workspace_id: UUID = Depends(get_workspace_id),
    user_id: Optional[UUID] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rate a template (1-5 stars)."""
    service = TemplateService(db)

    # Verify template exists
    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    await service.rate_template(
        template_id=template_id,
        workspace_id=workspace_id,
        rating=request.rating,
        feedback=request.feedback,
        user_id=user_id,
    )

    return {"message": "Rating submitted successfully"}


# =============================================================================
# WORKFLOW ENDPOINTS
# =============================================================================

@workflow_router.get("", response_model=WorkflowListResponse)
async def list_workflows(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    template_id: Optional[UUID] = Query(None, description="Filter by template"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List workflows for the current workspace."""
    service = WorkflowService(db)

    result = await service.list_workflows(
        workspace_id=workspace_id,
        is_active=is_active,
        template_id=template_id,
        page=page,
        page_size=page_size,
    )

    return WorkflowListResponse(
        workflows=[WorkflowSummary(**w) for w in result["workflows"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
    )


@workflow_router.post("/from-template", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_from_template(
    request: CreateWorkflowFromTemplateRequest,
    workspace_id: UUID = Depends(get_workspace_id),
    user_id: Optional[UUID] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workflow from a template."""
    service = WorkflowService(db)

    try:
        workflow = await service.create_from_template(
            workspace_id=workspace_id,
            request=request,
            user_id=user_id,
        )
        return WorkflowResponse(**workflow)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@workflow_router.post("/custom", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_workflow(
    request: CreateCustomWorkflowRequest,
    workspace_id: UUID = Depends(get_workspace_id),
    user_id: Optional[UUID] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom workflow."""
    service = WorkflowService(db)

    workflow = await service.create_custom(
        workspace_id=workspace_id,
        request=request,
        user_id=user_id,
    )

    return WorkflowResponse(**workflow)


@workflow_router.post("/from-builder", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow_from_builder(
    request: SaveWorkflowBuilderRequest,
    workspace_id: UUID = Depends(get_workspace_id),
    user_id: Optional[UUID] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a workflow from the visual workflow builder."""
    service = WorkflowService(db)

    try:
        workflow = await service.create_from_builder(
            workspace_id=workspace_id,
            name=request.name,
            builder_state=request.builder_state,
            description=request.description,
            configuration=request.configuration,
            is_active=request.is_active,
            user_id=user_id,
        )
        return WorkflowResponse(**workflow)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@workflow_router.post("/validate", response_model=WorkflowValidationResult)
async def validate_workflow(
    request: ValidateWorkflowRequest,
    db: AsyncSession = Depends(get_db),
):
    """Validate a workflow configuration from the visual builder."""
    service = WorkflowService(db)
    return await service.validate_workflow(request.builder_state)


@workflow_router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific workflow by ID."""
    service = WorkflowService(db)

    workflow = await service.get_workflow(workflow_id, workspace_id)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    return WorkflowResponse(**workflow)


@workflow_router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: UUID,
    request: UpdateWorkflowRequest,
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a workflow."""
    service = WorkflowService(db)

    workflow = await service.update_workflow(workflow_id, workspace_id, request)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    return WorkflowResponse(**workflow)


@workflow_router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a workflow."""
    service = WorkflowService(db)

    deleted = await service.delete_workflow(workflow_id, workspace_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )


@workflow_router.post("/{workflow_id}/toggle", response_model=WorkflowResponse)
async def toggle_workflow(
    workflow_id: UUID,
    is_active: bool = Query(..., description="New active status"),
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Toggle workflow active status."""
    service = WorkflowService(db)

    workflow = await service.toggle_workflow(workflow_id, workspace_id, is_active)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    return WorkflowResponse(**workflow)


# =============================================================================
# WORKFLOW EXECUTION ENDPOINTS
# =============================================================================

@workflow_router.get("/{workflow_id}/executions", response_model=WorkflowExecutionListResponse)
async def list_workflow_executions(
    workflow_id: UUID,
    status_filter: Optional[WorkflowExecutionStatus] = Query(None, alias="status", description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List executions for a specific workflow."""
    execution_service = WorkflowExecutionService(db)

    result = await execution_service.list_executions(
        workspace_id=workspace_id,
        workflow_id=workflow_id,
        status=status_filter,
        page=page,
        page_size=page_size,
    )

    return WorkflowExecutionListResponse(
        executions=[WorkflowExecutionSummary(**e) for e in result["executions"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
    )


@workflow_router.get("/executions/{execution_id}", response_model=WorkflowExecutionResponse)
async def get_workflow_execution(
    execution_id: UUID,
    workspace_id: UUID = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific workflow execution."""
    service = WorkflowExecutionService(db)

    execution = await service.get_execution(execution_id, workspace_id)
    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )

    return WorkflowExecutionResponse(**execution)


# Register routers
def register_template_routes(app_router: APIRouter):
    """Register template and workflow routes."""
    app_router.include_router(router)
    app_router.include_router(workflow_router)
