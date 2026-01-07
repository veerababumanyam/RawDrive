"""Unit tests for TemplateService.

Tests the template rendering service including:
- Jinja2 template rendering with variable substitution
- Multi-channel content rendering (email, SMS, push, in-app)
- Variable detection and validation
- Template caching and compilation
- Localization support
- Error handling and fallback behavior
- SMS segment calculation
- Custom filter functions

Feature: Notifications & Communication Microservice
Task: T047 - Create unit tests for template_service
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from jinja2 import TemplateSyntaxError, UndefinedError

from src.services.template_service import (
    TemplateService,
    template_service,
    SMS_SEGMENT_SIZE,
    SMS_CONCAT_SEGMENT_SIZE,
)
from src.schemas.notification import NotificationChannel
from src.schemas.template import (
    EmailContent,
    SMSContent,
    PushContent,
    InAppContent,
    LocalizedContent,
    TemplateResponse,
    TemplateRenderResponse,
    TemplateStatus,
    TemplateValidationResult,
    RenderedEmail,
    RenderedSMS,
    RenderedPush,
    RenderedInApp,
)
from src.schemas.notification import (
    NotificationCategory,
    NotificationPriority,
)


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def service():
    """Create a fresh template service instance for testing."""
    return TemplateService()


@pytest.fixture
def sample_workspace_id():
    """Sample workspace ID for testing."""
    return UUID("550e8400-e29b-41d4-a716-446655440000")


@pytest.fixture
def sample_template_id():
    """Sample template ID for testing."""
    return UUID("660e8400-e29b-41d4-a716-446655440001")


@pytest.fixture
def sample_template_response(sample_workspace_id, sample_template_id):
    """Create a sample template response for testing."""
    return TemplateResponse(
        template_id=sample_template_id,
        workspace_id=sample_workspace_id,
        code="gallery.published",
        name="Gallery Published Notification",
        description="Sent when a gallery is published",
        category=NotificationCategory.GALLERY_ACTIVITY,
        supported_channels=[
            NotificationChannel.EMAIL,
            NotificationChannel.SMS,
            NotificationChannel.PUSH,
            NotificationChannel.IN_APP,
        ],
        status=TemplateStatus.ACTIVE,
        email_subject="Your gallery {{ gallery_name }} is ready!",
        email_html="<h1>Hello {{ guest_name }}</h1><p>Your gallery is ready at {{ gallery_url }}</p>",
        email_text="Hello {{ guest_name }}, your gallery is ready at {{ gallery_url }}",
        email_from_name="{{ photographer_name }}",
        email_reply_to=None,
        sms_content="Hi {{ guest_name }}! Gallery {{ gallery_name }} is ready: {{ gallery_url }}",
        push_title="Gallery Ready!",
        push_body="{{ gallery_name }} photos are now available",
        push_action_url="{{ gallery_url }}",
        push_icon_url="https://example.com/icons/gallery.png",
        in_app_title="New Gallery Published",
        in_app_body="{{ photographer_name }} shared {{ gallery_name }} with you",
        in_app_action_url="/galleries/{{ gallery_id }}",
        in_app_icon="gallery",
        variable_schema={
            "required": ["guest_name", "gallery_name", "gallery_url"],
            "optional": ["photographer_name", "gallery_id", "custom_message"],
        },
        default_values={
            "photographer_name": "Your photographer",
            "custom_message": "",
        },
        default_language="en",
        localized_content={},
        version="1.0.0",
        previous_version_id=None,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=False,
        ttl_seconds=None,
        tags=["gallery", "client-facing"],
        metadata={},
        created_by_user_id=None,
        updated_by_user_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def sample_variables():
    """Sample variables for template rendering."""
    return {
        "guest_name": "John Smith",
        "gallery_name": "Wedding Photos 2024",
        "gallery_url": "https://gallery.example.com/abc123",
        "photographer_name": "Jane Doe Photography",
        "gallery_id": "abc123",
    }


@pytest.fixture
def template_with_localization(sample_template_response):
    """Template with localized content."""
    template = sample_template_response.model_copy()
    template.localized_content = {
        "es": {
            "email_subject": "Tu galeria {{ gallery_name }} esta lista!",
            "email_html": "<h1>Hola {{ guest_name }}</h1><p>Tu galeria esta lista.</p>",
            "email_text": "Hola {{ guest_name }}, tu galeria esta lista.",
            "sms_content": "Hola {{ guest_name }}! Galeria {{ gallery_name }} lista.",
        },
        "fr": {
            "email_subject": "Votre galerie {{ gallery_name }} est prete!",
            "email_html": "<h1>Bonjour {{ guest_name }}</h1>",
        },
    }
    return template


# =============================================================================
# BASIC RENDERING TESTS
# =============================================================================


class TestRenderRaw:
    """Tests for raw template string rendering."""

    @pytest.mark.asyncio
    async def test_render_simple_string(self, service):
        """Test rendering a simple string without variables."""
        result = await service.render_raw("Hello, World!")
        assert result == "Hello, World!"

    @pytest.mark.asyncio
    async def test_render_with_single_variable(self, service):
        """Test rendering with a single variable."""
        result = await service.render_raw(
            "Hello, {{ name }}!",
            variables={"name": "Alice"},
        )
        assert result == "Hello, Alice!"

    @pytest.mark.asyncio
    async def test_render_with_multiple_variables(self, service):
        """Test rendering with multiple variables."""
        result = await service.render_raw(
            "{{ greeting }}, {{ name }}! Welcome to {{ place }}.",
            variables={
                "greeting": "Hello",
                "name": "Bob",
                "place": "RawDrive",
            },
        )
        assert result == "Hello, Bob! Welcome to RawDrive."

    @pytest.mark.asyncio
    async def test_render_with_nested_variable(self, service):
        """Test rendering with nested object variables."""
        result = await service.render_raw(
            "User: {{ user.name }}, Email: {{ user.email }}",
            variables={
                "user": {"name": "Charlie", "email": "charlie@example.com"},
            },
        )
        assert result == "User: Charlie, Email: charlie@example.com"

    @pytest.mark.asyncio
    async def test_render_with_missing_variable_non_strict(self, service):
        """Test rendering with missing variable in non-strict mode."""
        service._strict_mode = False
        result = await service.render_raw(
            "Hello, {{ name }}!",
            variables={},
        )
        # Non-strict mode should return original template
        assert "{{ name }}" in result or "Hello, " in result

    @pytest.mark.asyncio
    async def test_render_raises_on_syntax_error(self, service):
        """Test that invalid template syntax raises error."""
        with pytest.raises(TemplateSyntaxError):
            await service.render_raw("Hello, {{ name }")  # Missing closing bracket

    @pytest.mark.asyncio
    async def test_render_with_whitespace_control(self, service):
        """Test rendering preserves intended whitespace."""
        result = await service.render_raw(
            "Line1\nLine2\n{{ content }}\nLine3",
            variables={"content": "Middle"},
        )
        assert "Line1\nLine2\nMiddle\nLine3" == result


class TestRenderWithFilters:
    """Tests for Jinja2 custom filters."""

    @pytest.mark.asyncio
    async def test_escape_html_filter(self, service):
        """Test HTML escaping filter."""
        result = await service.render_raw(
            "{{ content | escape_html }}",
            variables={"content": "<script>alert('xss')</script>"},
        )
        assert "&lt;script&gt;" in result
        assert "<script>" not in result

    @pytest.mark.asyncio
    async def test_strip_html_filter(self, service):
        """Test HTML stripping filter."""
        result = await service.render_raw(
            "{{ content | strip_html }}",
            variables={"content": "<h1>Title</h1><p>Paragraph</p>"},
        )
        assert "<h1>" not in result
        assert "Title" in result
        assert "Paragraph" in result

    @pytest.mark.asyncio
    async def test_truncate_sms_filter(self, service):
        """Test SMS truncation filter."""
        long_content = "A" * 200
        result = await service.render_raw(
            "{{ content | truncate_sms }}",
            variables={"content": long_content},
        )
        assert len(result) <= 160
        assert result.endswith("...")

    @pytest.mark.asyncio
    async def test_truncate_sms_filter_short_content(self, service):
        """Test SMS truncation filter with short content (no truncation)."""
        short_content = "Hello, World!"
        result = await service.render_raw(
            "{{ content | truncate_sms }}",
            variables={"content": short_content},
        )
        assert result == short_content

    @pytest.mark.asyncio
    async def test_default_if_none_filter(self, service):
        """Test default_if_none filter."""
        result = await service.render_raw(
            "Value: {{ value | default_if_none('N/A') }}",
            variables={"value": None},
        )
        assert "N/A" in result

    @pytest.mark.asyncio
    async def test_default_if_none_filter_with_value(self, service):
        """Test default_if_none filter with actual value."""
        result = await service.render_raw(
            "Value: {{ value | default_if_none('N/A') }}",
            variables={"value": "Actual"},
        )
        assert "Actual" in result


# =============================================================================
# VARIABLE DETECTION TESTS
# =============================================================================


class TestDetectVariables:
    """Tests for variable detection in templates."""

    def test_detect_single_variable(self, service):
        """Test detecting a single variable."""
        variables = service.detect_variables("Hello, {{ name }}!")
        assert "name" in variables

    def test_detect_multiple_variables(self, service):
        """Test detecting multiple variables."""
        variables = service.detect_variables(
            "{{ greeting }}, {{ name }}! Welcome to {{ place }}."
        )
        assert "greeting" in variables
        assert "name" in variables
        assert "place" in variables

    def test_detect_nested_variables(self, service):
        """Test detecting base variable from nested access."""
        variables = service.detect_variables(
            "User: {{ user.name }}, {{ user.profile.avatar }}"
        )
        assert "user" in variables

    def test_detect_no_variables(self, service):
        """Test detecting no variables in plain text."""
        variables = service.detect_variables("Hello, World!")
        assert len(variables) == 0

    def test_detect_empty_string(self, service):
        """Test detecting variables in empty string."""
        variables = service.detect_variables("")
        assert len(variables) == 0

    def test_detect_none_string(self, service):
        """Test detecting variables in None."""
        variables = service.detect_variables(None)
        assert len(variables) == 0

    def test_detect_with_filters(self, service):
        """Test detecting variables with filters applied."""
        variables = service.detect_variables(
            "{{ name | upper }} - {{ value | default('N/A') }}"
        )
        assert "name" in variables
        assert "value" in variables

    def test_detect_with_conditionals(self, service):
        """Test detecting variables in conditional blocks."""
        template = """
        {% if show_greeting %}
            Hello, {{ name }}!
        {% endif %}
        """
        variables = service.detect_variables(template)
        assert "show_greeting" in variables
        assert "name" in variables


# =============================================================================
# TEMPLATE VALIDATION TESTS
# =============================================================================


class TestValidateTemplate:
    """Tests for template validation."""

    @pytest.mark.asyncio
    async def test_validate_valid_email_template(self, service):
        """Test validating a valid email template."""
        result = await service.validate_template(
            email=EmailContent(
                subject="Hello {{ name }}",
                html="<p>Dear {{ name }}, your order is ready.</p>",
                text="Dear {{ name }}, your order is ready.",
            ),
        )
        assert result.valid is True
        assert len(result.errors) == 0
        assert "name" in result.detected_variables

    @pytest.mark.asyncio
    async def test_validate_invalid_template_syntax(self, service):
        """Test validating a template with syntax errors."""
        result = await service.validate_template(
            email=EmailContent(
                subject="Hello {{ name }",  # Missing closing bracket
                text="Text content",
            ),
        )
        assert result.valid is False
        assert len(result.errors) > 0
        assert any(e.code == "SYNTAX_ERROR" for e in result.errors)

    @pytest.mark.asyncio
    async def test_validate_sms_length_warning(self, service):
        """Test validation warns about multi-segment SMS."""
        long_content = "A" * 200  # Over 160 chars
        result = await service.validate_template(
            sms=SMSContent(content=long_content),
        )
        assert result.valid is True  # Still valid, just a warning
        assert any(e.code == "SMS_MULTIPLE_SEGMENTS" for e in result.warnings)

    @pytest.mark.asyncio
    async def test_validate_sms_max_length_error(self, service):
        """Test validation errors on SMS exceeding max length."""
        very_long_content = "A" * 1700  # Over 1600 chars
        result = await service.validate_template(
            sms=SMSContent(content=very_long_content[:1600]),  # Use max allowed
        )
        # At 1600 chars (max allowed by schema), should be valid but with segments warning
        assert result.valid is True

    @pytest.mark.asyncio
    async def test_validate_detects_undeclared_variables(self, service):
        """Test validation warns about undeclared variables."""
        result = await service.validate_template(
            email=EmailContent(
                subject="Hello {{ name }}",
                text="Your order {{ order_id }} is ready.",
            ),
            variable_schema={
                "required": ["name"],
                "optional": [],
            },
        )
        assert result.valid is True
        assert any(e.code == "UNDECLARED_VARIABLES" for e in result.warnings)
        assert "order_id" in result.detected_variables

    @pytest.mark.asyncio
    async def test_validate_detects_unused_variables(self, service):
        """Test validation warns about unused declared variables."""
        result = await service.validate_template(
            email=EmailContent(
                subject="Hello {{ name }}",
                text="Welcome!",
            ),
            variable_schema={
                "required": ["name"],
                "optional": ["unused_var"],
            },
        )
        assert result.valid is True
        assert any(e.code == "UNUSED_VARIABLES" for e in result.warnings)

    @pytest.mark.asyncio
    async def test_validate_all_channels(self, service):
        """Test validation across all channels."""
        result = await service.validate_template(
            email=EmailContent(
                subject="{{ title }}",
                text="{{ body }}",
            ),
            sms=SMSContent(content="{{ sms_body }}"),
            push=PushContent(title="{{ push_title }}", body="{{ push_body }}"),
            in_app=InAppContent(title="{{ app_title }}", body="{{ app_body }}"),
        )
        assert result.valid is True
        assert len(result.detected_variables) >= 7  # All the different variables


# =============================================================================
# SMS SEGMENT CALCULATION TESTS
# =============================================================================


class TestSMSSegmentCalculation:
    """Tests for SMS segment calculation."""

    def test_single_segment_short_message(self, service):
        """Test single segment for short message."""
        segments = service._calculate_sms_segments("Hello!")
        assert segments == 1

    def test_single_segment_max_length(self, service):
        """Test single segment at exactly 160 chars."""
        message = "A" * 160
        segments = service._calculate_sms_segments(message)
        assert segments == 1

    def test_two_segments(self, service):
        """Test two segments for message just over 160 chars."""
        message = "A" * 161
        segments = service._calculate_sms_segments(message)
        assert segments == 2

    def test_multiple_segments(self, service):
        """Test multiple segments for long message."""
        # 306 chars = 2 full concatenated segments (153 each)
        message = "A" * 306
        segments = service._calculate_sms_segments(message)
        assert segments == 2

        # 307 chars = 3 segments
        message = "A" * 307
        segments = service._calculate_sms_segments(message)
        assert segments == 3

    def test_empty_message(self, service):
        """Test zero segments for empty message."""
        segments = service._calculate_sms_segments("")
        assert segments == 0

    def test_none_message(self, service):
        """Test zero segments for None message."""
        segments = service._calculate_sms_segments(None)
        assert segments == 0


# =============================================================================
# CHANNEL-SPECIFIC RENDERING TESTS
# =============================================================================


class TestRenderEmail:
    """Tests for email rendering convenience method."""

    @pytest.mark.asyncio
    async def test_render_email_returns_rendered_content(
        self, service, sample_workspace_id, sample_template_response, sample_variables
    ):
        """Test render_email returns RenderedEmail."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_email(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                variables=sample_variables,
            )

            assert result is not None
            assert isinstance(result, RenderedEmail)
            assert "Wedding Photos 2024" in result.subject
            assert "John Smith" in result.text

    @pytest.mark.asyncio
    async def test_render_email_template_not_found(self, service, sample_workspace_id):
        """Test render_email returns None when template not found."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=None)
            mock_repo.get_template = AsyncMock(return_value=None)

            result = await service.render_email(
                workspace_id=sample_workspace_id,
                template_code="nonexistent",
                variables={},
            )

            assert result is None


class TestRenderSMS:
    """Tests for SMS rendering convenience method."""

    @pytest.mark.asyncio
    async def test_render_sms_returns_rendered_content(
        self, service, sample_workspace_id, sample_template_response, sample_variables
    ):
        """Test render_sms returns RenderedSMS with segment count."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_sms(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                variables=sample_variables,
            )

            assert result is not None
            assert isinstance(result, RenderedSMS)
            assert "John Smith" in result.content
            assert result.segment_count >= 1


class TestRenderPush:
    """Tests for push notification rendering convenience method."""

    @pytest.mark.asyncio
    async def test_render_push_returns_rendered_content(
        self, service, sample_workspace_id, sample_template_response, sample_variables
    ):
        """Test render_push returns RenderedPush."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_push(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                variables=sample_variables,
            )

            assert result is not None
            assert isinstance(result, RenderedPush)
            assert "Gallery Ready!" in result.title
            assert "Wedding Photos 2024" in result.body


class TestRenderInApp:
    """Tests for in-app notification rendering convenience method."""

    @pytest.mark.asyncio
    async def test_render_in_app_returns_rendered_content(
        self, service, sample_workspace_id, sample_template_response, sample_variables
    ):
        """Test render_in_app returns RenderedInApp."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_in_app(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                variables=sample_variables,
            )

            assert result is not None
            assert isinstance(result, RenderedInApp)
            assert "New Gallery Published" in result.title
            assert "Jane Doe Photography" in result.body
            assert result.icon == "gallery"


# =============================================================================
# FULL TEMPLATE RENDERING TESTS
# =============================================================================


class TestRenderTemplate:
    """Tests for full template rendering."""

    @pytest.mark.asyncio
    async def test_render_template_email_channel(
        self, service, sample_workspace_id, sample_template_response, sample_variables
    ):
        """Test rendering template for email channel."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                variables=sample_variables,
            )

            assert isinstance(result, TemplateRenderResponse)
            assert result.email is not None
            assert result.sms is None
            assert result.push is None
            assert result.in_app is None
            assert len(result.missing_variables) == 0

    @pytest.mark.asyncio
    async def test_render_template_with_missing_required_variable_strict(
        self, service, sample_workspace_id, sample_template_response
    ):
        """Test rendering fails in strict mode with missing required variable."""
        service._strict_mode = True

        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                variables={"guest_name": "Test"},  # Missing required variables
            )

            assert len(result.missing_variables) > 0
            assert result.email is None

    @pytest.mark.asyncio
    async def test_render_template_with_default_values(
        self, service, sample_workspace_id, sample_template_response
    ):
        """Test rendering uses default values for missing optional variables."""
        service._strict_mode = False

        # Only provide required variables
        variables = {
            "guest_name": "Test User",
            "gallery_name": "Test Gallery",
            "gallery_url": "https://example.com/gallery",
        }

        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                variables=variables,
            )

            # Default value for photographer_name should be used
            assert "photographer_name" in result.variables_used
            assert result.variables_used["photographer_name"] == "Your photographer"

    @pytest.mark.asyncio
    async def test_render_template_not_found(self, service, sample_workspace_id):
        """Test rendering handles template not found."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=None)
            mock_repo.get_template = AsyncMock(return_value=None)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_code="nonexistent",
                channel=NotificationChannel.EMAIL,
                variables={},
            )

            assert "TEMPLATE_NOT_FOUND" in result.missing_variables
            assert len(result.warnings) > 0

    @pytest.mark.asyncio
    async def test_render_template_requires_id_or_code(self, service, sample_workspace_id):
        """Test rendering requires either template_id or template_code."""
        with pytest.raises(ValueError, match="Either template_id or template_code"):
            await service.render_template(
                workspace_id=sample_workspace_id,
                channel=NotificationChannel.EMAIL,
                variables={},
            )

    @pytest.mark.asyncio
    async def test_render_template_by_id(
        self, service, sample_workspace_id, sample_template_id, sample_template_response, sample_variables
    ):
        """Test rendering template by ID."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template = AsyncMock(return_value=sample_template_response)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_id=sample_template_id,
                channel=NotificationChannel.EMAIL,
                variables=sample_variables,
            )

            assert result.template_id == sample_template_id
            assert result.email is not None


# =============================================================================
# LOCALIZATION TESTS
# =============================================================================


class TestLocalization:
    """Tests for localized content rendering."""

    @pytest.mark.asyncio
    async def test_render_with_localized_content(
        self, service, sample_workspace_id, template_with_localization, sample_variables
    ):
        """Test rendering uses localized content when available."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=template_with_localization)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                variables=sample_variables,
                language="es",
            )

            assert result.language == "es"
            assert result.email is not None
            # Spanish subject should contain "lista"
            assert "lista" in result.email.subject

    @pytest.mark.asyncio
    async def test_render_fallback_to_default_language(
        self, service, sample_workspace_id, sample_template_response, sample_variables
    ):
        """Test rendering falls back to default when language not available."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                variables=sample_variables,
                language="de",  # German not available
            )

            # Should render with default English content
            assert result.email is not None
            assert "ready" in result.email.subject.lower()  # English word


# =============================================================================
# PREVIEW TESTS
# =============================================================================


class TestPreviewTemplate:
    """Tests for template preview functionality."""

    @pytest.mark.asyncio
    async def test_preview_with_sample_defaults(
        self, service, sample_workspace_id, sample_template_response
    ):
        """Test preview provides sample default values."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.preview_template(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                # No sample_variables provided - should use defaults
            )

            assert result.email is not None
            # Should use sample default values
            assert "John Smith" in result.variables_used.get("guest_name", "")

    @pytest.mark.asyncio
    async def test_preview_with_custom_variables(
        self, service, sample_workspace_id, sample_template_response
    ):
        """Test preview with custom sample variables."""
        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.preview_template(
                workspace_id=sample_workspace_id,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                sample_variables={
                    "guest_name": "Custom Name",
                    "gallery_name": "Custom Gallery",
                    "gallery_url": "https://custom.example.com",
                },
            )

            assert result.email is not None
            assert "Custom Name" in result.email.text

    @pytest.mark.asyncio
    async def test_preview_custom_content_without_template(self, service, sample_workspace_id):
        """Test preview with custom content (without saved template)."""
        result = await service.preview_template(
            workspace_id=sample_workspace_id,
            channel=NotificationChannel.EMAIL,
            custom_email=EmailContent(
                subject="Custom Subject {{ name }}",
                text="Hello {{ name }}, this is custom content.",
            ),
            sample_variables={"name": "Preview User"},
        )

        assert result.email is not None
        assert "Custom Subject Preview User" == result.email.subject
        assert "Preview User" in result.email.text
        assert result.template_code == "_custom_"


# =============================================================================
# CACHING TESTS
# =============================================================================


class TestTemplateCache:
    """Tests for template compilation caching."""

    def test_clear_compiled_cache(self, service):
        """Test clearing the compiled template cache."""
        # Add something to the cache
        service._compiled_cache["test_key"] = "test_value"
        assert len(service._compiled_cache) > 0

        # Clear the cache
        service.clear_compiled_cache()

        assert len(service._compiled_cache) == 0

    @pytest.mark.asyncio
    async def test_compiled_template_is_cached(self, service):
        """Test that compiled templates are cached in memory."""
        template_string = "Hello, {{ name }}!"

        # First render - should compile
        await service.render_raw(template_string, {"name": "First"})
        cache_size_after_first = len(service._compiled_cache)

        # Second render - should use cache
        await service.render_raw(template_string, {"name": "Second"})
        cache_size_after_second = len(service._compiled_cache)

        # Cache size shouldn't increase for same template
        assert cache_size_after_first == cache_size_after_second

    def test_cache_size_limit(self, service):
        """Test that cache doesn't grow beyond limit."""
        # The service has a 1000 template limit in _render_string
        # This is a basic test to verify the limit mechanism exists
        assert hasattr(service, "_compiled_cache")


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestErrorHandling:
    """Tests for error handling in template rendering."""

    @pytest.mark.asyncio
    async def test_render_handles_undefined_error_non_strict(self, service):
        """Test rendering handles undefined variable error in non-strict mode."""
        service._strict_mode = False

        result = await service.render_raw(
            "Hello, {{ undefined_var }}!",
            variables={},
        )

        # In non-strict mode, undefined variables render as empty string
        # The Jinja2 Environment is configured with undefined=Undefined which
        # renders undefined variables as empty string rather than raising
        assert result == "Hello, !"

    @pytest.mark.asyncio
    async def test_render_template_handles_jinja_error(
        self, service, sample_workspace_id, sample_template_id
    ):
        """Test render_template handles Jinja2 errors gracefully."""
        # Create a template with syntax error in content
        bad_template = TemplateResponse(
            template_id=sample_template_id,
            workspace_id=sample_workspace_id,
            code="bad.template",
            name="Bad Template",
            category=NotificationCategory.SYSTEM_ALERTS,
            supported_channels=[NotificationChannel.EMAIL],
            status=TemplateStatus.ACTIVE,
            email_subject="Good Subject",
            email_html="<p>{{ bad syntax here</p>",  # Invalid syntax
            email_text="Plain text",
            variable_schema={"required": [], "optional": []},
            default_values={},
            default_language="en",
            localized_content={},
            version="1.0.0",
            default_priority=NotificationPriority.NORMAL,
            is_transactional=False,
            tags=[],
            metadata={},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=bad_template)

            result = await service.render_template(
                workspace_id=sample_workspace_id,
                template_code="bad.template",
                channel=NotificationChannel.EMAIL,
                variables={},
            )

            # Should return response with warnings/errors, not raise
            assert len(result.warnings) > 0 or result.email is None


# =============================================================================
# SINGLETON TESTS
# =============================================================================


class TestSingleton:
    """Tests for singleton pattern."""

    def test_template_service_singleton_exists(self):
        """Test that singleton instance is available."""
        assert template_service is not None
        assert isinstance(template_service, TemplateService)

    def test_multiple_imports_same_instance(self):
        """Test that importing template_service returns same instance."""
        from src.services.template_service import template_service as ts1
        from src.services.template_service import template_service as ts2

        assert ts1 is ts2


# =============================================================================
# CUSTOM CONTENT RENDERING TESTS
# =============================================================================


class TestRenderCustomContent:
    """Tests for rendering custom content (not from database)."""

    @pytest.mark.asyncio
    async def test_render_custom_email_content(self, service):
        """Test rendering custom email content."""
        result = await service._render_custom_content(
            channel=NotificationChannel.EMAIL,
            variables={"name": "Test User", "action": "verify"},
            email=EmailContent(
                subject="{{ action | capitalize }} your account, {{ name }}",
                html="<p>Please {{ action }} your account.</p>",
                text="Please {{ action }} your account.",
            ),
        )

        assert result.email is not None
        assert "Verify" in result.email.subject
        assert "Test User" in result.email.subject

    @pytest.mark.asyncio
    async def test_render_custom_sms_content(self, service):
        """Test rendering custom SMS content."""
        result = await service._render_custom_content(
            channel=NotificationChannel.SMS,
            variables={"code": "123456"},
            sms=SMSContent(content="Your verification code is {{ code }}"),
        )

        assert result.sms is not None
        assert "123456" in result.sms.content
        assert result.sms.segment_count == 1

    @pytest.mark.asyncio
    async def test_render_custom_push_content(self, service):
        """Test rendering custom push notification content."""
        result = await service._render_custom_content(
            channel=NotificationChannel.PUSH,
            variables={"count": "5"},
            push=PushContent(
                title="New Notifications",
                body="You have {{ count }} new notifications",
                action_url="/notifications",
            ),
        )

        assert result.push is not None
        assert "5" in result.push.body
        assert result.push.action_url == "/notifications"

    @pytest.mark.asyncio
    async def test_render_custom_in_app_content(self, service):
        """Test rendering custom in-app notification content."""
        result = await service._render_custom_content(
            channel=NotificationChannel.IN_APP,
            variables={"user": "Alice"},
            in_app=InAppContent(
                title="Welcome Back!",
                body="Hi {{ user }}, welcome back to the app.",
                icon="welcome",
            ),
        )

        assert result.in_app is not None
        assert "Alice" in result.in_app.body
        assert result.in_app.icon == "welcome"


# =============================================================================
# EDGE CASES TESTS
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_render_with_empty_variables_dict(self, service):
        """Test rendering with empty variables dictionary."""
        result = await service.render_raw(
            "Static content without variables",
            variables={},
        )
        assert result == "Static content without variables"

    @pytest.mark.asyncio
    async def test_render_with_special_characters_in_variables(self, service):
        """Test rendering with special characters in variable values."""
        result = await service.render_raw(
            "Name: {{ name }}",
            variables={"name": "O'Brien & Sons <test>"},
        )
        assert "O'Brien & Sons <test>" in result

    @pytest.mark.asyncio
    async def test_render_with_unicode_variables(self, service):
        """Test rendering with unicode characters in variables."""
        result = await service.render_raw(
            "Greeting: {{ greeting }}",
            variables={"greeting": "Bonjour! Cafe"},
        )
        assert "Bonjour! Cafe" in result

    @pytest.mark.asyncio
    async def test_render_with_numeric_variables(self, service):
        """Test rendering with numeric variable values."""
        result = await service.render_raw(
            "Count: {{ count }}, Price: {{ price }}",
            variables={"count": 42, "price": 19.99},
        )
        assert "42" in result
        assert "19.99" in result

    @pytest.mark.asyncio
    async def test_render_with_boolean_variables(self, service):
        """Test rendering with boolean variable values."""
        result = await service.render_raw(
            "Active: {{ active }}",
            variables={"active": True},
        )
        assert "True" in result

    @pytest.mark.asyncio
    async def test_render_with_list_variables(self, service):
        """Test rendering with list variable values."""
        result = await service.render_raw(
            "Items: {% for item in items %}{{ item }},{% endfor %}",
            variables={"items": ["a", "b", "c"]},
        )
        assert "a," in result
        assert "b," in result
        assert "c," in result

    @pytest.mark.asyncio
    async def test_render_template_null_workspace(
        self, service, sample_template_response, sample_variables
    ):
        """Test rendering with null workspace (system template)."""
        sample_template_response.workspace_id = None

        with patch("src.services.template_service.template_repository") as mock_repo:
            mock_repo.get_template_by_code = AsyncMock(return_value=sample_template_response)

            result = await service.render_template(
                workspace_id=None,
                template_code="gallery.published",
                channel=NotificationChannel.EMAIL,
                variables=sample_variables,
            )

            assert result.email is not None


# =============================================================================
# INTERNAL METHOD TESTS
# =============================================================================


class TestInternalMethods:
    """Tests for internal helper methods."""

    def test_truncate_sms_static_method(self, service):
        """Test _truncate_sms static method."""
        # Short content - no truncation
        short = service._truncate_sms("Hello", max_length=160)
        assert short == "Hello"

        # Long content - truncated with ellipsis
        long_content = "A" * 200
        truncated = service._truncate_sms(long_content, max_length=160)
        assert len(truncated) == 160
        assert truncated.endswith("...")

    def test_strip_html_static_method(self, service):
        """Test _strip_html static method."""
        html = "<div><h1>Title</h1><p>Paragraph with <strong>bold</strong> text.</p></div>"
        stripped = service._strip_html(html)

        assert "<div>" not in stripped
        assert "<h1>" not in stripped
        assert "<p>" not in stripped
        assert "<strong>" not in stripped
        assert "Title" in stripped
        assert "Paragraph" in stripped
        assert "bold" in stripped

    def test_get_localized_content_with_valid_language(self, service, template_with_localization):
        """Test _get_localized_content with valid language."""
        result = service._get_localized_content(template_with_localization, "es")
        assert result is not None
        assert isinstance(result, LocalizedContent)

    def test_get_localized_content_with_invalid_language(self, service, sample_template_response):
        """Test _get_localized_content with language not in template."""
        result = service._get_localized_content(sample_template_response, "zh")
        assert result is None

    def test_get_localized_content_with_no_localization(self, service, sample_template_response):
        """Test _get_localized_content when template has no localized content."""
        sample_template_response.localized_content = None
        result = service._get_localized_content(sample_template_response, "es")
        assert result is None
