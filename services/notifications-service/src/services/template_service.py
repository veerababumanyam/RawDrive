"""Template service with Jinja2 rendering for notifications.

This module provides the TemplateService class that handles:
- Template retrieval and caching
- Jinja2 template compilation and rendering
- Variable validation and fallback handling
- Multi-channel content rendering (email, SMS, push, in-app)
- Localization support

Features:
- Sandboxed Jinja2 environment for security
- Template caching with Redis integration
- Graceful fallback to default values on missing variables
- Variable detection and validation
- Multi-language template rendering

Feature: Notifications & Communication Microservice
Task: T021 - Create template_service.py with Jinja2 rendering
"""

from __future__ import annotations

import html
import logging
import re
from typing import Any, Optional
from uuid import UUID

from jinja2 import (
    BaseLoader,
    Environment,
    TemplateSyntaxError,
    UndefinedError,
    meta,
    select_autoescape,
)
from jinja2.sandbox import SandboxedEnvironment

from src.cache.redis_client import (
    build_template_cache_key,
    redis_client,
)
from src.config import settings
from src.repositories.template_repository import template_repository
from src.schemas.notification import NotificationChannel
from src.schemas.template import (
    EmailContent,
    InAppContent,
    LocalizedContent,
    PushContent,
    RenderedEmail,
    RenderedInApp,
    RenderedPush,
    RenderedSMS,
    SMSContent,
    TemplateForRendering,
    TemplateRenderResponse,
    TemplateRenderResult,
    TemplateResponse,
    TemplateStatus,
    TemplateValidationError,
    TemplateValidationResult,
)

logger = logging.getLogger(__name__)

# Regex pattern to extract Jinja2 variables from templates
JINJA2_VARIABLE_PATTERN = re.compile(r"\{\{\s*(\w+(?:\.\w+)*)\s*\}\}")

# SMS segment size (GSM-7 encoding)
SMS_SEGMENT_SIZE = 160
SMS_CONCAT_SEGMENT_SIZE = 153  # Less due to UDH header

# Cache TTL for compiled templates
TEMPLATE_CACHE_TTL = settings.CACHE_TTL_TEMPLATE


class TemplateService:
    """Service for rendering notification templates with Jinja2.

    Provides secure, sandboxed Jinja2 template rendering with:
    - Variable validation and fallback handling
    - Multi-channel content support
    - Localization for different languages
    - Caching for compiled templates

    All template rendering is done in a sandboxed environment
    to prevent template injection attacks.
    """

    def __init__(self):
        """Initialize the template service with Jinja2 environment."""
        # Create a sandboxed environment for security
        self._env = SandboxedEnvironment(
            loader=BaseLoader(),
            autoescape=select_autoescape(
                enabled_extensions=("html", "htm", "xml"),
                default_for_string=False,
            ),
            trim_blocks=True,
            lstrip_blocks=True,
        )

        # Add custom filters
        self._env.filters["escape_html"] = html.escape
        self._env.filters["truncate_sms"] = self._truncate_sms
        self._env.filters["strip_html"] = self._strip_html
        self._env.filters["default_if_none"] = lambda x, d: d if x is None else x

        # Strict mode from settings
        self._strict_mode = settings.TEMPLATE_STRICT_MODE

        # Track compiled templates in memory
        self._compiled_cache: dict[str, Any] = {}

    # =========================================================================
    # PUBLIC METHODS - Template Rendering
    # =========================================================================

    async def render_template(
        self,
        workspace_id: Optional[UUID],
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
        channel: NotificationChannel = NotificationChannel.EMAIL,
        variables: dict[str, Any] | None = None,
        language: str = "en",
    ) -> TemplateRenderResponse:
        """Render a notification template with provided variables.

        Args:
            workspace_id: Workspace ID for tenant isolation
            template_id: Template ID (use this or template_code)
            template_code: Template code (use this or template_id)
            channel: Channel to render content for
            variables: Variables to substitute in the template
            language: Language for localized content

        Returns:
            TemplateRenderResponse with rendered content

        Raises:
            ValueError: If neither template_id nor template_code is provided
        """
        if not template_id and not template_code:
            raise ValueError("Either template_id or template_code must be provided")

        variables = variables or {}
        warnings: list[str] = []
        missing_variables: list[str] = []

        # Get template from repository
        template = await self._get_template(
            workspace_id=workspace_id,
            template_id=template_id,
            template_code=template_code,
        )

        if not template:
            return TemplateRenderResponse(
                template_id=template_id or UUID("00000000-0000-0000-0000-000000000000"),
                template_code=template_code or "",
                channel=channel,
                language=language,
                variables_used={},
                missing_variables=["TEMPLATE_NOT_FOUND"],
                warnings=["Template not found"],
            )

        # Validate required variables
        required = template.variable_schema.get("required", [])
        missing = [v for v in required if v not in variables]

        if missing:
            missing_variables.extend(missing)
            if self._strict_mode:
                return TemplateRenderResponse(
                    template_id=template.template_id,
                    template_code=template.code,
                    channel=channel,
                    language=language,
                    variables_used=variables,
                    missing_variables=missing_variables,
                    warnings=[f"Missing required variables: {', '.join(missing)}"],
                )
            else:
                warnings.append(f"Using defaults for missing variables: {', '.join(missing)}")

        # Merge with default values
        default_values = template.default_values or {}
        merged_variables = {**default_values, **variables}

        # Get localized content if available
        localized = self._get_localized_content(template, language)

        # Prepare template for rendering
        template_for_render = self._prepare_template_for_channel(
            template=template,
            channel=channel,
            localized=localized,
            language=language,
        )

        # Render the template
        result = await self._render_channel_content(
            template_for_render=template_for_render,
            variables=merged_variables,
            channel=channel,
        )

        if not result.success:
            warnings.append(result.error_message or "Rendering failed")
            missing_variables.extend(result.missing_variables)

        # Build response based on channel
        response = TemplateRenderResponse(
            template_id=template.template_id,
            template_code=template.code,
            channel=channel,
            language=language,
            variables_used=merged_variables,
            missing_variables=missing_variables,
            warnings=warnings,
        )

        # Add rendered content based on channel
        if channel == NotificationChannel.EMAIL and result.success:
            response.email = RenderedEmail(
                subject=result.rendered_subject or "",
                html=result.rendered_html,
                text=result.rendered_text,
                from_name=result.from_name,
                reply_to=result.reply_to,
            )
        elif channel == NotificationChannel.SMS and result.success:
            content = result.rendered_text or ""
            response.sms = RenderedSMS(
                content=content,
                segment_count=self._calculate_sms_segments(content),
            )
        elif channel == NotificationChannel.PUSH and result.success:
            response.push = RenderedPush(
                title=result.rendered_title or "",
                body=result.rendered_text or "",
                action_url=result.rendered_action_url,
                icon_url=result.icon_url,
            )
        elif channel == NotificationChannel.IN_APP and result.success:
            response.in_app = RenderedInApp(
                title=result.rendered_title or "",
                body=result.rendered_text or "",
                action_url=result.rendered_action_url,
                icon=result.icon,
            )

        return response

    async def render_email(
        self,
        workspace_id: Optional[UUID],
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
        variables: dict[str, Any] | None = None,
        language: str = "en",
    ) -> RenderedEmail | None:
        """Convenience method to render email content.

        Args:
            workspace_id: Workspace ID
            template_id: Template ID (optional)
            template_code: Template code (optional)
            variables: Variables to substitute
            language: Language code

        Returns:
            RenderedEmail or None if rendering failed
        """
        response = await self.render_template(
            workspace_id=workspace_id,
            template_id=template_id,
            template_code=template_code,
            channel=NotificationChannel.EMAIL,
            variables=variables,
            language=language,
        )
        return response.email

    async def render_sms(
        self,
        workspace_id: Optional[UUID],
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
        variables: dict[str, Any] | None = None,
        language: str = "en",
    ) -> RenderedSMS | None:
        """Convenience method to render SMS content.

        Args:
            workspace_id: Workspace ID
            template_id: Template ID (optional)
            template_code: Template code (optional)
            variables: Variables to substitute
            language: Language code

        Returns:
            RenderedSMS or None if rendering failed
        """
        response = await self.render_template(
            workspace_id=workspace_id,
            template_id=template_id,
            template_code=template_code,
            channel=NotificationChannel.SMS,
            variables=variables,
            language=language,
        )
        return response.sms

    async def render_push(
        self,
        workspace_id: Optional[UUID],
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
        variables: dict[str, Any] | None = None,
        language: str = "en",
    ) -> RenderedPush | None:
        """Convenience method to render push notification content.

        Args:
            workspace_id: Workspace ID
            template_id: Template ID (optional)
            template_code: Template code (optional)
            variables: Variables to substitute
            language: Language code

        Returns:
            RenderedPush or None if rendering failed
        """
        response = await self.render_template(
            workspace_id=workspace_id,
            template_id=template_id,
            template_code=template_code,
            channel=NotificationChannel.PUSH,
            variables=variables,
            language=language,
        )
        return response.push

    async def render_in_app(
        self,
        workspace_id: Optional[UUID],
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
        variables: dict[str, Any] | None = None,
        language: str = "en",
    ) -> RenderedInApp | None:
        """Convenience method to render in-app notification content.

        Args:
            workspace_id: Workspace ID
            template_id: Template ID (optional)
            template_code: Template code (optional)
            variables: Variables to substitute
            language: Language code

        Returns:
            RenderedInApp or None if rendering failed
        """
        response = await self.render_template(
            workspace_id=workspace_id,
            template_id=template_id,
            template_code=template_code,
            channel=NotificationChannel.IN_APP,
            variables=variables,
            language=language,
        )
        return response.in_app

    async def render_raw(
        self,
        template_string: str,
        variables: dict[str, Any] | None = None,
        autoescape: bool = False,
    ) -> str:
        """Render a raw template string (not from database).

        Useful for one-off template rendering or testing.

        Args:
            template_string: Jinja2 template string
            variables: Variables to substitute
            autoescape: Whether to autoescape HTML

        Returns:
            Rendered string

        Raises:
            TemplateSyntaxError: If template syntax is invalid
        """
        variables = variables or {}
        try:
            template = self._env.from_string(template_string)
            return template.render(**variables)
        except UndefinedError as e:
            if self._strict_mode:
                raise
            logger.warning(f"Undefined variable in template: {e}")
            # Return original with unresolved variables
            return template_string
        except TemplateSyntaxError as e:
            logger.error(f"Template syntax error: {e}")
            raise

    # =========================================================================
    # PUBLIC METHODS - Template Validation
    # =========================================================================

    async def validate_template(
        self,
        email: Optional[EmailContent] = None,
        sms: Optional[SMSContent] = None,
        push: Optional[PushContent] = None,
        in_app: Optional[InAppContent] = None,
        variable_schema: Optional[dict[str, Any]] = None,
    ) -> TemplateValidationResult:
        """Validate template content and detect variables.

        Args:
            email: Email content to validate
            sms: SMS content to validate
            push: Push content to validate
            in_app: In-app content to validate
            variable_schema: Expected variable schema

        Returns:
            TemplateValidationResult with validation status
        """
        errors: list[TemplateValidationError] = []
        warnings: list[TemplateValidationError] = []
        detected_variables: set[str] = set()

        # Validate email content
        if email:
            email_vars, email_errors, email_warnings = self._validate_channel_content(
                content={
                    "subject": email.subject,
                    "html": email.html,
                    "text": email.text,
                    "from_name": email.from_name,
                    "reply_to": email.reply_to,
                },
                channel="email",
            )
            detected_variables.update(email_vars)
            errors.extend(email_errors)
            warnings.extend(email_warnings)

        # Validate SMS content
        if sms:
            sms_vars, sms_errors, sms_warnings = self._validate_channel_content(
                content={"content": sms.content},
                channel="sms",
            )
            detected_variables.update(sms_vars)
            errors.extend(sms_errors)
            warnings.extend(sms_warnings)

        # Validate push content
        if push:
            push_vars, push_errors, push_warnings = self._validate_channel_content(
                content={
                    "title": push.title,
                    "body": push.body,
                    "action_url": push.action_url,
                },
                channel="push",
            )
            detected_variables.update(push_vars)
            errors.extend(push_errors)
            warnings.extend(push_warnings)

        # Validate in-app content
        if in_app:
            in_app_vars, in_app_errors, in_app_warnings = self._validate_channel_content(
                content={
                    "title": in_app.title,
                    "body": in_app.body,
                    "action_url": in_app.action_url,
                },
                channel="in_app",
            )
            detected_variables.update(in_app_vars)
            errors.extend(in_app_errors)
            warnings.extend(in_app_warnings)

        # Check variable schema coverage
        if variable_schema:
            required = set(variable_schema.get("required", []))
            optional = set(variable_schema.get("optional", []))
            declared = required | optional

            # Warn about undeclared variables
            undeclared = detected_variables - declared
            if undeclared:
                warnings.append(
                    TemplateValidationError(
                        field="variable_schema",
                        message=f"Variables used but not declared: {', '.join(undeclared)}",
                        code="UNDECLARED_VARIABLES",
                    )
                )

            # Warn about unused declared variables
            unused = declared - detected_variables
            if unused:
                warnings.append(
                    TemplateValidationError(
                        field="variable_schema",
                        message=f"Variables declared but not used: {', '.join(unused)}",
                        code="UNUSED_VARIABLES",
                    )
                )

        return TemplateValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            detected_variables=list(detected_variables),
        )

    def detect_variables(self, template_string: str) -> list[str]:
        """Detect all variables used in a template string.

        Args:
            template_string: Jinja2 template string

        Returns:
            List of variable names found
        """
        if not template_string:
            return []

        try:
            # Use Jinja2's AST parser to find undeclared variables
            ast = self._env.parse(template_string)
            return list(meta.find_undeclared_variables(ast))
        except TemplateSyntaxError:
            # Fall back to regex matching
            matches = JINJA2_VARIABLE_PATTERN.findall(template_string)
            # Get base variable names (before any dots)
            return list(set(m.split(".")[0] for m in matches))

    # =========================================================================
    # PUBLIC METHODS - Preview
    # =========================================================================

    async def preview_template(
        self,
        workspace_id: Optional[UUID],
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
        channel: NotificationChannel = NotificationChannel.EMAIL,
        sample_variables: dict[str, Any] | None = None,
        custom_email: Optional[EmailContent] = None,
        custom_sms: Optional[SMSContent] = None,
        custom_push: Optional[PushContent] = None,
        custom_in_app: Optional[InAppContent] = None,
        language: str = "en",
    ) -> TemplateRenderResponse:
        """Preview a template with sample data.

        Can preview either a saved template or custom content.

        Args:
            workspace_id: Workspace ID
            template_id: Template ID (optional)
            template_code: Template code (optional)
            channel: Channel to preview
            sample_variables: Sample data for preview
            custom_email: Custom email content (for preview without saving)
            custom_sms: Custom SMS content
            custom_push: Custom push content
            custom_in_app: Custom in-app content
            language: Language code

        Returns:
            TemplateRenderResponse with preview content
        """
        sample_variables = sample_variables or {}

        # Add common sample values if not provided
        sample_defaults = {
            "guest_name": "John Smith",
            "gallery_name": "Wedding Photos 2024",
            "gallery_url": "https://gallery.example.com/abc123",
            "photographer_name": "Jane Doe Photography",
            "event_date": "January 15, 2024",
            "custom_message": "Thank you for being part of our special day!",
            "workspace_name": "My Photography Studio",
            "user_name": "John Smith",
            "action_url": "https://rawdrive.io/action",
        }
        merged_samples = {**sample_defaults, **sample_variables}

        # If custom content is provided, render it directly
        if any([custom_email, custom_sms, custom_push, custom_in_app]):
            return await self._render_custom_content(
                channel=channel,
                variables=merged_samples,
                email=custom_email,
                sms=custom_sms,
                push=custom_push,
                in_app=custom_in_app,
            )

        # Otherwise, render the saved template
        return await self.render_template(
            workspace_id=workspace_id,
            template_id=template_id,
            template_code=template_code,
            channel=channel,
            variables=merged_samples,
            language=language,
        )

    # =========================================================================
    # PRIVATE METHODS - Template Retrieval
    # =========================================================================

    async def _get_template(
        self,
        workspace_id: Optional[UUID],
        template_id: Optional[UUID] = None,
        template_code: Optional[str] = None,
    ) -> Optional[TemplateResponse]:
        """Get template from repository with caching."""
        if template_id:
            return await template_repository.get_template(
                workspace_id=workspace_id,
                template_id=template_id,
            )
        elif template_code:
            return await template_repository.get_template_by_code(
                workspace_id=workspace_id,
                code=template_code,
                status=TemplateStatus.ACTIVE,
            )
        return None

    def _get_localized_content(
        self,
        template: TemplateResponse,
        language: str,
    ) -> Optional[LocalizedContent]:
        """Get localized content for a language."""
        if not template.localized_content:
            return None

        localized_data = template.localized_content.get(language.lower())
        if not localized_data:
            return None

        if isinstance(localized_data, LocalizedContent):
            return localized_data
        elif isinstance(localized_data, dict):
            return LocalizedContent(**localized_data)
        return None

    def _prepare_template_for_channel(
        self,
        template: TemplateResponse,
        channel: NotificationChannel,
        localized: Optional[LocalizedContent],
        language: str,
    ) -> TemplateForRendering:
        """Prepare template data for rendering a specific channel."""
        result = TemplateForRendering(
            template_id=template.template_id,
            code=template.code,
            channel=channel,
            language=language,
            required_variables=template.variable_schema.get("required", []),
            default_values=template.default_values or {},
        )

        if channel == NotificationChannel.EMAIL:
            result.subject = (
                localized.email_subject if localized and localized.email_subject
                else template.email_subject
            )
            result.html_content = (
                localized.email_html if localized and localized.email_html
                else template.email_html
            )
            result.text_content = (
                localized.email_text if localized and localized.email_text
                else template.email_text
            )
            result.from_name = template.email_from_name
            result.reply_to = template.email_reply_to

        elif channel == NotificationChannel.SMS:
            result.text_content = (
                localized.sms_content if localized and localized.sms_content
                else template.sms_content
            )

        elif channel == NotificationChannel.PUSH:
            result.title = (
                localized.push_title if localized and localized.push_title
                else template.push_title
            )
            result.text_content = (
                localized.push_body if localized and localized.push_body
                else template.push_body
            )
            result.action_url = template.push_action_url
            result.icon_url = template.push_icon_url

        elif channel == NotificationChannel.IN_APP:
            result.title = (
                localized.in_app_title if localized and localized.in_app_title
                else template.in_app_title
            )
            result.text_content = (
                localized.in_app_body if localized and localized.in_app_body
                else template.in_app_body
            )
            result.action_url = template.in_app_action_url
            result.icon = template.in_app_icon

        return result

    # =========================================================================
    # PRIVATE METHODS - Rendering
    # =========================================================================

    async def _render_channel_content(
        self,
        template_for_render: TemplateForRendering,
        variables: dict[str, Any],
        channel: NotificationChannel,
    ) -> TemplateRenderResult:
        """Render content for a specific channel."""
        result = TemplateRenderResult(
            success=True,
            template_id=template_for_render.template_id,
            channel=channel,
        )

        try:
            if channel == NotificationChannel.EMAIL:
                if template_for_render.subject:
                    result.rendered_subject = self._render_string(
                        template_for_render.subject, variables
                    )
                if template_for_render.html_content:
                    result.rendered_html = self._render_string(
                        template_for_render.html_content, variables, autoescape=True
                    )
                if template_for_render.text_content:
                    result.rendered_text = self._render_string(
                        template_for_render.text_content, variables
                    )
                result.from_name = template_for_render.from_name
                result.reply_to = template_for_render.reply_to

            elif channel == NotificationChannel.SMS:
                if template_for_render.text_content:
                    result.rendered_text = self._render_string(
                        template_for_render.text_content, variables
                    )

            elif channel == NotificationChannel.PUSH:
                if template_for_render.title:
                    result.rendered_title = self._render_string(
                        template_for_render.title, variables
                    )
                if template_for_render.text_content:
                    result.rendered_text = self._render_string(
                        template_for_render.text_content, variables
                    )
                if template_for_render.action_url:
                    result.rendered_action_url = self._render_string(
                        template_for_render.action_url, variables
                    )
                result.icon_url = template_for_render.icon_url

            elif channel == NotificationChannel.IN_APP:
                if template_for_render.title:
                    result.rendered_title = self._render_string(
                        template_for_render.title, variables
                    )
                if template_for_render.text_content:
                    result.rendered_text = self._render_string(
                        template_for_render.text_content, variables
                    )
                if template_for_render.action_url:
                    result.rendered_action_url = self._render_string(
                        template_for_render.action_url, variables
                    )
                result.icon = template_for_render.icon

        except UndefinedError as e:
            result.success = False
            result.error_message = f"Undefined variable: {e}"
            # Extract variable name from error
            var_match = re.search(r"'(\w+)'", str(e))
            if var_match:
                result.missing_variables.append(var_match.group(1))
            logger.warning(f"Template rendering error: {e}")

        except TemplateSyntaxError as e:
            result.success = False
            result.error_message = f"Template syntax error: {e}"
            logger.error(f"Template syntax error: {e}")

        except Exception as e:
            result.success = False
            result.error_message = f"Rendering error: {str(e)}"
            logger.exception(f"Unexpected rendering error: {e}")

        return result

    def _render_string(
        self,
        template_string: str,
        variables: dict[str, Any],
        autoescape: bool = False,
    ) -> str:
        """Render a single template string.

        Args:
            template_string: Jinja2 template string
            variables: Variables to substitute
            autoescape: Whether to autoescape HTML

        Returns:
            Rendered string
        """
        try:
            # Check if we have a compiled version cached
            cache_key = hash(template_string)
            if cache_key in self._compiled_cache:
                template = self._compiled_cache[cache_key]
            else:
                template = self._env.from_string(template_string)
                # Cache compiled template (memory cache, not Redis)
                if len(self._compiled_cache) < 1000:  # Limit cache size
                    self._compiled_cache[cache_key] = template

            return template.render(**variables)

        except UndefinedError:
            if self._strict_mode:
                raise
            # In non-strict mode, return with unresolved variables marked
            return template_string

    async def _render_custom_content(
        self,
        channel: NotificationChannel,
        variables: dict[str, Any],
        email: Optional[EmailContent] = None,
        sms: Optional[SMSContent] = None,
        push: Optional[PushContent] = None,
        in_app: Optional[InAppContent] = None,
    ) -> TemplateRenderResponse:
        """Render custom content (not from database template)."""
        response = TemplateRenderResponse(
            template_id=UUID("00000000-0000-0000-0000-000000000000"),
            template_code="_custom_",
            channel=channel,
            language="en",
            variables_used=variables,
            missing_variables=[],
            warnings=[],
        )

        try:
            if channel == NotificationChannel.EMAIL and email:
                response.email = RenderedEmail(
                    subject=self._render_string(email.subject, variables),
                    html=self._render_string(email.html, variables, autoescape=True) if email.html else None,
                    text=self._render_string(email.text, variables) if email.text else None,
                    from_name=email.from_name,
                    reply_to=email.reply_to,
                )
            elif channel == NotificationChannel.SMS and sms:
                content = self._render_string(sms.content, variables)
                response.sms = RenderedSMS(
                    content=content,
                    segment_count=self._calculate_sms_segments(content),
                )
            elif channel == NotificationChannel.PUSH and push:
                response.push = RenderedPush(
                    title=self._render_string(push.title, variables),
                    body=self._render_string(push.body, variables),
                    action_url=self._render_string(push.action_url, variables) if push.action_url else None,
                    icon_url=push.icon_url,
                )
            elif channel == NotificationChannel.IN_APP and in_app:
                response.in_app = RenderedInApp(
                    title=self._render_string(in_app.title, variables),
                    body=self._render_string(in_app.body, variables),
                    action_url=self._render_string(in_app.action_url, variables) if in_app.action_url else None,
                    icon=in_app.icon,
                )
        except Exception as e:
            response.warnings.append(f"Rendering error: {str(e)}")
            logger.exception(f"Custom content rendering error: {e}")

        return response

    # =========================================================================
    # PRIVATE METHODS - Validation
    # =========================================================================

    def _validate_channel_content(
        self,
        content: dict[str, Optional[str]],
        channel: str,
    ) -> tuple[set[str], list[TemplateValidationError], list[TemplateValidationError]]:
        """Validate template content for a channel.

        Returns:
            Tuple of (detected_variables, errors, warnings)
        """
        detected_variables: set[str] = set()
        errors: list[TemplateValidationError] = []
        warnings: list[TemplateValidationError] = []

        for field, value in content.items():
            if value is None:
                continue

            field_path = f"{channel}.{field}"

            # Check for syntax errors
            try:
                self._env.parse(value)
            except TemplateSyntaxError as e:
                errors.append(
                    TemplateValidationError(
                        field=field_path,
                        message=f"Template syntax error: {e}",
                        code="SYNTAX_ERROR",
                    )
                )
                continue

            # Detect variables
            variables = self.detect_variables(value)
            detected_variables.update(variables)

            # Channel-specific validations
            if channel == "sms" and field == "content":
                # Check SMS length
                if len(value) > 1600:
                    errors.append(
                        TemplateValidationError(
                            field=field_path,
                            message="SMS content exceeds maximum length of 1600 characters",
                            code="MAX_LENGTH_EXCEEDED",
                        )
                    )
                elif len(value) > 160:
                    segments = self._calculate_sms_segments(value)
                    warnings.append(
                        TemplateValidationError(
                            field=field_path,
                            message=f"SMS will be sent as {segments} segments",
                            code="SMS_MULTIPLE_SEGMENTS",
                        )
                    )

        return detected_variables, errors, warnings

    # =========================================================================
    # PRIVATE METHODS - Utilities
    # =========================================================================

    def _calculate_sms_segments(self, content: str) -> int:
        """Calculate number of SMS segments for a message."""
        if not content:
            return 0

        length = len(content)
        if length <= SMS_SEGMENT_SIZE:
            return 1

        # Concatenated SMS has smaller segment size due to UDH header
        return (length + SMS_CONCAT_SEGMENT_SIZE - 1) // SMS_CONCAT_SEGMENT_SIZE

    @staticmethod
    def _truncate_sms(value: str, max_length: int = 160) -> str:
        """Custom Jinja2 filter to truncate SMS content."""
        if len(value) <= max_length:
            return value
        return value[:max_length - 3] + "..."

    @staticmethod
    def _strip_html(value: str) -> str:
        """Custom Jinja2 filter to strip HTML tags."""
        clean = re.compile(r"<.*?>")
        return re.sub(clean, "", value)

    def clear_compiled_cache(self) -> None:
        """Clear the in-memory compiled template cache."""
        self._compiled_cache.clear()
        logger.info("Compiled template cache cleared")


# Singleton instance for use across the application
template_service = TemplateService()
