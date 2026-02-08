"""Pydantic schemas for webhook integration templates and workflows."""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, Field


class TemplateCategory(str, Enum):
    """Template category types."""
    COMMUNICATION = "communication"
    CRM = "crm"
    PROJECT_MANAGEMENT = "project_management"
    ANALYTICS = "analytics"
    AUTOMATION = "automation"
    NOTIFICATION = "notification"
    DEVELOPER = "developer"


class IntegrationType(str, Enum):
    """Integration platform types."""
    ZAPIER = "zapier"
    MAKE = "make"
    NATIVE = "native"
    CUSTOM = "custom"


class WorkflowStepType(str, Enum):
    """Workflow step types."""
    TRIGGER = "trigger"
    TRANSFORM = "transform"
    CONDITION = "condition"
    HTTP_REQUEST = "http_request"
    DELAY = "delay"
    BRANCH = "branch"


class WorkflowExecutionStatus(str, Enum):
    """Workflow execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# =============================================================================
# TEMPLATE SCHEMAS
# =============================================================================

class WorkflowStepDefinition(BaseModel):
    """Definition of a workflow step."""
    type: WorkflowStepType
    name: str
    description: Optional[str] = None
    event: Optional[str] = None  # For trigger steps
    config: Dict[str, Any] = Field(default_factory=dict)
    input_mapping: Optional[Dict[str, str]] = None
    output_mapping: Optional[Dict[str, str]] = None
    condition: Optional[Dict[str, Any]] = None


class WebhookTemplateResponse(BaseModel):
    """Response for a webhook integration template."""
    template_id: UUID
    slug: str
    name: str
    short_description: str
    long_description: Optional[str] = None

    category: TemplateCategory
    integration_type: IntegrationType
    tags: List[str] = Field(default_factory=list)

    provider: Optional[str] = None
    provider_logo_url: Optional[str] = None
    provider_website: Optional[str] = None

    trigger_events: List[str]
    default_config: Dict[str, Any] = Field(default_factory=dict)
    workflow_steps: Optional[List[WorkflowStepDefinition]] = None
    sample_payload: Optional[Dict[str, Any]] = None
    required_fields: List[str] = Field(default_factory=list)

    setup_instructions: Optional[str] = None
    use_cases: Optional[List[str]] = None
    best_practices: Optional[Dict[str, Any]] = None
    documentation_url: Optional[str] = None

    usage_count: int = 0
    rating: Optional[float] = None
    rating_count: int = 0
    is_featured: bool = False
    is_premium: bool = False
    is_active: bool = True

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WebhookTemplateSummary(BaseModel):
    """Summary response for template listing."""
    template_id: UUID
    slug: str
    name: str
    short_description: str
    category: TemplateCategory
    integration_type: IntegrationType
    tags: List[str] = Field(default_factory=list)
    provider: Optional[str] = None
    provider_logo_url: Optional[str] = None
    trigger_events: List[str]
    usage_count: int = 0
    rating: Optional[float] = None
    is_featured: bool = False
    is_premium: bool = False

    class Config:
        from_attributes = True


class TemplateListResponse(BaseModel):
    """Paginated list of templates."""
    templates: List[WebhookTemplateSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


class TemplateFilterParams(BaseModel):
    """Filter parameters for template listing."""
    category: Optional[TemplateCategory] = None
    integration_type: Optional[IntegrationType] = None
    provider: Optional[str] = None
    tags: Optional[List[str]] = None
    search: Optional[str] = None
    event_type: Optional[str] = None
    featured_only: bool = False
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


# =============================================================================
# WORKFLOW SCHEMAS
# =============================================================================

class CreateWorkflowFromTemplateRequest(BaseModel):
    """Request to create a workflow from a template."""
    template_id: UUID
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    configuration: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class CreateCustomWorkflowRequest(BaseModel):
    """Request to create a custom workflow."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    trigger_events: List[str] = Field(..., min_length=1)
    trigger_conditions: Optional[Dict[str, Any]] = None
    workflow_steps: List[WorkflowStepDefinition]
    configuration: Dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = Field(default=30, ge=5, le=300)
    rate_limit: Optional[int] = Field(None, ge=1, le=1000)
    is_active: bool = True


class UpdateWorkflowRequest(BaseModel):
    """Request to update a workflow."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    trigger_events: Optional[List[str]] = None
    trigger_conditions: Optional[Dict[str, Any]] = None
    workflow_steps: Optional[List[WorkflowStepDefinition]] = None
    configuration: Optional[Dict[str, Any]] = None
    timeout_seconds: Optional[int] = Field(None, ge=5, le=300)
    rate_limit: Optional[int] = Field(None, ge=1, le=1000)
    is_active: Optional[bool] = None


class WorkflowStepResponse(BaseModel):
    """Response for a workflow step."""
    step_id: UUID
    workflow_id: UUID
    step_order: int
    step_type: WorkflowStepType
    name: str
    description: Optional[str] = None
    configuration: Dict[str, Any]
    input_mapping: Optional[Dict[str, str]] = None
    output_mapping: Optional[Dict[str, str]] = None
    condition: Optional[Dict[str, Any]] = None
    continue_on_error: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowResponse(BaseModel):
    """Response for a webhook workflow."""
    workflow_id: UUID
    workspace_id: UUID
    name: str
    description: Optional[str] = None
    template_id: Optional[UUID] = None
    subscription_id: Optional[UUID] = None

    trigger_events: List[str]
    trigger_conditions: Optional[Dict[str, Any]] = None
    workflow_steps: List[WorkflowStepResponse]
    configuration: Dict[str, Any]

    retry_policy: Optional[Dict[str, Any]] = None
    timeout_seconds: int
    rate_limit: Optional[int] = None

    is_active: bool
    last_executed_at: Optional[datetime] = None
    execution_count: int = 0
    success_count: int = 0
    failure_count: int = 0

    created_by_user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowSummary(BaseModel):
    """Summary response for workflow listing."""
    workflow_id: UUID
    name: str
    description: Optional[str] = None
    template_id: Optional[UUID] = None
    trigger_events: List[str]
    is_active: bool
    last_executed_at: Optional[datetime] = None
    execution_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    success_rate: float = 0.0

    class Config:
        from_attributes = True


class WorkflowListResponse(BaseModel):
    """Paginated list of workflows."""
    workflows: List[WorkflowSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


# =============================================================================
# WORKFLOW EXECUTION SCHEMAS
# =============================================================================

class WorkflowStepResult(BaseModel):
    """Result from executing a workflow step."""
    step_id: UUID
    step_name: str
    status: str  # success, failed, skipped
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class WorkflowExecutionResponse(BaseModel):
    """Response for a workflow execution."""
    execution_id: UUID
    workflow_id: UUID
    workspace_id: UUID

    trigger_event_id: Optional[UUID] = None
    trigger_event_type: str
    trigger_payload: Optional[Dict[str, Any]] = None

    status: WorkflowExecutionStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None

    steps_completed: int = 0
    steps_total: int
    step_results: Optional[List[WorkflowStepResult]] = None

    error_message: Optional[str] = None
    error_step_id: Optional[UUID] = None
    retry_count: int = 0

    output: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowExecutionSummary(BaseModel):
    """Summary response for execution listing."""
    execution_id: UUID
    workflow_id: UUID
    trigger_event_type: str
    status: WorkflowExecutionStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    steps_completed: int = 0
    steps_total: int
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowExecutionListResponse(BaseModel):
    """Paginated list of workflow executions."""
    executions: List[WorkflowExecutionSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


# =============================================================================
# TEMPLATE USAGE SCHEMAS
# =============================================================================

class TemplateUsageAction(str, Enum):
    """Template usage action types."""
    VIEWED = "viewed"
    INSTALLED = "installed"
    REMOVED = "removed"
    RATED = "rated"


class RecordTemplateUsageRequest(BaseModel):
    """Request to record template usage."""
    template_id: UUID
    action: TemplateUsageAction
    workflow_id: Optional[UUID] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    feedback: Optional[str] = Field(None, max_length=1000)


class RateTemplateRequest(BaseModel):
    """Request to rate a template."""
    rating: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = Field(None, max_length=1000)


# =============================================================================
# WORKFLOW BUILDER SCHEMAS
# =============================================================================

class WorkflowBuilderNode(BaseModel):
    """Visual workflow builder node."""
    id: str
    type: WorkflowStepType
    position: Dict[str, float]  # x, y coordinates
    data: Dict[str, Any]  # node-specific data
    connections: List[str] = Field(default_factory=list)  # connected node IDs


class WorkflowBuilderEdge(BaseModel):
    """Visual workflow builder edge/connection."""
    id: str
    source: str  # source node ID
    target: str  # target node ID
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None


class WorkflowBuilderState(BaseModel):
    """Complete state of the visual workflow builder."""
    nodes: List[WorkflowBuilderNode]
    edges: List[WorkflowBuilderEdge]
    viewport: Optional[Dict[str, float]] = None  # x, y, zoom


class SaveWorkflowBuilderRequest(BaseModel):
    """Request to save workflow from visual builder."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    builder_state: WorkflowBuilderState
    configuration: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class ValidateWorkflowRequest(BaseModel):
    """Request to validate a workflow configuration."""
    builder_state: WorkflowBuilderState


class WorkflowValidationResult(BaseModel):
    """Result of workflow validation."""
    is_valid: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


# =============================================================================
# CATEGORY STATISTICS
# =============================================================================

class TemplateCategoryStats(BaseModel):
    """Statistics for a template category."""
    category: TemplateCategory
    total_templates: int
    featured_count: int
    total_usage: int


class TemplateStatsResponse(BaseModel):
    """Overall template statistics."""
    total_templates: int
    total_workflows: int
    categories: List[TemplateCategoryStats]
    top_templates: List[WebhookTemplateSummary]
    recent_workflows: List[WorkflowSummary]
