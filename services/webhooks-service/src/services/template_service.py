"""Service layer for webhook integration templates and workflows."""

import math
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories.template_repository import (
    TemplateRepository,
    WorkflowRepository,
    WorkflowExecutionRepository,
    TemplateUsageRepository,
)
from ..schemas.template import (
    TemplateCategory,
    IntegrationType,
    WorkflowStepType,
    WorkflowExecutionStatus,
    TemplateUsageAction,
    TemplateFilterParams,
    CreateWorkflowFromTemplateRequest,
    CreateCustomWorkflowRequest,
    UpdateWorkflowRequest,
    WorkflowBuilderState,
    WorkflowValidationResult,
    WorkflowStepDefinition,
)


logger = logging.getLogger(__name__)


class TemplateService:
    """Service for managing webhook integration templates."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.template_repo = TemplateRepository(db)
        self.usage_repo = TemplateUsageRepository(db)

    async def list_templates(
        self,
        params: TemplateFilterParams,
    ) -> Dict[str, Any]:
        """List templates with optional filters."""
        templates, total = await self.template_repo.get_templates(
            category=params.category,
            integration_type=params.integration_type,
            provider=params.provider,
            tags=params.tags,
            search=params.search,
            event_type=params.event_type,
            featured_only=params.featured_only,
            page=params.page,
            page_size=params.page_size,
        )

        total_pages = math.ceil(total / params.page_size) if total > 0 else 1

        return {
            "templates": templates,
            "total": total,
            "page": params.page,
            "page_size": params.page_size,
            "total_pages": total_pages,
        }

    async def get_template(self, template_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a template by ID."""
        return await self.template_repo.get_template_by_id(template_id)

    async def get_template_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """Get a template by slug."""
        return await self.template_repo.get_template_by_slug(slug)

    async def get_featured_templates(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Get featured templates."""
        return await self.template_repo.get_featured_templates(limit)

    async def get_template_categories(self) -> List[Dict[str, Any]]:
        """Get all template categories with counts."""
        return await self.template_repo.get_categories_with_counts()

    async def record_template_view(
        self,
        template_id: UUID,
        workspace_id: UUID,
        user_id: Optional[UUID] = None,
    ) -> None:
        """Record that a template was viewed."""
        await self.usage_repo.record_usage(
            template_id=template_id,
            workspace_id=workspace_id,
            action=TemplateUsageAction.VIEWED,
            user_id=user_id,
        )

    async def rate_template(
        self,
        template_id: UUID,
        workspace_id: UUID,
        rating: int,
        feedback: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> None:
        """Rate a template."""
        await self.usage_repo.record_usage(
            template_id=template_id,
            workspace_id=workspace_id,
            action=TemplateUsageAction.RATED,
            rating=rating,
            feedback=feedback,
            user_id=user_id,
        )

        # Update template rating
        await self.template_repo.update_template_rating(template_id, rating)


class WorkflowService:
    """Service for managing webhook workflows."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.workflow_repo = WorkflowRepository(db)
        self.template_repo = TemplateRepository(db)
        self.execution_repo = WorkflowExecutionRepository(db)
        self.usage_repo = TemplateUsageRepository(db)

    async def create_from_template(
        self,
        workspace_id: UUID,
        request: CreateWorkflowFromTemplateRequest,
        user_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Create a workflow from a template."""
        # Get the template
        template = await self.template_repo.get_template_by_id(request.template_id)
        if not template:
            raise ValueError(f"Template {request.template_id} not found")

        # Merge template config with user configuration
        configuration = {**template.get("default_config", {}), **request.configuration}

        # Create the workflow
        workflow = await self.workflow_repo.create_workflow(
            workspace_id=workspace_id,
            name=request.name,
            description=request.description,
            template_id=request.template_id,
            trigger_events=template["trigger_events"],
            workflow_steps=template.get("workflow_steps", []),
            configuration=configuration,
            is_active=request.is_active,
            created_by_user_id=user_id,
        )

        # Track template usage
        await self.usage_repo.record_usage(
            template_id=request.template_id,
            workspace_id=workspace_id,
            action=TemplateUsageAction.INSTALLED,
            workflow_id=workflow["workflow_id"],
            user_id=user_id,
        )

        # Increment template usage count
        await self.template_repo.increment_usage_count(request.template_id)

        return workflow

    async def create_custom(
        self,
        workspace_id: UUID,
        request: CreateCustomWorkflowRequest,
        user_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Create a custom workflow."""
        # Convert workflow steps to dicts
        workflow_steps = [step.model_dump() for step in request.workflow_steps]

        workflow = await self.workflow_repo.create_workflow(
            workspace_id=workspace_id,
            name=request.name,
            description=request.description,
            trigger_events=request.trigger_events,
            trigger_conditions=request.trigger_conditions,
            workflow_steps=workflow_steps,
            configuration=request.configuration,
            timeout_seconds=request.timeout_seconds,
            rate_limit=request.rate_limit,
            is_active=request.is_active,
            created_by_user_id=user_id,
        )

        return workflow

    async def create_from_builder(
        self,
        workspace_id: UUID,
        name: str,
        builder_state: WorkflowBuilderState,
        description: Optional[str] = None,
        configuration: Dict[str, Any] = None,
        is_active: bool = True,
        user_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Create a workflow from the visual workflow builder."""
        # Validate the workflow
        validation = await self.validate_workflow(builder_state)
        if not validation.is_valid:
            raise ValueError(f"Invalid workflow: {', '.join(validation.errors)}")

        # Convert builder state to workflow steps
        workflow_steps, trigger_events = self._convert_builder_to_steps(builder_state)

        workflow = await self.workflow_repo.create_workflow(
            workspace_id=workspace_id,
            name=name,
            description=description,
            trigger_events=trigger_events,
            workflow_steps=workflow_steps,
            configuration=configuration or {},
            is_active=is_active,
            created_by_user_id=user_id,
        )

        return workflow

    async def list_workflows(
        self,
        workspace_id: UUID,
        is_active: Optional[bool] = None,
        template_id: Optional[UUID] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """List workflows for a workspace."""
        workflows, total = await self.workflow_repo.get_workflows(
            workspace_id=workspace_id,
            is_active=is_active,
            template_id=template_id,
            page=page,
            page_size=page_size,
        )

        # Calculate success rate for each workflow
        for workflow in workflows:
            exec_count = workflow.get("execution_count", 0)
            success_count = workflow.get("success_count", 0)
            workflow["success_rate"] = (
                (success_count / exec_count * 100) if exec_count > 0 else 0.0
            )

        total_pages = math.ceil(total / page_size) if total > 0 else 1

        return {
            "workflows": workflows,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    async def get_workflow(
        self,
        workflow_id: UUID,
        workspace_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Get a workflow by ID."""
        return await self.workflow_repo.get_workflow_by_id(workflow_id, workspace_id)

    async def update_workflow(
        self,
        workflow_id: UUID,
        workspace_id: UUID,
        request: UpdateWorkflowRequest,
    ) -> Optional[Dict[str, Any]]:
        """Update a workflow."""
        update_data = request.model_dump(exclude_unset=True)

        # Convert workflow steps if provided
        if "workflow_steps" in update_data and update_data["workflow_steps"]:
            update_data["workflow_steps"] = [
                step.model_dump() if hasattr(step, "model_dump") else step
                for step in update_data["workflow_steps"]
            ]

        return await self.workflow_repo.update_workflow(
            workflow_id=workflow_id,
            workspace_id=workspace_id,
            **update_data,
        )

    async def delete_workflow(
        self,
        workflow_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a workflow."""
        # Get workflow to check template
        workflow = await self.workflow_repo.get_workflow_by_id(workflow_id, workspace_id)
        if workflow and workflow.get("template_id"):
            # Track template removal
            await self.usage_repo.record_usage(
                template_id=workflow["template_id"],
                workspace_id=workspace_id,
                action=TemplateUsageAction.REMOVED,
            )

        return await self.workflow_repo.delete_workflow(workflow_id, workspace_id)

    async def toggle_workflow(
        self,
        workflow_id: UUID,
        workspace_id: UUID,
        is_active: bool,
    ) -> Optional[Dict[str, Any]]:
        """Toggle workflow active status."""
        return await self.workflow_repo.update_workflow(
            workflow_id=workflow_id,
            workspace_id=workspace_id,
            is_active=is_active,
        )

    async def validate_workflow(
        self,
        builder_state: WorkflowBuilderState,
    ) -> WorkflowValidationResult:
        """Validate a workflow from the visual builder."""
        errors: List[str] = []
        warnings: List[str] = []

        nodes = builder_state.nodes
        edges = builder_state.edges

        # Check for at least one trigger node
        trigger_nodes = [n for n in nodes if n.type == WorkflowStepType.TRIGGER]
        if not trigger_nodes:
            errors.append("Workflow must have at least one trigger node")

        # Check for at least one action node
        action_nodes = [
            n for n in nodes
            if n.type in [WorkflowStepType.HTTP_REQUEST, WorkflowStepType.TRANSFORM]
        ]
        if not action_nodes:
            errors.append("Workflow must have at least one action node")

        # Check that all nodes are connected
        connected_nodes = set()
        for edge in edges:
            connected_nodes.add(edge.source)
            connected_nodes.add(edge.target)

        orphan_nodes = [n for n in nodes if n.id not in connected_nodes and len(nodes) > 1]
        if orphan_nodes:
            warnings.append(f"Some nodes are not connected: {[n.data.get('name', n.id) for n in orphan_nodes]}")

        # Validate node data
        for node in nodes:
            if not node.data.get("name"):
                errors.append(f"Node {node.id} is missing a name")

            if node.type == WorkflowStepType.HTTP_REQUEST:
                if not node.data.get("url") and not node.data.get("url_variable"):
                    errors.append(f"HTTP request node '{node.data.get('name', node.id)}' is missing URL")

            if node.type == WorkflowStepType.TRIGGER:
                if not node.data.get("event"):
                    errors.append(f"Trigger node '{node.data.get('name', node.id)}' is missing event type")

        return WorkflowValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    def _convert_builder_to_steps(
        self,
        builder_state: WorkflowBuilderState,
    ) -> tuple[List[Dict[str, Any]], List[str]]:
        """Convert visual builder state to workflow steps."""
        nodes = builder_state.nodes
        edges = builder_state.edges

        # Build adjacency list
        adjacency: Dict[str, List[str]] = {}
        for edge in edges:
            if edge.source not in adjacency:
                adjacency[edge.source] = []
            adjacency[edge.source].append(edge.target)

        # Find trigger nodes
        trigger_nodes = [n for n in nodes if n.type == WorkflowStepType.TRIGGER]
        trigger_events = []
        for trigger in trigger_nodes:
            event = trigger.data.get("event")
            if event:
                trigger_events.append(event)

        # Topological sort starting from triggers
        visited: set = set()
        steps: List[Dict[str, Any]] = []
        step_order = 0

        def visit(node_id: str):
            nonlocal step_order
            if node_id in visited:
                return
            visited.add(node_id)

            # Find the node
            node = next((n for n in nodes if n.id == node_id), None)
            if not node:
                return

            # Skip trigger nodes (they become events)
            if node.type != WorkflowStepType.TRIGGER:
                step_order += 1
                steps.append({
                    "type": node.type.value,
                    "name": node.data.get("name", f"Step {step_order}"),
                    "description": node.data.get("description"),
                    "config": node.data.get("config", {}),
                    "step_order": step_order,
                })

            # Visit connected nodes
            for next_id in adjacency.get(node_id, []):
                visit(next_id)

        # Start from triggers
        for trigger in trigger_nodes:
            visit(trigger.id)

        return steps, trigger_events

    async def get_workflows_for_event(
        self,
        workspace_id: UUID,
        event_type: str,
    ) -> List[Dict[str, Any]]:
        """Get active workflows that should be triggered by an event."""
        return await self.workflow_repo.get_workflows_by_event(
            workspace_id=workspace_id,
            event_type=event_type,
            is_active=True,
        )


class WorkflowExecutionService:
    """Service for managing workflow executions."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.execution_repo = WorkflowExecutionRepository(db)
        self.workflow_repo = WorkflowRepository(db)

    async def create_execution(
        self,
        workflow_id: UUID,
        workspace_id: UUID,
        trigger_event_type: str,
        steps_total: int,
        trigger_event_id: Optional[UUID] = None,
        trigger_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a new execution record."""
        return await self.execution_repo.create_execution(
            workflow_id=workflow_id,
            workspace_id=workspace_id,
            trigger_event_type=trigger_event_type,
            steps_total=steps_total,
            trigger_event_id=trigger_event_id,
            trigger_payload=trigger_payload,
        )

    async def start_execution(
        self,
        execution_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Mark execution as started."""
        return await self.execution_repo.update_execution(
            execution_id=execution_id,
            status=WorkflowExecutionStatus.RUNNING.value,
            started_at=datetime.utcnow(),
        )

    async def complete_execution(
        self,
        execution_id: UUID,
        workflow_id: UUID,
        success: bool,
        steps_completed: int,
        step_results: List[Dict[str, Any]],
        output: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
        error_step_id: Optional[UUID] = None,
    ) -> Optional[Dict[str, Any]]:
        """Mark execution as completed."""
        now = datetime.utcnow()

        # Get the execution to calculate duration
        execution = await self.execution_repo.get_execution_by_id(
            execution_id, UUID("00000000-0000-0000-0000-000000000000")  # dummy workspace ID
        )

        duration_ms = None
        if execution and execution.get("started_at"):
            started_at = execution["started_at"]
            if isinstance(started_at, str):
                started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            duration_ms = int((now - started_at).total_seconds() * 1000)

        status = WorkflowExecutionStatus.COMPLETED if success else WorkflowExecutionStatus.FAILED

        result = await self.execution_repo.update_execution(
            execution_id=execution_id,
            status=status.value,
            completed_at=now,
            duration_ms=duration_ms,
            steps_completed=steps_completed,
            step_results=step_results,
            output=output,
            error_message=error_message,
            error_step_id=error_step_id,
        )

        # Update workflow statistics
        await self.workflow_repo.update_execution_stats(workflow_id, success)

        return result

    async def list_executions(
        self,
        workspace_id: UUID,
        workflow_id: Optional[UUID] = None,
        status: Optional[WorkflowExecutionStatus] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """List executions for a workspace."""
        executions, total = await self.execution_repo.get_executions(
            workspace_id=workspace_id,
            workflow_id=workflow_id,
            status=status,
            page=page,
            page_size=page_size,
        )

        total_pages = math.ceil(total / page_size) if total > 0 else 1

        return {
            "executions": executions,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    async def get_execution(
        self,
        execution_id: UUID,
        workspace_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Get an execution by ID."""
        return await self.execution_repo.get_execution_by_id(execution_id, workspace_id)
