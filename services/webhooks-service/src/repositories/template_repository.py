"""Repository for webhook integration templates and workflows."""

import math
from datetime import datetime
from typing import Optional, List, Any
from uuid import UUID

from sqlalchemy import select, func, update, delete, and_, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from ..schemas.template import (
    TemplateCategory,
    IntegrationType,
    WorkflowExecutionStatus,
    TemplateUsageAction,
)


class TemplateRepository:
    """Repository for webhook integration templates."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_templates(
        self,
        category: Optional[TemplateCategory] = None,
        integration_type: Optional[IntegrationType] = None,
        provider: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        event_type: Optional[str] = None,
        featured_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[dict], int]:
        """Get paginated list of templates with optional filters."""

        # Build base query
        query = """
            SELECT
                template_id, slug, name, short_description, long_description,
                category, integration_type, tags, provider, provider_logo_url,
                provider_website, trigger_events, default_config, workflow_steps,
                sample_payload, required_fields, setup_instructions, use_cases,
                best_practices, documentation_url, usage_count, rating, rating_count,
                is_featured, is_premium, is_active, is_system, created_at, updated_at
            FROM webhook_integration_templates
            WHERE is_active = true
        """
        count_query = "SELECT COUNT(*) FROM webhook_integration_templates WHERE is_active = true"
        params: dict[str, Any] = {}

        # Add filters
        filters = []
        if category:
            filters.append("category = :category")
            params["category"] = category.value

        if integration_type:
            filters.append("integration_type = :integration_type")
            params["integration_type"] = integration_type.value

        if provider:
            filters.append("provider = :provider")
            params["provider"] = provider

        if tags:
            filters.append("tags && :tags")
            params["tags"] = tags

        if search:
            filters.append("(name ILIKE :search OR short_description ILIKE :search OR tags::text ILIKE :search)")
            params["search"] = f"%{search}%"

        if event_type:
            filters.append(":event_type = ANY(trigger_events)")
            params["event_type"] = event_type

        if featured_only:
            filters.append("is_featured = true")

        # Apply filters to queries
        if filters:
            filter_clause = " AND " + " AND ".join(filters)
            query += filter_clause
            count_query += filter_clause

        # Add ordering and pagination
        query += " ORDER BY is_featured DESC, usage_count DESC, name ASC"
        query += " LIMIT :limit OFFSET :offset"
        params["limit"] = page_size
        params["offset"] = (page - 1) * page_size

        # Execute queries
        from sqlalchemy import text

        result = await self.db.execute(text(query), params)
        templates = [dict(row._mapping) for row in result.fetchall()]

        count_result = await self.db.execute(text(count_query), params)
        total = count_result.scalar() or 0

        return templates, total

    async def get_template_by_id(self, template_id: UUID) -> Optional[dict]:
        """Get a template by ID."""
        from sqlalchemy import text

        query = """
            SELECT
                template_id, slug, name, short_description, long_description,
                category, integration_type, tags, provider, provider_logo_url,
                provider_website, trigger_events, default_config, workflow_steps,
                sample_payload, required_fields, setup_instructions, use_cases,
                best_practices, documentation_url, usage_count, rating, rating_count,
                is_featured, is_premium, is_active, is_system, created_at, updated_at
            FROM webhook_integration_templates
            WHERE template_id = :template_id AND is_active = true
        """

        result = await self.db.execute(text(query), {"template_id": template_id})
        row = result.fetchone()
        return dict(row._mapping) if row else None

    async def get_template_by_slug(self, slug: str) -> Optional[dict]:
        """Get a template by slug."""
        from sqlalchemy import text

        query = """
            SELECT
                template_id, slug, name, short_description, long_description,
                category, integration_type, tags, provider, provider_logo_url,
                provider_website, trigger_events, default_config, workflow_steps,
                sample_payload, required_fields, setup_instructions, use_cases,
                best_practices, documentation_url, usage_count, rating, rating_count,
                is_featured, is_premium, is_active, is_system, created_at, updated_at
            FROM webhook_integration_templates
            WHERE slug = :slug AND is_active = true
        """

        result = await self.db.execute(text(query), {"slug": slug})
        row = result.fetchone()
        return dict(row._mapping) if row else None

    async def increment_usage_count(self, template_id: UUID) -> None:
        """Increment the usage count for a template."""
        from sqlalchemy import text

        query = """
            UPDATE webhook_integration_templates
            SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE template_id = :template_id
        """
        await self.db.execute(text(query), {"template_id": template_id})
        await self.db.commit()

    async def update_template_rating(self, template_id: UUID, rating: int) -> None:
        """Update the rating for a template."""
        from sqlalchemy import text

        # Calculate new average rating
        query = """
            UPDATE webhook_integration_templates
            SET
                rating = (COALESCE(rating, 0) * rating_count + :rating) / (rating_count + 1),
                rating_count = rating_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE template_id = :template_id
        """
        await self.db.execute(text(query), {"template_id": template_id, "rating": rating})
        await self.db.commit()

    async def get_categories_with_counts(self) -> List[dict]:
        """Get all categories with template counts."""
        from sqlalchemy import text

        query = """
            SELECT
                category,
                COUNT(*) as total_templates,
                COUNT(*) FILTER (WHERE is_featured = true) as featured_count,
                SUM(usage_count) as total_usage
            FROM webhook_integration_templates
            WHERE is_active = true
            GROUP BY category
            ORDER BY total_templates DESC
        """

        result = await self.db.execute(text(query))
        return [dict(row._mapping) for row in result.fetchall()]

    async def get_featured_templates(self, limit: int = 5) -> List[dict]:
        """Get featured templates."""
        from sqlalchemy import text

        query = """
            SELECT
                template_id, slug, name, short_description, category,
                integration_type, tags, provider, provider_logo_url,
                trigger_events, usage_count, rating, is_featured, is_premium
            FROM webhook_integration_templates
            WHERE is_active = true AND is_featured = true
            ORDER BY usage_count DESC
            LIMIT :limit
        """

        result = await self.db.execute(text(query), {"limit": limit})
        return [dict(row._mapping) for row in result.fetchall()]


class WorkflowRepository:
    """Repository for webhook workflows."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_workflow(
        self,
        workspace_id: UUID,
        name: str,
        trigger_events: List[str],
        workflow_steps: List[dict],
        configuration: dict,
        description: Optional[str] = None,
        template_id: Optional[UUID] = None,
        subscription_id: Optional[UUID] = None,
        trigger_conditions: Optional[dict] = None,
        retry_policy: Optional[dict] = None,
        timeout_seconds: int = 30,
        rate_limit: Optional[int] = None,
        is_active: bool = True,
        created_by_user_id: Optional[UUID] = None,
    ) -> dict:
        """Create a new workflow."""
        from sqlalchemy import text
        import json

        query = """
            INSERT INTO webhook_workflows (
                workspace_id, name, description, template_id, subscription_id,
                trigger_events, trigger_conditions, workflow_steps, configuration,
                retry_policy, timeout_seconds, rate_limit, is_active, created_by_user_id
            ) VALUES (
                :workspace_id, :name, :description, :template_id, :subscription_id,
                :trigger_events, :trigger_conditions, :workflow_steps, :configuration,
                :retry_policy, :timeout_seconds, :rate_limit, :is_active, :created_by_user_id
            )
            RETURNING *
        """

        result = await self.db.execute(
            text(query),
            {
                "workspace_id": workspace_id,
                "name": name,
                "description": description,
                "template_id": template_id,
                "subscription_id": subscription_id,
                "trigger_events": trigger_events,
                "trigger_conditions": json.dumps(trigger_conditions) if trigger_conditions else None,
                "workflow_steps": json.dumps(workflow_steps),
                "configuration": json.dumps(configuration),
                "retry_policy": json.dumps(retry_policy) if retry_policy else None,
                "timeout_seconds": timeout_seconds,
                "rate_limit": rate_limit,
                "is_active": is_active,
                "created_by_user_id": created_by_user_id,
            },
        )
        await self.db.commit()

        row = result.fetchone()
        return dict(row._mapping)

    async def get_workflows(
        self,
        workspace_id: UUID,
        is_active: Optional[bool] = None,
        template_id: Optional[UUID] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[dict], int]:
        """Get paginated list of workflows for a workspace."""
        from sqlalchemy import text

        query = """
            SELECT
                workflow_id, workspace_id, name, description, template_id,
                subscription_id, trigger_events, trigger_conditions, workflow_steps,
                configuration, retry_policy, timeout_seconds, rate_limit,
                is_active, last_executed_at, execution_count, success_count,
                failure_count, created_by_user_id, created_at, updated_at
            FROM webhook_workflows
            WHERE workspace_id = :workspace_id
        """
        count_query = "SELECT COUNT(*) FROM webhook_workflows WHERE workspace_id = :workspace_id"
        params: dict[str, Any] = {"workspace_id": workspace_id}

        if is_active is not None:
            query += " AND is_active = :is_active"
            count_query += " AND is_active = :is_active"
            params["is_active"] = is_active

        if template_id:
            query += " AND template_id = :template_id"
            count_query += " AND template_id = :template_id"
            params["template_id"] = template_id

        query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
        params["limit"] = page_size
        params["offset"] = (page - 1) * page_size

        result = await self.db.execute(text(query), params)
        workflows = [dict(row._mapping) for row in result.fetchall()]

        count_result = await self.db.execute(text(count_query), params)
        total = count_result.scalar() or 0

        return workflows, total

    async def get_workflow_by_id(self, workflow_id: UUID, workspace_id: UUID) -> Optional[dict]:
        """Get a workflow by ID."""
        from sqlalchemy import text

        query = """
            SELECT
                workflow_id, workspace_id, name, description, template_id,
                subscription_id, trigger_events, trigger_conditions, workflow_steps,
                configuration, retry_policy, timeout_seconds, rate_limit,
                is_active, last_executed_at, execution_count, success_count,
                failure_count, created_by_user_id, created_at, updated_at
            FROM webhook_workflows
            WHERE workflow_id = :workflow_id AND workspace_id = :workspace_id
        """

        result = await self.db.execute(
            text(query),
            {"workflow_id": workflow_id, "workspace_id": workspace_id},
        )
        row = result.fetchone()
        return dict(row._mapping) if row else None

    async def update_workflow(
        self,
        workflow_id: UUID,
        workspace_id: UUID,
        **kwargs,
    ) -> Optional[dict]:
        """Update a workflow."""
        from sqlalchemy import text
        import json

        # Build SET clause dynamically
        set_clauses = []
        params: dict[str, Any] = {
            "workflow_id": workflow_id,
            "workspace_id": workspace_id,
        }

        field_mappings = {
            "name": "name",
            "description": "description",
            "trigger_events": "trigger_events",
            "trigger_conditions": "trigger_conditions",
            "workflow_steps": "workflow_steps",
            "configuration": "configuration",
            "retry_policy": "retry_policy",
            "timeout_seconds": "timeout_seconds",
            "rate_limit": "rate_limit",
            "is_active": "is_active",
        }

        json_fields = {"trigger_conditions", "workflow_steps", "configuration", "retry_policy"}

        for key, value in kwargs.items():
            if key in field_mappings and value is not None:
                set_clauses.append(f"{field_mappings[key]} = :{key}")
                if key in json_fields:
                    params[key] = json.dumps(value) if value else None
                else:
                    params[key] = value

        if not set_clauses:
            return await self.get_workflow_by_id(workflow_id, workspace_id)

        set_clauses.append("updated_at = CURRENT_TIMESTAMP")

        query = f"""
            UPDATE webhook_workflows
            SET {', '.join(set_clauses)}
            WHERE workflow_id = :workflow_id AND workspace_id = :workspace_id
            RETURNING *
        """

        result = await self.db.execute(text(query), params)
        await self.db.commit()

        row = result.fetchone()
        return dict(row._mapping) if row else None

    async def delete_workflow(self, workflow_id: UUID, workspace_id: UUID) -> bool:
        """Delete a workflow."""
        from sqlalchemy import text

        query = """
            DELETE FROM webhook_workflows
            WHERE workflow_id = :workflow_id AND workspace_id = :workspace_id
        """

        result = await self.db.execute(
            text(query),
            {"workflow_id": workflow_id, "workspace_id": workspace_id},
        )
        await self.db.commit()

        return result.rowcount > 0

    async def update_execution_stats(
        self,
        workflow_id: UUID,
        success: bool,
    ) -> None:
        """Update workflow execution statistics."""
        from sqlalchemy import text

        if success:
            query = """
                UPDATE webhook_workflows
                SET
                    execution_count = execution_count + 1,
                    success_count = success_count + 1,
                    last_executed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE workflow_id = :workflow_id
            """
        else:
            query = """
                UPDATE webhook_workflows
                SET
                    execution_count = execution_count + 1,
                    failure_count = failure_count + 1,
                    last_executed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE workflow_id = :workflow_id
            """

        await self.db.execute(text(query), {"workflow_id": workflow_id})
        await self.db.commit()

    async def get_workflows_by_event(
        self,
        workspace_id: UUID,
        event_type: str,
        is_active: bool = True,
    ) -> List[dict]:
        """Get active workflows that match a given event type."""
        from sqlalchemy import text

        query = """
            SELECT
                workflow_id, workspace_id, name, description, template_id,
                subscription_id, trigger_events, trigger_conditions, workflow_steps,
                configuration, retry_policy, timeout_seconds, rate_limit
            FROM webhook_workflows
            WHERE workspace_id = :workspace_id
              AND is_active = :is_active
              AND (:event_type = ANY(trigger_events) OR '*' = ANY(trigger_events))
        """

        result = await self.db.execute(
            text(query),
            {
                "workspace_id": workspace_id,
                "event_type": event_type,
                "is_active": is_active,
            },
        )
        return [dict(row._mapping) for row in result.fetchall()]


class WorkflowExecutionRepository:
    """Repository for workflow executions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_execution(
        self,
        workflow_id: UUID,
        workspace_id: UUID,
        trigger_event_type: str,
        steps_total: int,
        trigger_event_id: Optional[UUID] = None,
        trigger_payload: Optional[dict] = None,
    ) -> dict:
        """Create a new workflow execution record."""
        from sqlalchemy import text
        import json

        query = """
            INSERT INTO webhook_workflow_executions (
                workflow_id, workspace_id, trigger_event_id, trigger_event_type,
                trigger_payload, status, steps_total
            ) VALUES (
                :workflow_id, :workspace_id, :trigger_event_id, :trigger_event_type,
                :trigger_payload, 'pending', :steps_total
            )
            RETURNING *
        """

        result = await self.db.execute(
            text(query),
            {
                "workflow_id": workflow_id,
                "workspace_id": workspace_id,
                "trigger_event_id": trigger_event_id,
                "trigger_event_type": trigger_event_type,
                "trigger_payload": json.dumps(trigger_payload) if trigger_payload else None,
                "steps_total": steps_total,
            },
        )
        await self.db.commit()

        row = result.fetchone()
        return dict(row._mapping)

    async def update_execution(
        self,
        execution_id: UUID,
        **kwargs,
    ) -> Optional[dict]:
        """Update an execution record."""
        from sqlalchemy import text
        import json

        set_clauses = []
        params: dict[str, Any] = {"execution_id": execution_id}

        field_mappings = {
            "status": "status",
            "started_at": "started_at",
            "completed_at": "completed_at",
            "duration_ms": "duration_ms",
            "steps_completed": "steps_completed",
            "step_results": "step_results",
            "error_message": "error_message",
            "error_step_id": "error_step_id",
            "retry_count": "retry_count",
            "output": "output",
        }

        json_fields = {"step_results", "output"}

        for key, value in kwargs.items():
            if key in field_mappings:
                set_clauses.append(f"{field_mappings[key]} = :{key}")
                if key in json_fields and value is not None:
                    params[key] = json.dumps(value)
                else:
                    params[key] = value

        if not set_clauses:
            return None

        query = f"""
            UPDATE webhook_workflow_executions
            SET {', '.join(set_clauses)}
            WHERE execution_id = :execution_id
            RETURNING *
        """

        result = await self.db.execute(text(query), params)
        await self.db.commit()

        row = result.fetchone()
        return dict(row._mapping) if row else None

    async def get_executions(
        self,
        workspace_id: UUID,
        workflow_id: Optional[UUID] = None,
        status: Optional[WorkflowExecutionStatus] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[dict], int]:
        """Get paginated list of executions."""
        from sqlalchemy import text

        query = """
            SELECT
                execution_id, workflow_id, workspace_id, trigger_event_id,
                trigger_event_type, trigger_payload, status, started_at,
                completed_at, duration_ms, steps_completed, steps_total,
                step_results, error_message, error_step_id, retry_count,
                output, created_at
            FROM webhook_workflow_executions
            WHERE workspace_id = :workspace_id
        """
        count_query = "SELECT COUNT(*) FROM webhook_workflow_executions WHERE workspace_id = :workspace_id"
        params: dict[str, Any] = {"workspace_id": workspace_id}

        if workflow_id:
            query += " AND workflow_id = :workflow_id"
            count_query += " AND workflow_id = :workflow_id"
            params["workflow_id"] = workflow_id

        if status:
            query += " AND status = :status"
            count_query += " AND status = :status"
            params["status"] = status.value

        query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
        params["limit"] = page_size
        params["offset"] = (page - 1) * page_size

        result = await self.db.execute(text(query), params)
        executions = [dict(row._mapping) for row in result.fetchall()]

        count_result = await self.db.execute(text(count_query), params)
        total = count_result.scalar() or 0

        return executions, total

    async def get_execution_by_id(
        self,
        execution_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict]:
        """Get an execution by ID."""
        from sqlalchemy import text

        query = """
            SELECT
                execution_id, workflow_id, workspace_id, trigger_event_id,
                trigger_event_type, trigger_payload, status, started_at,
                completed_at, duration_ms, steps_completed, steps_total,
                step_results, error_message, error_step_id, retry_count,
                output, created_at
            FROM webhook_workflow_executions
            WHERE execution_id = :execution_id AND workspace_id = :workspace_id
        """

        result = await self.db.execute(
            text(query),
            {"execution_id": execution_id, "workspace_id": workspace_id},
        )
        row = result.fetchone()
        return dict(row._mapping) if row else None


class TemplateUsageRepository:
    """Repository for template usage tracking."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_usage(
        self,
        template_id: UUID,
        workspace_id: UUID,
        action: TemplateUsageAction,
        workflow_id: Optional[UUID] = None,
        rating: Optional[int] = None,
        feedback: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> dict:
        """Record template usage."""
        from sqlalchemy import text

        query = """
            INSERT INTO webhook_template_usage (
                template_id, workspace_id, action, workflow_id,
                rating, feedback, user_id
            ) VALUES (
                :template_id, :workspace_id, :action, :workflow_id,
                :rating, :feedback, :user_id
            )
            RETURNING *
        """

        result = await self.db.execute(
            text(query),
            {
                "template_id": template_id,
                "workspace_id": workspace_id,
                "action": action.value,
                "workflow_id": workflow_id,
                "rating": rating,
                "feedback": feedback,
                "user_id": user_id,
            },
        )
        await self.db.commit()

        row = result.fetchone()
        return dict(row._mapping)

    async def get_usage_stats(
        self,
        template_id: UUID,
    ) -> dict:
        """Get usage statistics for a template."""
        from sqlalchemy import text

        query = """
            SELECT
                COUNT(*) as total_usage,
                COUNT(*) FILTER (WHERE action = 'installed') as installs,
                COUNT(*) FILTER (WHERE action = 'viewed') as views,
                AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating,
                COUNT(rating) as rating_count
            FROM webhook_template_usage
            WHERE template_id = :template_id
        """

        result = await self.db.execute(text(query), {"template_id": template_id})
        row = result.fetchone()
        return dict(row._mapping) if row else {}
