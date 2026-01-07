"""Unit tests for NotificationService.

Tests the main notification orchestration service including:
- Notification creation and sending
- Batch notification processing
- Preference checking and transactional bypass
- Idempotency key handling
- Channel dispatch routing
- Notification processing and retry logic
- Event category mapping

Feature: Notifications & Communication Microservice
Task: T046 - Create unit tests for notification_service
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from src.services.notification_service import (
    NotificationService,
    NotificationServiceError,
    NotificationNotFoundError,
    DuplicateNotificationError,
    NotificationPreferenceBlockedError,
    NotificationProcessingError,
    get_notification_service,
)
from src.schemas.notification import (
    NotificationChannel,
    NotificationCategory,
    NotificationPriority,
    NotificationEventStatus,
    NotificationDeliveryStatus,
    NotificationProvider,
    NotificationCreateRequest,
    NotificationBatchCreateRequest,
    NotificationRecipient,
    NotificationEventResponse,
    NotificationTask,
    NotificationResult,
)
from src.schemas.preference import PreferenceCheckResult


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def notification_service():
    """Create notification service instance."""
    return NotificationService()


@pytest.fixture
def sample_workspace_id():
    """Sample workspace ID."""
    return UUID("550e8400-e29b-41d4-a716-446655440000")


@pytest.fixture
def sample_user_id():
    """Sample user ID."""
    return UUID("550e8400-e29b-41d4-a716-446655440001")


@pytest.fixture
def sample_event_id():
    """Sample event ID."""
    return UUID("550e8400-e29b-41d4-a716-446655440002")


@pytest.fixture
def sample_notification_request(sample_user_id):
    """Sample notification create request."""
    return NotificationCreateRequest(
        recipient=NotificationRecipient(
            user_id=sample_user_id,
            email="test@example.com",
        ),
        event_type="gallery.published",
        category=NotificationCategory.GALLERY_ACTIVITY,
        channel=NotificationChannel.EMAIL,
        priority=NotificationPriority.NORMAL,
        template_code="gallery_published",
        subject="Your gallery is ready!",
        payload={
            "gallery_name": "Wedding Photos",
            "gallery_url": "https://gallery.example.com/abc123",
        },
    )


@pytest.fixture
def sample_event_response(sample_workspace_id, sample_user_id, sample_event_id):
    """Sample notification event response."""
    return NotificationEventResponse(
        event_id=sample_event_id,
        workspace_id=sample_workspace_id,
        recipient_user_id=sample_user_id,
        recipient_email="test@example.com",
        event_type="gallery.published",
        category=NotificationCategory.GALLERY_ACTIVITY,
        channel=NotificationChannel.EMAIL,
        priority=NotificationPriority.NORMAL,
        template_code="gallery_published",
        subject="Your gallery is ready!",
        payload={"gallery_name": "Wedding Photos"},
        status=NotificationEventStatus.PENDING,
        retry_count=0,
        max_retries=3,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


# =============================================================================
# EXCEPTION TESTS
# =============================================================================


class TestNotificationServiceExceptions:
    """Tests for notification service exceptions."""

    def test_notification_service_error_attributes(self):
        """Test NotificationServiceError has correct attributes."""
        error = NotificationServiceError(
            message="Test error",
            code="TEST_ERROR",
            details={"key": "value"},
        )

        assert str(error) == "Test error"
        assert error.code == "TEST_ERROR"
        assert error.details == {"key": "value"}

    def test_notification_not_found_error(self):
        """Test NotificationNotFoundError has correct attributes."""
        event_id = uuid4()
        error = NotificationNotFoundError(event_id)

        assert "not found" in str(error).lower()
        assert error.code == "NOTIFICATION_NOT_FOUND"
        assert error.details["event_id"] == str(event_id)

    def test_duplicate_notification_error(self):
        """Test DuplicateNotificationError has correct attributes."""
        idempotency_key = "test-key-123"
        existing_event_id = uuid4()
        error = DuplicateNotificationError(idempotency_key, existing_event_id)

        assert idempotency_key in str(error)
        assert error.code == "DUPLICATE_NOTIFICATION"
        assert error.existing_event_id == existing_event_id
        assert error.details["idempotency_key"] == idempotency_key

    def test_notification_preference_blocked_error(self):
        """Test NotificationPreferenceBlockedError has correct attributes."""
        user_id = uuid4()
        error = NotificationPreferenceBlockedError("User disabled emails", user_id)

        assert "blocked" in str(error).lower()
        assert error.code == "PREFERENCE_BLOCKED"
        assert error.reason == "User disabled emails"
        assert error.details["user_id"] == str(user_id)

    def test_notification_processing_error(self):
        """Test NotificationProcessingError has correct attributes."""
        event_id = uuid4()
        error = NotificationProcessingError(
            message="Processing failed",
            event_id=event_id,
            should_retry=True,
        )

        assert error.code == "PROCESSING_ERROR"
        assert error.event_id == event_id
        assert error.should_retry is True


# =============================================================================
# NOTIFICATION CREATION TESTS
# =============================================================================


class TestSendNotification:
    """Tests for send_notification method."""

    @pytest.mark.asyncio
    async def test_send_notification_creates_event(
        self,
        notification_service,
        sample_workspace_id,
        sample_notification_request,
        sample_event_response,
    ):
        """Test send_notification creates a notification event."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            with patch("src.services.notification_service.preference_repository") as mock_pref:
                with patch.object(notification_service, "_process_notification") as mock_process:
                    # Setup mocks
                    mock_repo.get_notification_event_by_idempotency_key = AsyncMock(return_value=None)
                    mock_repo.create_notification_event = AsyncMock(return_value=sample_event_response)
                    mock_pref.check_notification_preference = AsyncMock(
                        return_value=PreferenceCheckResult(should_send=True)
                    )
                    mock_process.return_value = NotificationResult(
                        event_id=sample_event_response.event_id,
                        success=True,
                        status=NotificationEventStatus.SENT,
                    )

                    result = await notification_service.send_notification(
                        workspace_id=sample_workspace_id,
                        request=sample_notification_request,
                        source_service="test",
                    )

                    assert result.event_id == sample_event_response.event_id
                    mock_repo.create_notification_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_notification_checks_idempotency(
        self,
        notification_service,
        sample_workspace_id,
        sample_notification_request,
        sample_event_response,
    ):
        """Test send_notification detects duplicate idempotency keys."""
        sample_notification_request.idempotency_key = "unique-key-123"

        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_notification_event_by_idempotency_key = AsyncMock(
                return_value=sample_event_response
            )

            with pytest.raises(DuplicateNotificationError) as exc_info:
                await notification_service.send_notification(
                    workspace_id=sample_workspace_id,
                    request=sample_notification_request,
                )

            assert exc_info.value.existing_event_id == sample_event_response.event_id
            assert "unique-key-123" in exc_info.value.details["idempotency_key"]

    @pytest.mark.asyncio
    async def test_send_notification_skips_when_preference_blocked(
        self,
        notification_service,
        sample_workspace_id,
        sample_notification_request,
        sample_event_response,
    ):
        """Test send_notification creates skipped event when blocked by preferences."""
        skipped_event = sample_event_response.model_copy()
        skipped_event.status = NotificationEventStatus.SKIPPED

        with patch("src.services.notification_service.notification_repository") as mock_repo:
            with patch("src.services.notification_service.preference_repository") as mock_pref:
                mock_repo.get_notification_event_by_idempotency_key = AsyncMock(return_value=None)
                mock_repo.create_notification_event = AsyncMock(return_value=sample_event_response)
                mock_repo.update_event_status = AsyncMock()
                mock_repo.get_notification_event = AsyncMock(return_value=skipped_event)

                mock_pref.check_notification_preference = AsyncMock(
                    return_value=PreferenceCheckResult(
                        should_send=False,
                        reason="User disabled gallery notifications",
                    )
                )

                result = await notification_service.send_notification(
                    workspace_id=sample_workspace_id,
                    request=sample_notification_request,
                )

                assert result.status == NotificationEventStatus.SKIPPED

    @pytest.mark.asyncio
    async def test_send_notification_bypasses_preference_for_transactional(
        self,
        notification_service,
        sample_workspace_id,
        sample_event_response,
    ):
        """Test transactional notifications bypass preference checks."""
        # Billing category is transactional
        transactional_request = NotificationCreateRequest(
            recipient=NotificationRecipient(email="test@example.com"),
            event_type="billing.payment_failed",
            category=NotificationCategory.BILLING,
            channel=NotificationChannel.EMAIL,
        )

        with patch("src.services.notification_service.notification_repository") as mock_repo:
            with patch("src.services.notification_service.preference_repository") as mock_pref:
                with patch.object(notification_service, "_process_notification") as mock_process:
                    mock_repo.get_notification_event_by_idempotency_key = AsyncMock(return_value=None)
                    mock_repo.create_notification_event = AsyncMock(return_value=sample_event_response)
                    mock_process.return_value = NotificationResult(
                        event_id=sample_event_response.event_id,
                        success=True,
                        status=NotificationEventStatus.SENT,
                    )

                    await notification_service.send_notification(
                        workspace_id=sample_workspace_id,
                        request=transactional_request,
                    )

                    # Preference check should not be called for transactional
                    mock_pref.check_notification_preference.assert_not_called()


class TestSendBatchNotifications:
    """Tests for batch notification sending."""

    @pytest.mark.asyncio
    async def test_send_batch_notifications_processes_all(
        self,
        notification_service,
        sample_workspace_id,
        sample_user_id,
    ):
        """Test batch notifications processes all items."""
        notifications = [
            NotificationCreateRequest(
                recipient=NotificationRecipient(email=f"user{i}@example.com"),
                event_type="gallery.published",
                category=NotificationCategory.GALLERY_ACTIVITY,
                channel=NotificationChannel.EMAIL,
            )
            for i in range(5)
        ]

        batch_request = NotificationBatchCreateRequest(
            notifications=notifications,
            correlation_id=uuid4(),
        )

        with patch.object(notification_service, "send_notification") as mock_send:
            mock_send.return_value = MagicMock(event_id=uuid4())

            result = await notification_service.send_batch_notifications(
                workspace_id=sample_workspace_id,
                request=batch_request,
            )

            assert result.created == 5
            assert result.failed == 0
            assert len(result.event_ids) == 5
            assert mock_send.call_count == 5

    @pytest.mark.asyncio
    async def test_send_batch_notifications_handles_partial_failures(
        self,
        notification_service,
        sample_workspace_id,
    ):
        """Test batch handles partial failures gracefully."""
        notifications = [
            NotificationCreateRequest(
                recipient=NotificationRecipient(email=f"user{i}@example.com"),
                event_type="gallery.published",
                category=NotificationCategory.GALLERY_ACTIVITY,
                channel=NotificationChannel.EMAIL,
            )
            for i in range(3)
        ]

        batch_request = NotificationBatchCreateRequest(notifications=notifications)

        call_count = 0

        async def mock_send(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise Exception("Simulated failure")
            return MagicMock(event_id=uuid4())

        with patch.object(notification_service, "send_notification", side_effect=mock_send):
            result = await notification_service.send_batch_notifications(
                workspace_id=sample_workspace_id,
                request=batch_request,
            )

            assert result.created == 2
            assert result.failed == 1
            assert len(result.errors) == 1

    @pytest.mark.asyncio
    async def test_send_batch_notifications_handles_duplicates(
        self,
        notification_service,
        sample_workspace_id,
    ):
        """Test batch treats duplicates as successful (idempotent)."""
        existing_event_id = uuid4()

        notifications = [
            NotificationCreateRequest(
                recipient=NotificationRecipient(email="user@example.com"),
                event_type="gallery.published",
                category=NotificationCategory.GALLERY_ACTIVITY,
                channel=NotificationChannel.EMAIL,
                idempotency_key="duplicate-key",
            )
        ]

        batch_request = NotificationBatchCreateRequest(notifications=notifications)

        with patch.object(notification_service, "send_notification") as mock_send:
            mock_send.side_effect = DuplicateNotificationError(
                "duplicate-key", existing_event_id
            )

            result = await notification_service.send_batch_notifications(
                workspace_id=sample_workspace_id,
                request=batch_request,
            )

            # Duplicate should still count as created (idempotent success)
            assert result.created == 1
            assert existing_event_id in result.event_ids


# =============================================================================
# TRANSACTIONAL DETECTION TESTS
# =============================================================================


class TestTransactionalDetection:
    """Tests for transactional notification detection."""

    def test_billing_category_is_transactional(self, notification_service):
        """Test billing category is identified as transactional."""
        result = notification_service._is_transactional(
            NotificationCategory.BILLING, "billing.payment_failed"
        )
        assert result is True

    def test_system_alerts_is_not_transactional_by_default(self, notification_service):
        """Test system alerts category is not transactional by default.

        Note: Only billing and security categories are transactional by default.
        System alerts can be made transactional via config if needed.
        """
        result = notification_service._is_transactional(
            NotificationCategory.SYSTEM_ALERTS, "system.maintenance"
        )
        assert result is False

    def test_marketing_is_not_transactional(self, notification_service):
        """Test marketing category is not transactional."""
        result = notification_service._is_transactional(
            NotificationCategory.MARKETING, "marketing.newsletter"
        )
        assert result is False

    def test_password_reset_event_is_transactional(self, notification_service):
        """Test password_reset event type is transactional regardless of category."""
        result = notification_service._is_transactional(
            NotificationCategory.GALLERY_ACTIVITY, "password_reset_requested"
        )
        assert result is True

    def test_verification_event_is_transactional(self, notification_service):
        """Test verification event type is transactional."""
        result = notification_service._is_transactional(
            NotificationCategory.GALLERY_ACTIVITY, "verification_email"
        )
        assert result is True

    def test_security_alert_event_is_transactional(self, notification_service):
        """Test security_alert event type is transactional."""
        result = notification_service._is_transactional(
            NotificationCategory.GALLERY_ACTIVITY, "security_alert_login"
        )
        assert result is True


# =============================================================================
# PRIORITY AND SCHEDULING TESTS
# =============================================================================


class TestPriorityAndScheduling:
    """Tests for priority-based processing decisions."""

    def test_urgent_priority_processes_immediately(
        self, notification_service, sample_event_response
    ):
        """Test urgent priority notifications process immediately."""
        sample_event_response.priority = NotificationPriority.URGENT
        sample_event_response.scheduled_for = None

        result = notification_service._should_process_immediately(sample_event_response)
        assert result is True

    def test_high_priority_processes_immediately(
        self, notification_service, sample_event_response
    ):
        """Test high priority notifications process immediately."""
        sample_event_response.priority = NotificationPriority.HIGH
        sample_event_response.scheduled_for = None

        result = notification_service._should_process_immediately(sample_event_response)
        assert result is True

    def test_normal_priority_without_schedule_processes_immediately(
        self, notification_service, sample_event_response
    ):
        """Test normal priority without schedule processes immediately."""
        sample_event_response.priority = NotificationPriority.NORMAL
        sample_event_response.scheduled_for = None

        result = notification_service._should_process_immediately(sample_event_response)
        assert result is True

    def test_scheduled_for_past_processes_immediately(
        self, notification_service, sample_event_response
    ):
        """Test scheduled notifications in the past process immediately."""
        sample_event_response.priority = NotificationPriority.NORMAL
        sample_event_response.scheduled_for = datetime.now(timezone.utc) - timedelta(hours=1)

        result = notification_service._should_process_immediately(sample_event_response)
        assert result is True

    def test_scheduled_for_future_does_not_process_immediately(
        self, notification_service, sample_event_response
    ):
        """Test scheduled notifications in the future are deferred."""
        sample_event_response.priority = NotificationPriority.LOW
        sample_event_response.scheduled_for = datetime.now(timezone.utc) + timedelta(hours=1)

        result = notification_service._should_process_immediately(sample_event_response)
        assert result is False


# =============================================================================
# CATEGORY MAPPING TESTS
# =============================================================================


class TestCategoryMapping:
    """Tests for event type to category mapping."""

    def test_gallery_event_maps_to_gallery_category(self, notification_service):
        """Test gallery events map to gallery_activity category."""
        result = notification_service._get_category_for_event("gallery.published")
        assert result == NotificationCategory.GALLERY_ACTIVITY

    def test_album_event_maps_to_gallery_category(self, notification_service):
        """Test album events map to gallery_activity category."""
        result = notification_service._get_category_for_event("album.created")
        assert result == NotificationCategory.GALLERY_ACTIVITY

    def test_billing_event_maps_to_billing_category(self, notification_service):
        """Test billing events map to billing category."""
        result = notification_service._get_category_for_event("billing.payment_failed")
        assert result == NotificationCategory.BILLING

    def test_payment_event_maps_to_billing_category(self, notification_service):
        """Test payment events map to billing category."""
        result = notification_service._get_category_for_event("payment.completed")
        assert result == NotificationCategory.BILLING

    def test_subscription_event_maps_to_billing_category(self, notification_service):
        """Test subscription events map to billing category."""
        result = notification_service._get_category_for_event("subscription.renewed")
        assert result == NotificationCategory.BILLING

    def test_marketing_event_maps_to_marketing_category(self, notification_service):
        """Test marketing events map to marketing category."""
        result = notification_service._get_category_for_event("marketing.campaign")
        assert result == NotificationCategory.MARKETING

    def test_invitation_event_maps_to_invitation_category(self, notification_service):
        """Test invitation events map to invitation category."""
        result = notification_service._get_category_for_event("invitation.sent")
        assert result == NotificationCategory.INVITATION

    def test_system_event_maps_to_system_alerts(self, notification_service):
        """Test system events map to system_alerts category."""
        result = notification_service._get_category_for_event("system.maintenance")
        assert result == NotificationCategory.SYSTEM_ALERTS

    def test_unknown_event_defaults_to_system_alerts(self, notification_service):
        """Test unknown event types default to system_alerts."""
        result = notification_service._get_category_for_event("unknown.event.type")
        assert result == NotificationCategory.SYSTEM_ALERTS


class TestDefaultChannelMapping:
    """Tests for category to default channel mapping."""

    def test_all_categories_default_to_email(self, notification_service):
        """Test all categories default to email channel."""
        categories = [
            NotificationCategory.GALLERY_ACTIVITY,
            NotificationCategory.CLIENT_INTERACTIONS,
            NotificationCategory.SYSTEM_ALERTS,
            NotificationCategory.BILLING,
            NotificationCategory.MARKETING,
            NotificationCategory.INVITATION,
        ]

        for category in categories:
            result = notification_service._get_default_channel_for_category(category)
            assert result == NotificationChannel.EMAIL


# =============================================================================
# NOTIFICATION PROCESSING TESTS
# =============================================================================


class TestProcessNotification:
    """Tests for notification processing logic."""

    @pytest.mark.asyncio
    async def test_process_notification_renders_template(
        self, notification_service, sample_event_response
    ):
        """Test processing renders template before dispatch."""
        with patch("src.services.notification_service.template_service") as mock_template:
            with patch("src.services.notification_service.email_delivery_service") as mock_email:
                with patch("src.services.notification_service.notification_repository") as mock_repo:
                    mock_template.render_template = AsyncMock(
                        return_value=MagicMock(
                            email=MagicMock(
                                subject="Rendered Subject",
                                html="<h1>Content</h1>",
                                text="Content",
                            ),
                            sms=None,
                            push=None,
                            in_app=None,
                        )
                    )
                    mock_email.send_notification_task = AsyncMock(
                        return_value=NotificationResult(
                            event_id=sample_event_response.event_id,
                            success=True,
                            status=NotificationEventStatus.SENT,
                        )
                    )
                    mock_repo.update_event_status = AsyncMock()

                    result = await notification_service._process_notification(sample_event_response)

                    mock_template.render_template.assert_called_once()
                    assert result.success is True

    @pytest.mark.asyncio
    async def test_process_notification_handles_template_failure(
        self, notification_service, sample_event_response
    ):
        """Test processing handles template rendering failure."""
        with patch("src.services.notification_service.template_service") as mock_template:
            with patch("src.services.notification_service.notification_repository") as mock_repo:
                mock_template.render_template = AsyncMock(side_effect=Exception("Template error"))
                mock_repo.update_event_status = AsyncMock()

                result = await notification_service._process_notification(sample_event_response)

                assert result.success is False
                assert result.error_code == "TEMPLATE_RENDER_ERROR"

    @pytest.mark.asyncio
    async def test_process_notification_marks_failed_on_max_retries(
        self, notification_service, sample_event_response
    ):
        """Test processing marks as failed when max retries exceeded."""
        sample_event_response.retry_count = 3  # Max retries
        sample_event_response.max_retries = 3

        with patch("src.services.notification_service.template_service") as mock_template:
            with patch("src.services.notification_service.email_delivery_service") as mock_email:
                with patch("src.services.notification_service.notification_repository") as mock_repo:
                    mock_template.render_template = AsyncMock(
                        return_value=MagicMock(
                            email=MagicMock(
                                subject="Subject",
                                html="<p>HTML</p>",
                                text="Text",
                            ),
                            sms=None,
                            push=None,
                            in_app=None,
                        )
                    )
                    mock_email.send_notification_task = AsyncMock(
                        return_value=NotificationResult(
                            event_id=sample_event_response.event_id,
                            success=False,
                            status=NotificationEventStatus.FAILED,
                            error_message="Delivery failed",
                            should_retry=True,
                        )
                    )
                    mock_repo.update_event_status = AsyncMock()

                    result = await notification_service._process_notification(sample_event_response)

                    assert result.success is False
                    # Should have called update_event_status to mark as failed
                    mock_repo.update_event_status.assert_called()


# =============================================================================
# CHANNEL DISPATCH TESTS
# =============================================================================


class TestDispatchEmail:
    """Tests for email dispatch."""

    @pytest.mark.asyncio
    async def test_dispatch_email_requires_recipient_email(
        self, notification_service, sample_event_id, sample_workspace_id
    ):
        """Test email dispatch fails without recipient email."""
        task = NotificationTask(
            event_id=sample_event_id,
            workspace_id=sample_workspace_id,
            channel=NotificationChannel.EMAIL,
            priority=NotificationPriority.NORMAL,
            recipient_email=None,  # No email
            recipient_user_id=uuid4(),
        )

        result = await notification_service._dispatch_email(task)

        assert result.success is False
        assert result.error_code == "NO_EMAIL"
        assert result.should_retry is False


class TestDispatchSMS:
    """Tests for SMS dispatch."""

    @pytest.mark.asyncio
    async def test_dispatch_sms_requires_phone_number(
        self, notification_service, sample_event_id, sample_workspace_id
    ):
        """Test SMS dispatch fails without phone number."""
        task = NotificationTask(
            event_id=sample_event_id,
            workspace_id=sample_workspace_id,
            channel=NotificationChannel.SMS,
            priority=NotificationPriority.NORMAL,
            recipient_phone=None,  # No phone
        )

        result = await notification_service._dispatch_sms(task)

        assert result.success is False
        assert result.error_code == "NO_PHONE"


class TestDispatchPush:
    """Tests for push notification dispatch."""

    @pytest.mark.asyncio
    async def test_dispatch_push_returns_not_implemented(
        self, notification_service, sample_event_id, sample_workspace_id
    ):
        """Test push dispatch returns not implemented error."""
        task = NotificationTask(
            event_id=sample_event_id,
            workspace_id=sample_workspace_id,
            channel=NotificationChannel.PUSH,
            priority=NotificationPriority.NORMAL,
        )

        result = await notification_service._dispatch_push(task)

        assert result.success is False
        assert result.error_code == "PUSH_NOT_IMPLEMENTED"


class TestDispatchInApp:
    """Tests for in-app notification dispatch."""

    @pytest.mark.asyncio
    async def test_dispatch_in_app_requires_user_id(
        self, notification_service, sample_event_id, sample_workspace_id
    ):
        """Test in-app dispatch fails without user ID."""
        task = NotificationTask(
            event_id=sample_event_id,
            workspace_id=sample_workspace_id,
            channel=NotificationChannel.IN_APP,
            priority=NotificationPriority.NORMAL,
            recipient_user_id=None,  # No user ID
        )

        result = await notification_service._dispatch_in_app(task)

        assert result.success is False
        assert result.error_code == "NO_USER_ID"

    @pytest.mark.asyncio
    async def test_dispatch_in_app_stores_in_redis(
        self, notification_service, sample_event_id, sample_workspace_id, sample_user_id
    ):
        """Test in-app dispatch stores notification in Redis."""
        task = NotificationTask(
            event_id=sample_event_id,
            workspace_id=sample_workspace_id,
            channel=NotificationChannel.IN_APP,
            priority=NotificationPriority.NORMAL,
            recipient_user_id=sample_user_id,
            rendered_subject="Test Title",
            rendered_body_text="Test Body",
        )

        with patch("src.services.notification_service.redis_client") as mock_redis:
            with patch("src.services.notification_service.notification_repository") as mock_repo:
                mock_redis.lpush = AsyncMock()
                mock_redis.ltrim = AsyncMock()
                mock_redis.expire = AsyncMock()
                mock_repo.create_delivery_log = AsyncMock()

                result = await notification_service._dispatch_in_app(task)

                assert result.success is True
                assert result.status == NotificationEventStatus.DELIVERED
                assert result.provider == NotificationProvider.INTERNAL
                mock_redis.lpush.assert_called_once()
                mock_redis.ltrim.assert_called_once()


# =============================================================================
# NOTIFICATION MANAGEMENT TESTS
# =============================================================================


class TestCancelNotification:
    """Tests for notification cancellation."""

    @pytest.mark.asyncio
    async def test_cancel_notification_success(
        self, notification_service, sample_workspace_id, sample_event_id, sample_event_response
    ):
        """Test successful notification cancellation."""
        cancelled_event = sample_event_response.model_copy()
        cancelled_event.status = NotificationEventStatus.CANCELLED

        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.cancel_event = AsyncMock(return_value=cancelled_event)

            result = await notification_service.cancel_notification(
                workspace_id=sample_workspace_id,
                event_id=sample_event_id,
                reason="User requested cancellation",
            )

            assert result is not None
            assert result.status == NotificationEventStatus.CANCELLED
            mock_repo.cancel_event.assert_called_once_with(
                workspace_id=sample_workspace_id,
                event_id=sample_event_id,
                reason="User requested cancellation",
            )

    @pytest.mark.asyncio
    async def test_cancel_notification_not_found(
        self, notification_service, sample_workspace_id
    ):
        """Test cancellation returns None when event not found."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.cancel_event = AsyncMock(return_value=None)

            result = await notification_service.cancel_notification(
                workspace_id=sample_workspace_id,
                event_id=uuid4(),
            )

            assert result is None


class TestGetNotification:
    """Tests for notification retrieval."""

    @pytest.mark.asyncio
    async def test_get_notification_success(
        self, notification_service, sample_workspace_id, sample_event_id, sample_event_response
    ):
        """Test successful notification retrieval."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_notification_event = AsyncMock(return_value=sample_event_response)

            result = await notification_service.get_notification(
                workspace_id=sample_workspace_id,
                event_id=sample_event_id,
            )

            assert result is not None
            assert result.event_id == sample_event_id

    @pytest.mark.asyncio
    async def test_get_notification_not_found(
        self, notification_service, sample_workspace_id
    ):
        """Test retrieval returns None when not found."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_notification_event = AsyncMock(return_value=None)

            result = await notification_service.get_notification(
                workspace_id=sample_workspace_id,
                event_id=uuid4(),
            )

            assert result is None


class TestProcessSingleNotification:
    """Tests for single notification processing by ID."""

    @pytest.mark.asyncio
    async def test_process_single_notification_not_found(
        self, notification_service, sample_workspace_id
    ):
        """Test processing raises error when notification not found."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_notification_event = AsyncMock(return_value=None)

            with pytest.raises(NotificationNotFoundError):
                await notification_service.process_single_notification(
                    event_id=uuid4(),
                    workspace_id=sample_workspace_id,
                )


# =============================================================================
# PENDING NOTIFICATION PROCESSING TESTS
# =============================================================================


class TestProcessPendingNotifications:
    """Tests for batch processing of pending notifications."""

    @pytest.mark.asyncio
    async def test_process_pending_notifications_empty_queue(
        self, notification_service
    ):
        """Test processing returns 0 when queue is empty."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_pending_events = AsyncMock(return_value=[])

            result = await notification_service.process_pending_notifications(batch_size=100)

            assert result == 0

    @pytest.mark.asyncio
    async def test_process_pending_notifications_processes_batch(
        self, notification_service, sample_event_response
    ):
        """Test processing handles a batch of pending notifications."""
        events = [sample_event_response.model_copy() for _ in range(3)]
        for i, event in enumerate(events):
            event.event_id = uuid4()

        with patch("src.services.notification_service.notification_repository") as mock_repo:
            with patch.object(notification_service, "_process_notification") as mock_process:
                mock_repo.get_pending_events = AsyncMock(return_value=events)
                mock_repo.mark_as_processing = AsyncMock(return_value=True)
                mock_process.return_value = NotificationResult(
                    event_id=uuid4(),
                    success=True,
                    status=NotificationEventStatus.SENT,
                )

                result = await notification_service.process_pending_notifications(batch_size=100)

                assert result == 3
                assert mock_process.call_count == 3

    @pytest.mark.asyncio
    async def test_process_pending_skips_already_claimed(
        self, notification_service, sample_event_response
    ):
        """Test processing skips events already claimed by another worker."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_pending_events = AsyncMock(return_value=[sample_event_response])
            mock_repo.mark_as_processing = AsyncMock(return_value=False)  # Already claimed

            result = await notification_service.process_pending_notifications(batch_size=100)

            assert result == 0


# =============================================================================
# RETRY TESTS
# =============================================================================


class TestRetryFailedNotifications:
    """Tests for retrying failed notifications."""

    @pytest.mark.asyncio
    async def test_retry_failed_notifications_empty_queue(
        self, notification_service
    ):
        """Test retry returns 0 when no failed events."""
        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_events_for_retry = AsyncMock(return_value=[])

            result = await notification_service.retry_failed_notifications(max_items=50)

            assert result == 0

    @pytest.mark.asyncio
    async def test_retry_failed_notifications_increments_retry_count(
        self, notification_service, sample_event_response
    ):
        """Test retry increments retry count for failed events."""
        sample_event_response.status = NotificationEventStatus.FAILED
        sample_event_response.retry_count = 1

        retried_event = sample_event_response.model_copy()
        retried_event.retry_count = 2
        retried_event.status = NotificationEventStatus.PENDING

        with patch("src.services.notification_service.notification_repository") as mock_repo:
            mock_repo.get_events_for_retry = AsyncMock(return_value=[sample_event_response])
            mock_repo.increment_retry_count = AsyncMock(return_value=retried_event)

            result = await notification_service.retry_failed_notifications(max_items=50)

            assert result == 1
            mock_repo.increment_retry_count.assert_called_once_with(sample_event_response.event_id)


# =============================================================================
# HEALTH CHECK TESTS
# =============================================================================


class TestHealthCheck:
    """Tests for service health check."""

    @pytest.mark.asyncio
    async def test_health_check_returns_status(self, notification_service):
        """Test health check returns comprehensive status."""
        with patch("src.services.notification_service.email_delivery_service") as mock_email:
            with patch("src.services.notification_service.sms_delivery_service") as mock_sms:
                mock_email.health_check = AsyncMock(return_value={"status": "healthy"})
                mock_sms.health_check = AsyncMock(return_value={"status": "disabled"})

                result = await notification_service.health_check()

                assert result["status"] == "healthy"
                assert "email_service" in result
                assert "sms_service" in result
                assert "template_service" in result


# =============================================================================
# SINGLETON TESTS
# =============================================================================


class TestSingleton:
    """Tests for singleton pattern."""

    def test_get_notification_service_returns_same_instance(self):
        """Test get_notification_service returns the same instance."""
        service1 = get_notification_service()
        service2 = get_notification_service()

        assert service1 is service2


# =============================================================================
# SEND TO USERS TESTS
# =============================================================================


class TestSendToUsers:
    """Tests for send_to_users convenience method."""

    @pytest.mark.asyncio
    async def test_send_to_users_creates_batch_request(
        self, notification_service, sample_workspace_id
    ):
        """Test send_to_users creates notifications for all users."""
        user_ids = [uuid4() for _ in range(3)]

        with patch.object(notification_service, "send_batch_notifications") as mock_batch:
            mock_batch.return_value = MagicMock(
                created=3,
                failed=0,
                event_ids=[uuid4() for _ in range(3)],
                errors=[],
            )

            result = await notification_service.send_to_users(
                workspace_id=sample_workspace_id,
                user_ids=user_ids,
                event_type="gallery.published",
                category=NotificationCategory.GALLERY_ACTIVITY,
                channel=NotificationChannel.EMAIL,
                template_code="gallery_published",
                payload={"gallery_name": "Test"},
            )

            assert result.created == 3
            mock_batch.assert_called_once()

            # Verify the batch request contains notifications for all users
            batch_request = mock_batch.call_args[1]["request"]
            assert len(batch_request.notifications) == 3


# =============================================================================
# SEND EVENT NOTIFICATION TESTS
# =============================================================================


class TestSendEventNotification:
    """Tests for send_event_notification convenience method."""

    @pytest.mark.asyncio
    async def test_send_event_notification_maps_event_type(
        self, notification_service, sample_workspace_id, sample_event_response
    ):
        """Test send_event_notification auto-maps event type to category."""
        with patch.object(notification_service, "send_notification") as mock_send:
            mock_send.return_value = sample_event_response

            await notification_service.send_event_notification(
                workspace_id=sample_workspace_id,
                event_type="gallery.published",
                recipient_email="test@example.com",
                payload={"gallery_name": "Test"},
            )

            mock_send.assert_called_once()
            call_args = mock_send.call_args[1]
            request = call_args["request"]

            assert request.category == NotificationCategory.GALLERY_ACTIVITY
            assert request.channel == NotificationChannel.EMAIL
            assert request.template_code == "gallery_published"
