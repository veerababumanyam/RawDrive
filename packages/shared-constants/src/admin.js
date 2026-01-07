/**
 * Platform Admin Constants
 *
 * This module provides shared constants for platform administration:
 * - Re-exported enums from shared-types for convenience
 * - Role-to-permissions mapping
 * - Session and timing configuration
 * - Rate limits for admin operations
 * - API paths for admin endpoints
 * - Error messages
 *
 * @module admin
 */
import { API_BASE } from './api';
// ---------------------------------------------------------------------------
// Re-export enums from shared-types for convenience
// (These are defined in shared-types to colocate with their TypeScript types)
// ---------------------------------------------------------------------------
export { PlatformRoleType, AdminPermissionCategory, AdminPermission, PlatformRoleStatus, SupportAccessSessionStatus, SupportAccessReason, AdminAuditActionType, ModerationStatus, ViolationType, } from '@rawdrive/shared-types';
import { PlatformRoleType, AdminPermission, } from '@rawdrive/shared-types';
// ---------------------------------------------------------------------------
// Platform Role Definitions
// ---------------------------------------------------------------------------
/**
 * Human-readable names for platform roles
 */
export const PLATFORM_ROLE_NAMES = {
    [PlatformRoleType.SUPER_ADMIN]: 'Super Admin',
    [PlatformRoleType.SUPPORT_ADMIN]: 'Support Admin',
    [PlatformRoleType.BILLING_ADMIN]: 'Billing Admin',
    [PlatformRoleType.CONTENT_MODERATOR]: 'Content Moderator',
    [PlatformRoleType.TRUST_SAFETY_ADMIN]: 'Trust & Safety Admin',
    [PlatformRoleType.PLATFORM_ADMIN]: 'Platform Admin',
    [PlatformRoleType.ANALYTICS_VIEWER]: 'Analytics Viewer',
    [PlatformRoleType.DEV_OPS_ADMIN]: 'DevOps Admin',
    [PlatformRoleType.COMPLIANCE_ADMIN]: 'Compliance Admin',
};
/**
 * Descriptions for platform roles
 */
export const PLATFORM_ROLE_DESCRIPTIONS = {
    [PlatformRoleType.SUPER_ADMIN]: 'Full platform access with the ability to manage all aspects including other admins.',
    [PlatformRoleType.SUPPORT_ADMIN]: 'Customer support with workspace viewing and support session capabilities.',
    [PlatformRoleType.BILLING_ADMIN]: 'Billing management with access to subscriptions, payments, and refunds.',
    [PlatformRoleType.CONTENT_MODERATOR]: 'Content moderation with the ability to review and take action on flagged content.',
    [PlatformRoleType.TRUST_SAFETY_ADMIN]: 'Elevated moderation with user ban/suspend powers for trust & safety operations.',
    [PlatformRoleType.PLATFORM_ADMIN]: 'Platform configuration with feature flag and settings management.',
    [PlatformRoleType.ANALYTICS_VIEWER]: 'Read-only access to analytics, reports, and platform statistics.',
    [PlatformRoleType.DEV_OPS_ADMIN]: 'Developer operations with infrastructure and deployment management.',
    [PlatformRoleType.COMPLIANCE_ADMIN]: 'Legal and compliance access for data requests and regulatory compliance.',
};
/**
 * Permission sets for each platform role
 * Super Admin has wildcard (*) permission which grants all access
 */
export const PLATFORM_ROLE_PERMISSIONS = {
    [PlatformRoleType.SUPER_ADMIN]: [
        AdminPermission.ALL,
    ],
    [PlatformRoleType.SUPPORT_ADMIN]: [
        AdminPermission.USERS_VIEW,
        AdminPermission.WORKSPACES_VIEW,
        AdminPermission.WORKSPACES_SEARCH,
        AdminPermission.WORKSPACES_SUPPORT_ACCESS,
        AdminPermission.BILLING_VIEW,
        AdminPermission.SUBSCRIPTIONS_VIEW,
        AdminPermission.AUDIT_VIEW,
    ],
    [PlatformRoleType.BILLING_ADMIN]: [
        AdminPermission.USERS_VIEW,
        AdminPermission.WORKSPACES_VIEW,
        AdminPermission.WORKSPACES_SEARCH,
        AdminPermission.BILLING_VIEW,
        AdminPermission.BILLING_EDIT,
        AdminPermission.BILLING_REFUND,
        AdminPermission.SUBSCRIPTIONS_VIEW,
        AdminPermission.SUBSCRIPTIONS_EDIT,
        AdminPermission.AUDIT_VIEW,
    ],
    [PlatformRoleType.CONTENT_MODERATOR]: [
        AdminPermission.USERS_VIEW,
        AdminPermission.WORKSPACES_VIEW,
        AdminPermission.WORKSPACES_SEARCH,
        AdminPermission.CONTENT_VIEW,
        AdminPermission.CONTENT_FLAG,
        AdminPermission.CONTENT_REMOVE,
        AdminPermission.CONTENT_RESTORE,
        AdminPermission.USERS_WARN,
        AdminPermission.AUDIT_VIEW,
    ],
    [PlatformRoleType.TRUST_SAFETY_ADMIN]: [
        AdminPermission.USERS_VIEW,
        AdminPermission.USERS_EDIT,
        AdminPermission.USERS_SUSPEND,
        AdminPermission.USERS_BAN,
        AdminPermission.USERS_UNBAN,
        AdminPermission.USERS_WARN,
        AdminPermission.WORKSPACES_VIEW,
        AdminPermission.WORKSPACES_SEARCH,
        AdminPermission.WORKSPACES_EDIT,
        AdminPermission.CONTENT_VIEW,
        AdminPermission.CONTENT_FLAG,
        AdminPermission.CONTENT_REMOVE,
        AdminPermission.CONTENT_RESTORE,
        AdminPermission.AUDIT_VIEW,
        AdminPermission.AUDIT_EXPORT,
    ],
    [PlatformRoleType.PLATFORM_ADMIN]: [
        AdminPermission.FEATURE_FLAGS_VIEW,
        AdminPermission.FEATURE_FLAGS_EDIT,
        AdminPermission.SETTINGS_VIEW,
        AdminPermission.SETTINGS_EDIT,
        AdminPermission.ANALYTICS_VIEW,
        AdminPermission.REPORTS_VIEW,
        AdminPermission.AUDIT_VIEW,
    ],
    [PlatformRoleType.ANALYTICS_VIEWER]: [
        AdminPermission.ANALYTICS_VIEW,
        AdminPermission.REPORTS_VIEW,
        AdminPermission.REPORTS_EXPORT,
    ],
    [PlatformRoleType.DEV_OPS_ADMIN]: [
        AdminPermission.SYSTEM_STATUS_VIEW,
        AdminPermission.SYSTEM_MAINTENANCE,
        AdminPermission.SYSTEM_DEPLOY,
        AdminPermission.FEATURE_FLAGS_VIEW,
        AdminPermission.FEATURE_FLAGS_EDIT,
        AdminPermission.ANALYTICS_VIEW,
        AdminPermission.AUDIT_VIEW,
    ],
    [PlatformRoleType.COMPLIANCE_ADMIN]: [
        AdminPermission.USERS_VIEW,
        AdminPermission.USERS_DELETE,
        AdminPermission.WORKSPACES_VIEW,
        AdminPermission.WORKSPACES_SEARCH,
        AdminPermission.WORKSPACES_DELETE,
        AdminPermission.CONTENT_VIEW,
        AdminPermission.BILLING_VIEW,
        AdminPermission.SUBSCRIPTIONS_VIEW,
        AdminPermission.AUDIT_VIEW,
        AdminPermission.AUDIT_EXPORT,
        AdminPermission.REPORTS_VIEW,
        AdminPermission.REPORTS_EXPORT,
    ],
};
// ---------------------------------------------------------------------------
// Support Access Session Configuration
// ---------------------------------------------------------------------------
/**
 * Configuration for support access sessions (impersonation)
 */
export const SUPPORT_ACCESS_CONFIG = {
    /** Default session duration in minutes */
    DEFAULT_DURATION_MINUTES: 30,
    /** Maximum allowed session duration in minutes */
    MAX_DURATION_MINUTES: 60,
    /** Minimum session duration in minutes */
    MIN_DURATION_MINUTES: 5,
    /** Warning threshold before session expiry in minutes */
    EXPIRY_WARNING_MINUTES: 5,
    /** Grace period after session end for logging in seconds */
    END_GRACE_PERIOD_SECONDS: 60,
    /** Maximum active sessions per admin user */
    MAX_ACTIVE_SESSIONS_PER_ADMIN: 1,
    /** Maximum historical sessions to display in UI */
    HISTORY_DISPLAY_LIMIT: 50,
};
// ---------------------------------------------------------------------------
// Admin Session Timing
// ---------------------------------------------------------------------------
/**
 * Timing constants for admin operations (in milliseconds)
 */
export const ADMIN_TIMING = {
    /** Permission cache TTL in Redis (ms) */
    PERMISSION_CACHE_TTL_MS: 300000, // 5 minutes
    /** Role cache TTL in Redis (ms) */
    ROLE_CACHE_TTL_MS: 600000, // 10 minutes
    /** Admin session inactivity timeout (ms) */
    SESSION_INACTIVITY_TIMEOUT_MS: 1800000, // 30 minutes
    /** Audit log retention period (days) - logs older than this may be archived */
    AUDIT_LOG_RETENTION_DAYS: 365,
    /** Support access session check interval (ms) */
    SESSION_CHECK_INTERVAL_MS: 60000, // 1 minute
    /** Dashboard stats cache TTL (ms) */
    DASHBOARD_STATS_CACHE_TTL_MS: 60000, // 1 minute
};
// ---------------------------------------------------------------------------
// Admin Rate Limits
// ---------------------------------------------------------------------------
/**
 * Rate limits for admin operations
 */
export const ADMIN_RATE_LIMITS = {
    /** Admin login attempts per 15 minutes per IP */
    LOGIN_ATTEMPTS_PER_15_MIN: 5,
    /** Workspace searches per minute per admin */
    WORKSPACE_SEARCHES_PER_MINUTE: 30,
    /** Support access session starts per hour per admin */
    SUPPORT_SESSIONS_PER_HOUR: 10,
    /** Moderation actions per minute per admin */
    MODERATION_ACTIONS_PER_MINUTE: 20,
    /** Audit log queries per minute per admin */
    AUDIT_QUERIES_PER_MINUTE: 30,
    /** Admin API requests per minute per admin */
    API_REQUESTS_PER_MINUTE: 100,
    /** Bulk operations per hour per admin */
    BULK_OPERATIONS_PER_HOUR: 10,
};
// ---------------------------------------------------------------------------
// Admin API Paths
// ---------------------------------------------------------------------------
/**
 * API path constants for admin endpoints
 */
export const ADMIN_API_PATHS = {
    /** Base path for admin API */
    BASE: `${API_BASE}/admin`,
    /** Platform roles management */
    ROLES: `${API_BASE}/admin/roles`,
    /** Platform admins management */
    ADMINS: `${API_BASE}/admin/admins`,
    /** Admin audit logs */
    AUDIT_LOGS: `${API_BASE}/admin/audit-logs`,
    /** Support access sessions */
    SUPPORT_ACCESS: `${API_BASE}/admin/support-access`,
    /** Content moderation */
    MODERATION: `${API_BASE}/admin/moderation`,
    /** Workspace search and management */
    WORKSPACES: `${API_BASE}/admin/workspaces`,
    /** User management */
    USERS: `${API_BASE}/admin/users`,
    /** Billing management */
    BILLING: `${API_BASE}/admin/billing`,
    /** Platform settings */
    SETTINGS: `${API_BASE}/admin/settings`,
    /** Feature flags */
    FEATURE_FLAGS: `${API_BASE}/admin/feature-flags`,
    /** Dashboard and statistics */
    DASHBOARD: `${API_BASE}/admin/dashboard`,
    /** System status and operations */
    SYSTEM: `${API_BASE}/admin/system`,
};
// ---------------------------------------------------------------------------
// Admin Error Messages
// ---------------------------------------------------------------------------
/**
 * Human-readable error messages for admin operations
 */
export const ADMIN_ERROR_MESSAGES = {
    // Authentication/Authorization
    UNAUTHORIZED: 'You are not authorized to access admin features.',
    FORBIDDEN: 'You do not have permission to perform this action.',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions for this operation.',
    SESSION_EXPIRED: 'Your admin session has expired. Please log in again.',
    REQUIRES_2FA: 'This operation requires two-factor authentication.',
    // Role management
    ROLE_NOT_FOUND: 'The specified platform role does not exist.',
    ROLE_ALREADY_ASSIGNED: 'This role is already assigned to the user.',
    CANNOT_REMOVE_LAST_SUPER_ADMIN: 'Cannot remove the last Super Admin from the platform.',
    CANNOT_MODIFY_SYSTEM_ROLE: 'System-defined roles cannot be modified or deleted.',
    INVALID_ROLE_ASSIGNMENT: 'Invalid role assignment. Check user and role IDs.',
    // Support access
    SUPPORT_SESSION_NOT_FOUND: 'The specified support access session does not exist.',
    SUPPORT_SESSION_EXPIRED: 'This support access session has expired.',
    SUPPORT_SESSION_ALREADY_ENDED: 'This support access session has already ended.',
    SUPPORT_SESSION_LIMIT_REACHED: 'Maximum number of active support sessions reached.',
    INVALID_SUPPORT_REASON: 'Invalid support access reason code.',
    TICKET_ID_REQUIRED: 'A valid ticket ID is required for support access.',
    WORKSPACE_NOT_FOUND: 'The specified workspace does not exist.',
    // Moderation
    MODERATION_CASE_NOT_FOUND: 'The specified moderation case does not exist.',
    MODERATION_CASE_ALREADY_RESOLVED: 'This moderation case has already been resolved.',
    INVALID_MODERATION_ACTION: 'Invalid moderation action for the current case status.',
    CONTENT_NOT_FOUND: 'The flagged content could not be found.',
    // User management
    USER_NOT_FOUND: 'The specified user does not exist.',
    USER_ALREADY_SUSPENDED: 'This user is already suspended.',
    USER_ALREADY_BANNED: 'This user is already banned.',
    USER_NOT_SUSPENDED: 'This user is not currently suspended.',
    USER_NOT_BANNED: 'This user is not currently banned.',
    CANNOT_MODIFY_SELF: 'You cannot perform this action on your own account.',
    // Rate limiting
    RATE_LIMITED: 'Too many requests. Please wait before trying again.',
    BULK_OPERATION_LIMIT: 'Bulk operation limit exceeded. Please try again later.',
    // General
    INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
    INVALID_REQUEST: 'Invalid request. Please check the provided data.',
    AUDIT_LOG_WRITE_FAILED: 'Failed to write audit log entry.',
};
// ---------------------------------------------------------------------------
// Moderation Configuration
// ---------------------------------------------------------------------------
/**
 * Configuration for content moderation
 */
export const MODERATION_CONFIG = {
    /** Default priority for new moderation cases (1-5, 5 being highest) */
    DEFAULT_PRIORITY: 3,
    /** Priority for reported content (user reports) */
    REPORTED_CONTENT_PRIORITY: 3,
    /** Priority for system-detected violations */
    SYSTEM_DETECTED_PRIORITY: 4,
    /** Priority for legal/compliance issues */
    LEGAL_PRIORITY: 5,
    /** Maximum cases assignable to a single moderator */
    MAX_CASES_PER_MODERATOR: 50,
    /** Appeal window in days after content removal */
    APPEAL_WINDOW_DAYS: 30,
    /** Auto-escalation threshold - days before case escalates priority */
    AUTO_ESCALATION_DAYS: 3,
};
// ---------------------------------------------------------------------------
// Pagination Defaults for Admin
// ---------------------------------------------------------------------------
/**
 * Pagination defaults for admin lists
 */
export const ADMIN_PAGINATION = {
    /** Default page number */
    DEFAULT_PAGE: 1,
    /** Default items per page */
    DEFAULT_LIMIT: 25,
    /** Maximum items per page */
    MAX_LIMIT: 100,
    /** Default items per page for audit logs */
    AUDIT_LOG_DEFAULT_LIMIT: 50,
    /** Maximum items per page for audit logs */
    AUDIT_LOG_MAX_LIMIT: 500,
};
// ---------------------------------------------------------------------------
// Consolidated Admin Constants Export
// ---------------------------------------------------------------------------
/**
 * Consolidated admin constants export for convenience
 */
export const ADMIN = {
    ROLE_NAMES: PLATFORM_ROLE_NAMES,
    ROLE_DESCRIPTIONS: PLATFORM_ROLE_DESCRIPTIONS,
    ROLE_PERMISSIONS: PLATFORM_ROLE_PERMISSIONS,
    SUPPORT_ACCESS: SUPPORT_ACCESS_CONFIG,
    TIMING: ADMIN_TIMING,
    RATE_LIMITS: ADMIN_RATE_LIMITS,
    API_PATHS: ADMIN_API_PATHS,
    ERROR_MESSAGES: ADMIN_ERROR_MESSAGES,
    MODERATION: MODERATION_CONFIG,
    PAGINATION: ADMIN_PAGINATION,
};
