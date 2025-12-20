"""Domain services for RawDrive backend."""
from app.services.auth_service import AuthService, TokenPair, AuthUser
from app.services.oauth_service import GoogleOAuthService
from app.services.session_service import SessionService
from app.services.rate_limit_service import RateLimitService, RateLimitType
from app.services.permission_cache import PermissionCacheService, get_permission_cache
from app.services.rbac_service import (
    RBACService,
    Role,
    PermissionCheckResult,
    RBACError,
    RoleNotFoundError,
    RoleExistsError,
    SystemRoleError,
    InvalidPermissionError,
    WORKSPACE_PERMISSIONS,
    PLATFORM_PERMISSIONS,
    create_default_workspace_roles,
)
from app.services.workspace_service import (
    WorkspaceService,
    Workspace,
    WorkspaceMember,
    WorkspaceWithSubscription,
    WorkspaceError,
    WorkspaceNotFoundError,
    WorkspaceAccessDeniedError,
    WorkspaceDisabledError,
    WorkspaceSlugTakenError,
)
from app.services.subscription_service import (
    SubscriptionService,
    Plan,
    SubscriptionStatus,
    LimitType,
    SubscriptionError,
    SubscriptionNotFoundError,
    TierLimitExceededError,
    TrialExpiredError,
    expire_trials_job,
)
from app.services.invitation_service import (
    InvitationService,
    Invitation,
    InvitationError,
    InvitationNotFoundError,
    InvitationExpiredError,
    InvitationAlreadyAcceptedError,
    InvitationRevokedError,
    MemberAlreadyExistsError,
    expire_invitations_job,
)
from app.services.email_verification_service import (
    EmailVerificationService,
    EmailVerificationError,
    TokenExpiredError,
    TokenInvalidError,
    TokenAlreadyUsedError,
    EmailAlreadyVerifiedError,
    ResendCooldownError,
    cleanup_verification_tokens_job,
)
from app.services.task_queue import (
    TaskQueueService,
    Task,
    TaskStatus,
    TaskPriority,
    get_task_queue,
    enqueue_task,
    register_task_handler,
)
from app.services.tag_service import TagService, get_tag_service, TagError, TagNotFoundError, DuplicateTagError
from app.services.comment_service import CommentService, get_comment_service, CommentError, CommentNotFoundError, CommentForbiddenError
from app.services.people_service import PeopleService, get_people_service, PeopleError, PersonNotFoundError, FaceNotFoundError
from app.services.search_service import SearchService, get_search_service
from app.services.communication_service import CommunicationService, get_communication_service
from app.services.client_tag_service import ClientTagService, get_client_tag_service
from app.services.duplicate_detection_service import DuplicateDetectionService, get_duplicate_detection_service
from app.services.smart_list_service import (
    SmartListService,
    get_smart_list_service,
    SmartListError,
    SmartListNotFoundError,
    SmartListValidationError,
    SmartListDuplicateError,
    SystemSmartListError,
)
from app.services.import_export_service import (
    ImportExportService,
    get_import_export_service,
    ImportExportError,
    ImportValidationError,
    ExportError,
    InvalidFileFormatError,
    EmptyFileError,
    MissingRequiredFieldsError,
)
from app.services.analytics_service import (
    AnalyticsService,
    get_analytics_service,
    AnalyticsError,
    InvalidDateRangeError,
)


__all__ = [
    # Auth
    "AuthService",
    "TokenPair",
    "AuthUser",
    "GoogleOAuthService",
    # Session
    "SessionService",
    # Rate limiting
    "RateLimitService",
    "RateLimitType",
    # Permission cache
    "PermissionCacheService",
    "get_permission_cache",
    # RBAC
    "RBACService",
    "Role",
    "PermissionCheckResult",
    "RBACError",
    "RoleNotFoundError",
    "RoleExistsError",
    "SystemRoleError",
    "InvalidPermissionError",
    "WORKSPACE_PERMISSIONS",
    "PLATFORM_PERMISSIONS",
    "create_default_workspace_roles",
    # Workspace
    "WorkspaceService",
    "Workspace",
    "WorkspaceMember",
    "WorkspaceWithSubscription",
    "WorkspaceError",
    "WorkspaceNotFoundError",
    "WorkspaceAccessDeniedError",
    "WorkspaceDisabledError",
    "WorkspaceSlugTakenError",
    # Subscription
    "SubscriptionService",
    "Plan",
    "SubscriptionStatus",
    "LimitType",
    "SubscriptionError",
    "SubscriptionNotFoundError",
    "TierLimitExceededError",
    "TrialExpiredError",
    "expire_trials_job",
    # Invitation
    "InvitationService",
    "Invitation",
    "InvitationError",
    "InvitationNotFoundError",
    "InvitationExpiredError",
    "InvitationAlreadyAcceptedError",
    "InvitationRevokedError",
    "MemberAlreadyExistsError",
    "expire_invitations_job",
    # Email Verification
    "EmailVerificationService",
    "EmailVerificationError",
    "TokenExpiredError",
    "TokenInvalidError",
    "TokenAlreadyUsedError",
    "EmailAlreadyVerifiedError",
    "ResendCooldownError",
    "cleanup_verification_tokens_job",
    # Task Queue
    "TaskQueueService",
    "Task",
    "TaskStatus",
    "TaskPriority",
    "get_task_queue",
    "enqueue_task",
    "register_task_handler",
    # Tags
    "TagService",
    "get_tag_service",
    "TagError",
    "TagNotFoundError",
    "DuplicateTagError",
    # Comments
    "CommentService",
    "get_comment_service",
    "CommentError",
    "CommentNotFoundError",
    "CommentForbiddenError",
    # People
    "PeopleService",
    "get_people_service",
    "PeopleError",
    "PersonNotFoundError",
    "FaceNotFoundError",
    # Search
    "SearchService",
    "get_search_service",
    # Communication (Client CRM)
    "CommunicationService",
    "get_communication_service",
    # Client Tags (Client CRM)
    "ClientTagService",
    "get_client_tag_service",
    # Duplicate Detection (Client CRM)
    "DuplicateDetectionService",
    "get_duplicate_detection_service",
    # Smart Lists (Client CRM)
    "SmartListService",
    "get_smart_list_service",
    "SmartListError",
    "SmartListNotFoundError",
    "SmartListValidationError",
    "SmartListDuplicateError",
    "SystemSmartListError",
    # Import/Export (Client CRM)
    "ImportExportService",
    "get_import_export_service",
    "ImportExportError",
    "ImportValidationError",
    "ExportError",
    "InvalidFileFormatError",
    "EmptyFileError",
    "MissingRequiredFieldsError",
    # Analytics (Client CRM)
    "AnalyticsService",
    "get_analytics_service",
    "AnalyticsError",
    "InvalidDateRangeError",
]