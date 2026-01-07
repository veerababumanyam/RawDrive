"""Repository for notification templates data operations.

This module provides the TemplateRepository class that handles all CRUD
operations for notification templates, with proper workspace isolation
for multi-tenant security.

Features:
- System templates (workspace_id = NULL) available to all workspaces
- Workspace-specific custom templates
- Template versioning for audit trails
- Multi-channel content support (email, SMS, push, in-app)
- Redis caching for high-performance template lookups

All queries enforce workspace_id filtering to ensure data isolation
between tenants. System templates are accessible to all workspaces.

Feature: Notifications & Communication Microservice
Task: T020 - Create template_repository.py
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

import asyncpg

from src.cache.redis_client import (
    build_template_cache_key,
    build_template_list_cache_key,
    invalidate_template_cache,
    redis_client,
)
from src.database import fetch, fetchrow, fetchval, get_connection, transaction
from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    NotificationPriority,
    PaginationMeta,
)
from src.schemas.template import (
    EmailContent,
    InAppContent,
    PushContent,
    SMSContent,
    TemplateResponse,
    TemplateStatus,
    TemplateSummary,
)

logger = logging.getLogger(__name__)

# Cache TTL in seconds
TEMPLATE_CACHE_TTL = 600  # 10 minutes
TEMPLATE_LIST_CACHE_TTL = 300  # 5 minutes


class TemplateRepository:
    """Data access layer for notification templates.

    This repository handles all CRUD operations for notification templates,
    ensuring proper workspace isolation for multi-tenant security.

    System templates (workspace_id = NULL) are accessible to all workspaces.
    Workspace-specific templates override system templates with the same code.

    Templates are cached in Redis for fast lookups during notification
    processing. Cache is invalidated on any update.

    All methods that access data require workspace_id to enforce
    tenant isolation at the data layer.
    """

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create_template(
        self,
        code: str,
        name: str,
        category: NotificationCategory,
        workspace_id: Optional[UUID] = None,
        description: Optional[str] = None,
        supported_channels: Optional[list[NotificationChannel]] = None,
        status: TemplateStatus = TemplateStatus.DRAFT,
        email: Optional[EmailContent] = None,
        sms: Optional[SMSContent] = None,
        push: Optional[PushContent] = None,
        in_app: Optional[InAppContent] = None,
        variable_schema: Optional[dict[str, Any]] = None,
        default_values: Optional[dict[str, Any]] = None,
        default_language: str = "en",
        localized_content: Optional[dict[str, Any]] = None,
        version: str = "1.0.0",
        previous_version_id: Optional[UUID] = None,
        default_priority: NotificationPriority = NotificationPriority.NORMAL,
        is_transactional: bool = False,
        ttl_seconds: Optional[int] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        created_by_user_id: Optional[UUID] = None,
    ) -> TemplateResponse:
        """Create a new notification template.

        Args:
            code: Unique template code (e.g., 'gallery.published')
            name: Human-readable template name
            category: Notification category this template belongs to
            workspace_id: Workspace ID (None for system templates)
            description: Template description for admin purposes
            supported_channels: Channels this template supports
            status: Template lifecycle status (default draft)
            email: Email template content
            sms: SMS template content
            push: Push notification template content
            in_app: In-app notification template content
            variable_schema: Schema defining required/optional variables
            default_values: Default values for optional variables
            default_language: Default language code (ISO 639-1)
            localized_content: Localized content overrides by language
            version: Semantic version (e.g., '1.0.0')
            previous_version_id: Reference to previous version for versioning
            default_priority: Default priority for notifications
            is_transactional: If true, users cannot opt out
            ttl_seconds: Time-to-live in seconds
            tags: Tags for filtering and categorization
            metadata: Additional metadata
            created_by_user_id: User who created the template

        Returns:
            Created template as TemplateResponse

        Raises:
            asyncpg.UniqueViolationError: If template code+workspace+version exists
        """
        template_id = uuid4()
        now = datetime.now(timezone.utc)

        # Default to email channel if not specified
        if supported_channels is None:
            supported_channels = [NotificationChannel.EMAIL]

        # Convert channels to database array format
        channels_db = [c.value for c in supported_channels]

        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO notification_templates (
                    template_id, workspace_id, code, name, description,
                    category, supported_channels, status,
                    email_subject, email_html, email_text, email_from_name, email_reply_to,
                    sms_content,
                    push_title, push_body, push_action_url, push_icon_url,
                    in_app_title, in_app_body, in_app_action_url, in_app_icon,
                    variable_schema, default_values,
                    default_language, localized_content,
                    version, previous_version_id,
                    default_priority, is_transactional, ttl_seconds,
                    tags, metadata,
                    created_by_user_id, updated_by_user_id,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                    $31, $32, $33, $34, $35, $36, $37
                )
                RETURNING *
                """,
                template_id,
                workspace_id,
                code,
                name,
                description,
                category.value,
                channels_db,
                status.value,
                email.subject if email else None,
                email.html if email else None,
                email.text if email else None,
                email.from_name if email else None,
                email.reply_to if email else None,
                sms.content if sms else None,
                push.title if push else None,
                push.body if push else None,
                push.action_url if push else None,
                push.icon_url if push else None,
                in_app.title if in_app else None,
                in_app.body if in_app else None,
                in_app.action_url if in_app else None,
                in_app.icon if in_app else None,
                json.dumps(variable_schema or {"required": [], "optional": []}),
                json.dumps(default_values or {}),
                default_language,
                json.dumps(localized_content or {}),
                version,
                previous_version_id,
                default_priority.value,
                is_transactional,
                ttl_seconds,
                tags or [],
                json.dumps(metadata or {}),
                created_by_user_id,
                created_by_user_id,  # updated_by = created_by initially
                now,
                now,
            )

            return self._row_to_template_response(row)

    async def create_template_version(
        self,
        workspace_id: Optional[UUID],
        original_template_id: UUID,
        version: str,
        email: Optional[EmailContent] = None,
        sms: Optional[SMSContent] = None,
        push: Optional[PushContent] = None,
        in_app: Optional[InAppContent] = None,
        variable_schema: Optional[dict[str, Any]] = None,
        default_values: Optional[dict[str, Any]] = None,
        localized_content: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
        updated_by_user_id: Optional[UUID] = None,
    ) -> Optional[TemplateResponse]:
        """Create a new version of an existing template.

        Copies the original template and creates a new version with
        the specified changes. The original template is linked as
        previous_version_id.

        Args:
            workspace_id: Workspace ID for tenant isolation
            original_template_id: Template to create new version from
            version: New semantic version (must be higher than current)
            email: Updated email content (or None to keep original)
            sms: Updated SMS content (or None to keep original)
            push: Updated push content (or None to keep original)
            in_app: Updated in-app content (or None to keep original)
            variable_schema: Updated variable schema (or None to keep original)
            default_values: Updated default values (or None to keep original)
            localized_content: Updated localized content (or None to keep original)
            metadata: Updated metadata (or None to keep original)
            updated_by_user_id: User creating the new version

        Returns:
            New template version as TemplateResponse or None if original not found
        """
        # Get original template
        original = await self.get_template(workspace_id, original_template_id)
        if not original:
            return None

        # Create new version with original values as defaults
        return await self.create_template(
            code=original.code,
            name=original.name,
            category=original.category,
            workspace_id=workspace_id,
            description=original.description,
            supported_channels=original.supported_channels,
            status=TemplateStatus.DRAFT,  # New versions start as draft
            email=email or original.email,
            sms=sms or original.sms,
            push=push or original.push,
            in_app=in_app or original.in_app,
            variable_schema=variable_schema or original.variable_schema,
            default_values=default_values or original.default_values,
            default_language=original.default_language,
            localized_content=localized_content or original.localized_content,
            version=version,
            previous_version_id=original_template_id,
            default_priority=original.default_priority,
            is_transactional=original.is_transactional,
            ttl_seconds=original.ttl_seconds,
            tags=original.tags,
            metadata=metadata or original.metadata,
            created_by_user_id=updated_by_user_id,
        )

    async def clone_template(
        self,
        source_workspace_id: Optional[UUID],
        source_template_id: UUID,
        new_code: str,
        target_workspace_id: Optional[UUID] = None,
        new_name: Optional[str] = None,
        created_by_user_id: Optional[UUID] = None,
    ) -> Optional[TemplateResponse]:
        """Clone an existing template with a new code.

        Args:
            source_workspace_id: Source workspace ID
            source_template_id: Template to clone
            new_code: Code for the cloned template
            target_workspace_id: Target workspace (None = same as source)
            new_name: Name for cloned template (default: original + ' (Copy)')
            created_by_user_id: User performing the clone

        Returns:
            Cloned template as TemplateResponse or None if source not found
        """
        # Get source template
        source = await self.get_template(source_workspace_id, source_template_id)
        if not source:
            return None

        # Use target workspace or same as source
        target_ws = target_workspace_id if target_workspace_id is not None else source_workspace_id

        return await self.create_template(
            code=new_code,
            name=new_name or f"{source.name} (Copy)",
            category=source.category,
            workspace_id=target_ws,
            description=source.description,
            supported_channels=source.supported_channels,
            status=TemplateStatus.DRAFT,  # Clones start as draft
            email=source.email,
            sms=source.sms,
            push=source.push,
            in_app=source.in_app,
            variable_schema=source.variable_schema,
            default_values=source.default_values,
            default_language=source.default_language,
            localized_content=source.localized_content,
            version="1.0.0",  # Reset version for clone
            previous_version_id=None,  # No version chain for clones
            default_priority=source.default_priority,
            is_transactional=source.is_transactional,
            ttl_seconds=source.ttl_seconds,
            tags=source.tags,
            metadata=source.metadata,
            created_by_user_id=created_by_user_id,
        )

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_template(
        self,
        workspace_id: Optional[UUID],
        template_id: UUID,
        use_cache: bool = True,
    ) -> Optional[TemplateResponse]:
        """Get a template by ID with workspace isolation.

        Args:
            workspace_id: Workspace ID (None for system templates)
            template_id: Template ID to retrieve
            use_cache: Whether to use Redis cache (default True)

        Returns:
            Template as TemplateResponse or None if not found
        """
        # Check cache first
        if use_cache:
            cache_key = build_template_cache_key(str(template_id))
            cached = await redis_client.get_json(cache_key)
            if cached is not None:
                logger.debug(f"Template cache HIT for {template_id}")
                return TemplateResponse(**cached)

        # Query database - template must belong to workspace or be a system template
        if workspace_id:
            row = await fetchrow(
                """
                SELECT * FROM notification_templates
                WHERE template_id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)
                """,
                template_id,
                workspace_id,
                read_only=True,
            )
        else:
            # For system templates or admin access
            row = await fetchrow(
                """
                SELECT * FROM notification_templates
                WHERE template_id = $1
                """,
                template_id,
                read_only=True,
            )

        if row:
            template = self._row_to_template_response(row)
            # Cache the result
            if use_cache:
                cache_key = build_template_cache_key(str(template_id))
                await redis_client.set_json(
                    cache_key,
                    template.model_dump(mode="json"),
                    TEMPLATE_CACHE_TTL,
                )
            return template

        return None

    async def get_template_by_code(
        self,
        workspace_id: Optional[UUID],
        code: str,
        status: Optional[TemplateStatus] = None,
        use_cache: bool = True,
    ) -> Optional[TemplateResponse]:
        """Get a template by code.

        Workspace-specific templates take precedence over system templates.
        If status is not specified, returns the active version.

        Args:
            workspace_id: Workspace ID for tenant isolation
            code: Template code to lookup
            status: Optional status filter (default: active)
            use_cache: Whether to use Redis cache (default True)

        Returns:
            Template as TemplateResponse or None if not found
        """
        # Check cache first (only for default active status)
        if use_cache and status is None and workspace_id:
            cache_key = f"template:code:{workspace_id}:{code}"
            cached = await redis_client.get_json(cache_key)
            if cached is not None:
                logger.debug(f"Template code cache HIT for {code}")
                return TemplateResponse(**cached)

        # Default to active status
        target_status = status.value if status else "active"

        # Query - prefer workspace template over system template
        row = await fetchrow(
            """
            SELECT * FROM notification_templates
            WHERE code = $1 AND status = $2
              AND (workspace_id = $3 OR workspace_id IS NULL)
            ORDER BY
                CASE WHEN workspace_id = $3 THEN 0 ELSE 1 END,
                version DESC
            LIMIT 1
            """,
            code,
            target_status,
            workspace_id,
            read_only=True,
        )

        if row:
            template = self._row_to_template_response(row)
            # Cache the result (only for default active status)
            if use_cache and status is None and workspace_id:
                cache_key = f"template:code:{workspace_id}:{code}"
                await redis_client.set_json(
                    cache_key,
                    template.model_dump(mode="json"),
                    TEMPLATE_CACHE_TTL,
                )
            return template

        return None

    async def get_active_template(
        self,
        workspace_id: Optional[UUID],
        code: str,
    ) -> Optional[TemplateResponse]:
        """Get the active template for a code (shortcut method).

        Args:
            workspace_id: Workspace ID
            code: Template code

        Returns:
            Active template or None
        """
        return await self.get_template_by_code(
            workspace_id=workspace_id,
            code=code,
            status=TemplateStatus.ACTIVE,
        )

    async def list_templates(
        self,
        workspace_id: Optional[UUID],
        page: int = 1,
        limit: int = 20,
        status: Optional[TemplateStatus] = None,
        category: Optional[NotificationCategory] = None,
        channel: Optional[NotificationChannel] = None,
        tags: Optional[list[str]] = None,
        is_transactional: Optional[bool] = None,
        include_system: bool = True,
        search_query: Optional[str] = None,
    ) -> tuple[list[TemplateSummary], PaginationMeta]:
        """List notification templates for a workspace with filtering.

        Args:
            workspace_id: Workspace ID for tenant isolation
            page: Page number (1-indexed)
            limit: Number of items per page (max 100)
            status: Optional status filter
            category: Optional category filter
            channel: Optional channel filter (templates supporting this channel)
            tags: Optional tags filter (any match)
            is_transactional: Optional transactional flag filter
            include_system: Include system templates in results (default True)
            search_query: Search in code, name, description

        Returns:
            Tuple of (list of TemplateSummary, PaginationMeta)
        """
        offset = (page - 1) * limit

        # Build dynamic query
        conditions = []
        params: list[Any] = []
        param_idx = 1

        # Workspace filter
        if workspace_id:
            if include_system:
                conditions.append(f"(workspace_id = ${param_idx} OR workspace_id IS NULL)")
            else:
                conditions.append(f"workspace_id = ${param_idx}")
            params.append(workspace_id)
            param_idx += 1
        else:
            # Only system templates
            conditions.append("workspace_id IS NULL")

        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status.value)
            param_idx += 1

        if category:
            conditions.append(f"category = ${param_idx}")
            params.append(category.value)
            param_idx += 1

        if channel:
            conditions.append(f"${param_idx} = ANY(supported_channels)")
            params.append(channel.value)
            param_idx += 1

        if tags:
            conditions.append(f"tags && ${param_idx}::text[]")
            params.append(tags)
            param_idx += 1

        if is_transactional is not None:
            conditions.append(f"is_transactional = ${param_idx}")
            params.append(is_transactional)
            param_idx += 1

        if search_query:
            conditions.append(
                f"(code ILIKE ${param_idx} OR name ILIKE ${param_idx} OR description ILIKE ${param_idx})"
            )
            params.append(f"%{search_query}%")
            param_idx += 1

        where_clause = " AND ".join(conditions) if conditions else "TRUE"

        # Get total count
        total = await fetchval(
            f"SELECT COUNT(*) FROM notification_templates WHERE {where_clause}",
            *params,
            read_only=True,
        )

        # Get paginated results
        params.extend([limit, offset])
        rows = await fetch(
            f"""
            SELECT template_id, workspace_id, code, name, category,
                   supported_channels, status, version, is_transactional,
                   tags, created_at, updated_at
            FROM notification_templates
            WHERE {where_clause}
            ORDER BY
                CASE WHEN workspace_id IS NOT NULL THEN 0 ELSE 1 END,
                updated_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """,
            *params,
            read_only=True,
        )

        templates = [self._row_to_template_summary(row) for row in rows]
        total_pages = (total + limit - 1) // limit if total > 0 else 0

        meta = PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
            has_more=page < total_pages,
        )

        return templates, meta

    async def get_templates_by_category(
        self,
        workspace_id: Optional[UUID],
        category: NotificationCategory,
        status: TemplateStatus = TemplateStatus.ACTIVE,
    ) -> list[TemplateSummary]:
        """Get all templates for a category.

        Args:
            workspace_id: Workspace ID
            category: Category to filter by
            status: Template status (default active)

        Returns:
            List of templates in the category
        """
        rows = await fetch(
            """
            SELECT template_id, workspace_id, code, name, category,
                   supported_channels, status, version, is_transactional,
                   tags, created_at, updated_at
            FROM notification_templates
            WHERE category = $1 AND status = $2
              AND (workspace_id = $3 OR workspace_id IS NULL)
            ORDER BY
                CASE WHEN workspace_id = $3 THEN 0 ELSE 1 END,
                name ASC
            """,
            category.value,
            status.value,
            workspace_id,
            read_only=True,
        )

        return [self._row_to_template_summary(row) for row in rows]

    async def get_templates_by_channel(
        self,
        workspace_id: Optional[UUID],
        channel: NotificationChannel,
        status: TemplateStatus = TemplateStatus.ACTIVE,
    ) -> list[TemplateSummary]:
        """Get all templates supporting a specific channel.

        Args:
            workspace_id: Workspace ID
            channel: Channel to filter by
            status: Template status (default active)

        Returns:
            List of templates supporting the channel
        """
        rows = await fetch(
            """
            SELECT template_id, workspace_id, code, name, category,
                   supported_channels, status, version, is_transactional,
                   tags, created_at, updated_at
            FROM notification_templates
            WHERE $1 = ANY(supported_channels) AND status = $2
              AND (workspace_id = $3 OR workspace_id IS NULL)
            ORDER BY
                CASE WHEN workspace_id = $3 THEN 0 ELSE 1 END,
                category, name ASC
            """,
            channel.value,
            status.value,
            workspace_id,
            read_only=True,
        )

        return [self._row_to_template_summary(row) for row in rows]

    async def get_template_versions(
        self,
        workspace_id: Optional[UUID],
        code: str,
    ) -> list[TemplateSummary]:
        """Get all versions of a template by code.

        Args:
            workspace_id: Workspace ID
            code: Template code

        Returns:
            List of all versions, ordered by version descending
        """
        rows = await fetch(
            """
            SELECT template_id, workspace_id, code, name, category,
                   supported_channels, status, version, is_transactional,
                   tags, created_at, updated_at
            FROM notification_templates
            WHERE code = $1 AND (workspace_id = $2 OR workspace_id IS NULL)
            ORDER BY
                CASE WHEN workspace_id = $2 THEN 0 ELSE 1 END,
                version DESC
            """,
            code,
            workspace_id,
            read_only=True,
        )

        return [self._row_to_template_summary(row) for row in rows]

    async def get_system_templates(
        self,
        status: TemplateStatus = TemplateStatus.ACTIVE,
    ) -> list[TemplateSummary]:
        """Get all system templates.

        Args:
            status: Template status (default active)

        Returns:
            List of system templates
        """
        rows = await fetch(
            """
            SELECT template_id, workspace_id, code, name, category,
                   supported_channels, status, version, is_transactional,
                   tags, created_at, updated_at
            FROM notification_templates
            WHERE workspace_id IS NULL AND status = $1
            ORDER BY category, code
            """,
            status.value,
            read_only=True,
        )

        return [self._row_to_template_summary(row) for row in rows]

    async def template_code_exists(
        self,
        workspace_id: Optional[UUID],
        code: str,
        version: str = "1.0.0",
    ) -> bool:
        """Check if a template code exists for a workspace/version.

        Args:
            workspace_id: Workspace ID
            code: Template code
            version: Template version

        Returns:
            True if template exists, False otherwise
        """
        result = await fetchval(
            """
            SELECT 1 FROM notification_templates
            WHERE code = $1 AND version = $2
              AND (workspace_id = $3 OR ($3 IS NULL AND workspace_id IS NULL))
            LIMIT 1
            """,
            code,
            version,
            workspace_id,
            read_only=True,
        )
        return result is not None

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def update_template(
        self,
        workspace_id: Optional[UUID],
        template_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        supported_channels: Optional[list[NotificationChannel]] = None,
        status: Optional[TemplateStatus] = None,
        email: Optional[EmailContent] = None,
        sms: Optional[SMSContent] = None,
        push: Optional[PushContent] = None,
        in_app: Optional[InAppContent] = None,
        variable_schema: Optional[dict[str, Any]] = None,
        default_values: Optional[dict[str, Any]] = None,
        default_language: Optional[str] = None,
        localized_content: Optional[dict[str, Any]] = None,
        default_priority: Optional[NotificationPriority] = None,
        is_transactional: Optional[bool] = None,
        ttl_seconds: Optional[int] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        updated_by_user_id: Optional[UUID] = None,
    ) -> Optional[TemplateResponse]:
        """Update a notification template.

        Only provided fields are updated. None values are ignored.

        Args:
            workspace_id: Workspace ID for tenant isolation
            template_id: Template ID to update
            (other args): Fields to update

        Returns:
            Updated template or None if not found
        """
        # Build dynamic update query
        updates = []
        params: list[Any] = [template_id]
        param_idx = 2

        if name is not None:
            updates.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1

        if description is not None:
            updates.append(f"description = ${param_idx}")
            params.append(description)
            param_idx += 1

        if supported_channels is not None:
            updates.append(f"supported_channels = ${param_idx}")
            params.append([c.value for c in supported_channels])
            param_idx += 1

        if status is not None:
            updates.append(f"status = ${param_idx}")
            params.append(status.value)
            param_idx += 1

        # Email content
        if email is not None:
            updates.append(f"email_subject = ${param_idx}")
            params.append(email.subject)
            param_idx += 1
            updates.append(f"email_html = ${param_idx}")
            params.append(email.html)
            param_idx += 1
            updates.append(f"email_text = ${param_idx}")
            params.append(email.text)
            param_idx += 1
            updates.append(f"email_from_name = ${param_idx}")
            params.append(email.from_name)
            param_idx += 1
            updates.append(f"email_reply_to = ${param_idx}")
            params.append(email.reply_to)
            param_idx += 1

        # SMS content
        if sms is not None:
            updates.append(f"sms_content = ${param_idx}")
            params.append(sms.content)
            param_idx += 1

        # Push content
        if push is not None:
            updates.append(f"push_title = ${param_idx}")
            params.append(push.title)
            param_idx += 1
            updates.append(f"push_body = ${param_idx}")
            params.append(push.body)
            param_idx += 1
            updates.append(f"push_action_url = ${param_idx}")
            params.append(push.action_url)
            param_idx += 1
            updates.append(f"push_icon_url = ${param_idx}")
            params.append(push.icon_url)
            param_idx += 1

        # In-app content
        if in_app is not None:
            updates.append(f"in_app_title = ${param_idx}")
            params.append(in_app.title)
            param_idx += 1
            updates.append(f"in_app_body = ${param_idx}")
            params.append(in_app.body)
            param_idx += 1
            updates.append(f"in_app_action_url = ${param_idx}")
            params.append(in_app.action_url)
            param_idx += 1
            updates.append(f"in_app_icon = ${param_idx}")
            params.append(in_app.icon)
            param_idx += 1

        if variable_schema is not None:
            updates.append(f"variable_schema = ${param_idx}")
            params.append(json.dumps(variable_schema))
            param_idx += 1

        if default_values is not None:
            updates.append(f"default_values = ${param_idx}")
            params.append(json.dumps(default_values))
            param_idx += 1

        if default_language is not None:
            updates.append(f"default_language = ${param_idx}")
            params.append(default_language)
            param_idx += 1

        if localized_content is not None:
            updates.append(f"localized_content = ${param_idx}")
            params.append(json.dumps(localized_content))
            param_idx += 1

        if default_priority is not None:
            updates.append(f"default_priority = ${param_idx}")
            params.append(default_priority.value)
            param_idx += 1

        if is_transactional is not None:
            updates.append(f"is_transactional = ${param_idx}")
            params.append(is_transactional)
            param_idx += 1

        if ttl_seconds is not None:
            updates.append(f"ttl_seconds = ${param_idx}")
            params.append(ttl_seconds)
            param_idx += 1

        if tags is not None:
            updates.append(f"tags = ${param_idx}")
            params.append(tags)
            param_idx += 1

        if metadata is not None:
            updates.append(f"metadata = ${param_idx}")
            params.append(json.dumps(metadata))
            param_idx += 1

        if updated_by_user_id is not None:
            updates.append(f"updated_by_user_id = ${param_idx}")
            params.append(updated_by_user_id)
            param_idx += 1

        if not updates:
            # No updates provided, just return current template
            return await self.get_template(workspace_id, template_id)

        update_clause = ", ".join(updates)

        # Build workspace condition
        if workspace_id:
            workspace_condition = f"(workspace_id = ${param_idx} OR workspace_id IS NULL)"
            params.append(workspace_id)
        else:
            workspace_condition = "workspace_id IS NULL"

        row = await fetchrow(
            f"""
            UPDATE notification_templates
            SET {update_clause}
            WHERE template_id = $1 AND {workspace_condition}
            RETURNING *
            """,
            *params,
        )

        if row:
            template = self._row_to_template_response(row)
            # Invalidate cache
            await invalidate_template_cache(str(template_id))
            if workspace_id:
                await invalidate_template_cache(workspace_id=str(workspace_id))
            return template

        return None

    async def update_template_status(
        self,
        workspace_id: Optional[UUID],
        template_id: UUID,
        status: TemplateStatus,
        updated_by_user_id: Optional[UUID] = None,
    ) -> Optional[TemplateResponse]:
        """Update template status (shortcut method).

        Args:
            workspace_id: Workspace ID
            template_id: Template ID
            status: New status
            updated_by_user_id: User making the update

        Returns:
            Updated template or None if not found
        """
        return await self.update_template(
            workspace_id=workspace_id,
            template_id=template_id,
            status=status,
            updated_by_user_id=updated_by_user_id,
        )

    async def activate_template(
        self,
        workspace_id: Optional[UUID],
        template_id: UUID,
        updated_by_user_id: Optional[UUID] = None,
    ) -> Optional[TemplateResponse]:
        """Activate a template (shortcut method).

        Args:
            workspace_id: Workspace ID
            template_id: Template ID
            updated_by_user_id: User making the update

        Returns:
            Updated template or None if not found
        """
        return await self.update_template_status(
            workspace_id=workspace_id,
            template_id=template_id,
            status=TemplateStatus.ACTIVE,
            updated_by_user_id=updated_by_user_id,
        )

    async def archive_template(
        self,
        workspace_id: Optional[UUID],
        template_id: UUID,
        updated_by_user_id: Optional[UUID] = None,
    ) -> Optional[TemplateResponse]:
        """Archive a template (shortcut method).

        Args:
            workspace_id: Workspace ID
            template_id: Template ID
            updated_by_user_id: User making the update

        Returns:
            Updated template or None if not found
        """
        return await self.update_template_status(
            workspace_id=workspace_id,
            template_id=template_id,
            status=TemplateStatus.ARCHIVED,
            updated_by_user_id=updated_by_user_id,
        )

    async def deprecate_template(
        self,
        workspace_id: Optional[UUID],
        template_id: UUID,
        updated_by_user_id: Optional[UUID] = None,
    ) -> Optional[TemplateResponse]:
        """Deprecate a template (shortcut method).

        Args:
            workspace_id: Workspace ID
            template_id: Template ID
            updated_by_user_id: User making the update

        Returns:
            Updated template or None if not found
        """
        return await self.update_template_status(
            workspace_id=workspace_id,
            template_id=template_id,
            status=TemplateStatus.DEPRECATED,
            updated_by_user_id=updated_by_user_id,
        )

    async def bulk_update_status(
        self,
        workspace_id: Optional[UUID],
        template_ids: list[UUID],
        status: TemplateStatus,
        updated_by_user_id: Optional[UUID] = None,
    ) -> tuple[int, int]:
        """Bulk update status for multiple templates.

        Args:
            workspace_id: Workspace ID
            template_ids: List of template IDs
            status: New status
            updated_by_user_id: User making the update

        Returns:
            Tuple of (updated count, failed count)
        """
        if not template_ids:
            return (0, 0)

        # Build workspace condition
        if workspace_id:
            workspace_condition = "(workspace_id = $4 OR workspace_id IS NULL)"
        else:
            workspace_condition = "workspace_id IS NULL"

        params: list[Any] = [
            status.value,
            updated_by_user_id,
            template_ids,
        ]
        if workspace_id:
            params.append(workspace_id)

        result = await fetchval(
            f"""
            WITH updated AS (
                UPDATE notification_templates
                SET status = $1, updated_by_user_id = $2
                WHERE template_id = ANY($3::uuid[])
                  AND {workspace_condition}
                RETURNING template_id
            )
            SELECT COUNT(*) FROM updated
            """,
            *params,
        )

        updated = result or 0
        failed = len(template_ids) - updated

        # Invalidate cache for all templates
        for template_id in template_ids:
            await invalidate_template_cache(str(template_id))
        if workspace_id:
            await invalidate_template_cache(workspace_id=str(workspace_id))

        logger.info(
            f"Bulk updated {updated} templates to status {status.value}, {failed} failed",
            extra={"workspace_id": str(workspace_id) if workspace_id else None},
        )

        return (updated, failed)

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete_template(
        self,
        workspace_id: Optional[UUID],
        template_id: UUID,
    ) -> bool:
        """Delete a notification template.

        Note: Templates referenced by notification_events cannot be deleted
        (will be SET NULL on the foreign key).

        Args:
            workspace_id: Workspace ID for tenant isolation
            template_id: Template ID to delete

        Returns:
            True if deleted, False if not found
        """
        # Build workspace condition
        if workspace_id:
            workspace_condition = "(workspace_id = $2 OR workspace_id IS NULL)"
        else:
            workspace_condition = "workspace_id IS NULL"

        params: list[Any] = [template_id]
        if workspace_id:
            params.append(workspace_id)

        result = await fetchval(
            f"""
            DELETE FROM notification_templates
            WHERE template_id = $1 AND {workspace_condition}
            RETURNING template_id
            """,
            *params,
        )

        if result:
            await invalidate_template_cache(str(template_id))
            if workspace_id:
                await invalidate_template_cache(workspace_id=str(workspace_id))
            return True

        return False

    async def delete_template_versions(
        self,
        workspace_id: Optional[UUID],
        code: str,
        keep_active: bool = True,
    ) -> int:
        """Delete all versions of a template by code.

        Args:
            workspace_id: Workspace ID
            code: Template code
            keep_active: If True, keeps the active version (default True)

        Returns:
            Number of templates deleted
        """
        # Build conditions
        conditions = ["code = $1"]
        params: list[Any] = [code]
        param_idx = 2

        if workspace_id:
            conditions.append(f"(workspace_id = ${param_idx} OR workspace_id IS NULL)")
            params.append(workspace_id)
            param_idx += 1
        else:
            conditions.append("workspace_id IS NULL")

        if keep_active:
            conditions.append("status != 'active'")

        where_clause = " AND ".join(conditions)

        result = await fetchval(
            f"""
            WITH deleted AS (
                DELETE FROM notification_templates
                WHERE {where_clause}
                RETURNING 1
            )
            SELECT COUNT(*) FROM deleted
            """,
            *params,
        )

        count = result or 0
        if count > 0:
            if workspace_id:
                await invalidate_template_cache(workspace_id=str(workspace_id))
            else:
                await invalidate_template_cache()
            logger.info(f"Deleted {count} template versions for code {code}")

        return count

    # =========================================================================
    # STATISTICS & ANALYTICS
    # =========================================================================

    async def get_template_stats(
        self,
        workspace_id: Optional[UUID],
    ) -> dict[str, Any]:
        """Get template statistics for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dictionary with template statistics
        """
        # Build workspace condition
        if workspace_id:
            workspace_condition = "(workspace_id = $1 OR workspace_id IS NULL)"
            params: list[Any] = [workspace_id]
        else:
            workspace_condition = "workspace_id IS NULL"
            params = []

        row = await fetchrow(
            f"""
            SELECT
                COUNT(*) as total_templates,
                COUNT(*) FILTER (WHERE status = 'active') as active_templates,
                COUNT(*) FILTER (WHERE status = 'draft') as draft_templates,
                COUNT(*) FILTER (WHERE status = 'archived') as archived_templates,
                COUNT(*) FILTER (WHERE status = 'deprecated') as deprecated_templates,
                COUNT(*) FILTER (WHERE workspace_id IS NULL) as system_templates,
                COUNT(*) FILTER (WHERE workspace_id IS NOT NULL) as custom_templates,
                COUNT(*) FILTER (WHERE 'email' = ANY(supported_channels)) as email_templates,
                COUNT(*) FILTER (WHERE 'sms' = ANY(supported_channels)) as sms_templates,
                COUNT(*) FILTER (WHERE 'push' = ANY(supported_channels)) as push_templates,
                COUNT(*) FILTER (WHERE 'in_app' = ANY(supported_channels)) as in_app_templates,
                COUNT(*) FILTER (WHERE is_transactional = TRUE) as transactional_templates
            FROM notification_templates
            WHERE {workspace_condition}
            """,
            *params,
            read_only=True,
        )

        return {
            "total": row["total_templates"] or 0,
            "by_status": {
                "active": row["active_templates"] or 0,
                "draft": row["draft_templates"] or 0,
                "archived": row["archived_templates"] or 0,
                "deprecated": row["deprecated_templates"] or 0,
            },
            "by_type": {
                "system": row["system_templates"] or 0,
                "custom": row["custom_templates"] or 0,
            },
            "by_channel": {
                "email": row["email_templates"] or 0,
                "sms": row["sms_templates"] or 0,
                "push": row["push_templates"] or 0,
                "in_app": row["in_app_templates"] or 0,
            },
            "transactional": row["transactional_templates"] or 0,
        }

    async def get_templates_by_category_stats(
        self,
        workspace_id: Optional[UUID],
    ) -> list[dict[str, Any]]:
        """Get template counts grouped by category.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of category stats
        """
        # Build workspace condition
        if workspace_id:
            workspace_condition = "(workspace_id = $1 OR workspace_id IS NULL)"
            params: list[Any] = [workspace_id]
        else:
            workspace_condition = "workspace_id IS NULL"
            params = []

        rows = await fetch(
            f"""
            SELECT
                category,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active
            FROM notification_templates
            WHERE {workspace_condition}
            GROUP BY category
            ORDER BY total DESC
            """,
            *params,
            read_only=True,
        )

        return [
            {
                "category": row["category"],
                "total": row["total"] or 0,
                "active": row["active"] or 0,
            }
            for row in rows
        ]

    # =========================================================================
    # PRIVATE HELPER METHODS
    # =========================================================================

    def _row_to_template_response(self, row: asyncpg.Record) -> TemplateResponse:
        """Convert database row to TemplateResponse schema."""
        return TemplateResponse(
            template_id=row["template_id"],
            workspace_id=row["workspace_id"],
            code=row["code"],
            name=row["name"],
            description=row["description"],
            category=NotificationCategory(row["category"]),
            supported_channels=[NotificationChannel(c) for c in row["supported_channels"]] if row["supported_channels"] else [],
            status=TemplateStatus(row["status"]),
            email_subject=row["email_subject"],
            email_html=row["email_html"],
            email_text=row["email_text"],
            email_from_name=row["email_from_name"],
            email_reply_to=row["email_reply_to"],
            sms_content=row["sms_content"],
            push_title=row["push_title"],
            push_body=row["push_body"],
            push_action_url=row["push_action_url"],
            push_icon_url=row["push_icon_url"],
            in_app_title=row["in_app_title"],
            in_app_body=row["in_app_body"],
            in_app_action_url=row["in_app_action_url"],
            in_app_icon=row["in_app_icon"],
            variable_schema=row["variable_schema"] if isinstance(row["variable_schema"], dict) else json.loads(row["variable_schema"] or "{}"),
            default_values=row["default_values"] if isinstance(row["default_values"], dict) else json.loads(row["default_values"] or "{}"),
            default_language=row["default_language"] or "en",
            localized_content=row["localized_content"] if isinstance(row["localized_content"], dict) else json.loads(row["localized_content"] or "{}"),
            version=row["version"],
            previous_version_id=row["previous_version_id"],
            default_priority=NotificationPriority(row["default_priority"]) if row["default_priority"] else NotificationPriority.NORMAL,
            is_transactional=row["is_transactional"] or False,
            ttl_seconds=row["ttl_seconds"],
            tags=row["tags"] or [],
            metadata=row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}"),
            created_by_user_id=row["created_by_user_id"],
            updated_by_user_id=row["updated_by_user_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _row_to_template_summary(self, row: asyncpg.Record) -> TemplateSummary:
        """Convert database row to TemplateSummary schema."""
        return TemplateSummary(
            template_id=row["template_id"],
            workspace_id=row["workspace_id"],
            code=row["code"],
            name=row["name"],
            category=NotificationCategory(row["category"]),
            supported_channels=[NotificationChannel(c) for c in row["supported_channels"]] if row["supported_channels"] else [],
            status=TemplateStatus(row["status"]),
            version=row["version"],
            is_transactional=row["is_transactional"] or False,
            tags=row["tags"] or [],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# Singleton instance for use across the application
template_repository = TemplateRepository()
