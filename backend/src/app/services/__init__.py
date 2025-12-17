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
]