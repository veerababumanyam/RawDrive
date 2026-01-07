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
export { PlatformRoleType, AdminPermissionCategory, AdminPermission, PlatformRoleStatus, SupportAccessSessionStatus, SupportAccessReason, AdminAuditActionType, ModerationStatus, ViolationType, } from '@rawdrive/shared-types';
import { PlatformRoleType } from '@rawdrive/shared-types';
/**
 * Human-readable names for platform roles
 */
export declare const PLATFORM_ROLE_NAMES: {
    readonly [PlatformRoleType.SUPER_ADMIN]: "Super Admin";
    readonly [PlatformRoleType.SUPPORT_ADMIN]: "Support Admin";
    readonly [PlatformRoleType.BILLING_ADMIN]: "Billing Admin";
    readonly [PlatformRoleType.CONTENT_MODERATOR]: "Content Moderator";
    readonly [PlatformRoleType.TRUST_SAFETY_ADMIN]: "Trust & Safety Admin";
    readonly [PlatformRoleType.PLATFORM_ADMIN]: "Platform Admin";
    readonly [PlatformRoleType.ANALYTICS_VIEWER]: "Analytics Viewer";
    readonly [PlatformRoleType.DEV_OPS_ADMIN]: "DevOps Admin";
    readonly [PlatformRoleType.COMPLIANCE_ADMIN]: "Compliance Admin";
};
/**
 * Descriptions for platform roles
 */
export declare const PLATFORM_ROLE_DESCRIPTIONS: {
    readonly [PlatformRoleType.SUPER_ADMIN]: "Full platform access with the ability to manage all aspects including other admins.";
    readonly [PlatformRoleType.SUPPORT_ADMIN]: "Customer support with workspace viewing and support session capabilities.";
    readonly [PlatformRoleType.BILLING_ADMIN]: "Billing management with access to subscriptions, payments, and refunds.";
    readonly [PlatformRoleType.CONTENT_MODERATOR]: "Content moderation with the ability to review and take action on flagged content.";
    readonly [PlatformRoleType.TRUST_SAFETY_ADMIN]: "Elevated moderation with user ban/suspend powers for trust & safety operations.";
    readonly [PlatformRoleType.PLATFORM_ADMIN]: "Platform configuration with feature flag and settings management.";
    readonly [PlatformRoleType.ANALYTICS_VIEWER]: "Read-only access to analytics, reports, and platform statistics.";
    readonly [PlatformRoleType.DEV_OPS_ADMIN]: "Developer operations with infrastructure and deployment management.";
    readonly [PlatformRoleType.COMPLIANCE_ADMIN]: "Legal and compliance access for data requests and regulatory compliance.";
};
/**
 * Permission sets for each platform role
 * Super Admin has wildcard (*) permission which grants all access
 */
export declare const PLATFORM_ROLE_PERMISSIONS: Record<string, readonly string[]>;
/**
 * Configuration for support access sessions (impersonation)
 */
export declare const SUPPORT_ACCESS_CONFIG: {
    /** Default session duration in minutes */
    readonly DEFAULT_DURATION_MINUTES: 30;
    /** Maximum allowed session duration in minutes */
    readonly MAX_DURATION_MINUTES: 60;
    /** Minimum session duration in minutes */
    readonly MIN_DURATION_MINUTES: 5;
    /** Warning threshold before session expiry in minutes */
    readonly EXPIRY_WARNING_MINUTES: 5;
    /** Grace period after session end for logging in seconds */
    readonly END_GRACE_PERIOD_SECONDS: 60;
    /** Maximum active sessions per admin user */
    readonly MAX_ACTIVE_SESSIONS_PER_ADMIN: 1;
    /** Maximum historical sessions to display in UI */
    readonly HISTORY_DISPLAY_LIMIT: 50;
};
/**
 * Timing constants for admin operations (in milliseconds)
 */
export declare const ADMIN_TIMING: {
    /** Permission cache TTL in Redis (ms) */
    readonly PERMISSION_CACHE_TTL_MS: 300000;
    /** Role cache TTL in Redis (ms) */
    readonly ROLE_CACHE_TTL_MS: 600000;
    /** Admin session inactivity timeout (ms) */
    readonly SESSION_INACTIVITY_TIMEOUT_MS: 1800000;
    /** Audit log retention period (days) - logs older than this may be archived */
    readonly AUDIT_LOG_RETENTION_DAYS: 365;
    /** Support access session check interval (ms) */
    readonly SESSION_CHECK_INTERVAL_MS: 60000;
    /** Dashboard stats cache TTL (ms) */
    readonly DASHBOARD_STATS_CACHE_TTL_MS: 60000;
};
/**
 * Rate limits for admin operations
 */
export declare const ADMIN_RATE_LIMITS: {
    /** Admin login attempts per 15 minutes per IP */
    readonly LOGIN_ATTEMPTS_PER_15_MIN: 5;
    /** Workspace searches per minute per admin */
    readonly WORKSPACE_SEARCHES_PER_MINUTE: 30;
    /** Support access session starts per hour per admin */
    readonly SUPPORT_SESSIONS_PER_HOUR: 10;
    /** Moderation actions per minute per admin */
    readonly MODERATION_ACTIONS_PER_MINUTE: 20;
    /** Audit log queries per minute per admin */
    readonly AUDIT_QUERIES_PER_MINUTE: 30;
    /** Admin API requests per minute per admin */
    readonly API_REQUESTS_PER_MINUTE: 100;
    /** Bulk operations per hour per admin */
    readonly BULK_OPERATIONS_PER_HOUR: 10;
};
/**
 * API path constants for admin endpoints
 */
export declare const ADMIN_API_PATHS: {
    /** Base path for admin API */
    readonly BASE: "/api/v1/admin";
    /** Platform roles management */
    readonly ROLES: "/api/v1/admin/roles";
    /** Platform admins management */
    readonly ADMINS: "/api/v1/admin/admins";
    /** Admin audit logs */
    readonly AUDIT_LOGS: "/api/v1/admin/audit-logs";
    /** Support access sessions */
    readonly SUPPORT_ACCESS: "/api/v1/admin/support-access";
    /** Content moderation */
    readonly MODERATION: "/api/v1/admin/moderation";
    /** Workspace search and management */
    readonly WORKSPACES: "/api/v1/admin/workspaces";
    /** User management */
    readonly USERS: "/api/v1/admin/users";
    /** Billing management */
    readonly BILLING: "/api/v1/admin/billing";
    /** Platform settings */
    readonly SETTINGS: "/api/v1/admin/settings";
    /** Feature flags */
    readonly FEATURE_FLAGS: "/api/v1/admin/feature-flags";
    /** Dashboard and statistics */
    readonly DASHBOARD: "/api/v1/admin/dashboard";
    /** System status and operations */
    readonly SYSTEM: "/api/v1/admin/system";
};
/**
 * Human-readable error messages for admin operations
 */
export declare const ADMIN_ERROR_MESSAGES: {
    readonly UNAUTHORIZED: "You are not authorized to access admin features.";
    readonly FORBIDDEN: "You do not have permission to perform this action.";
    readonly INSUFFICIENT_PERMISSIONS: "Insufficient permissions for this operation.";
    readonly SESSION_EXPIRED: "Your admin session has expired. Please log in again.";
    readonly REQUIRES_2FA: "This operation requires two-factor authentication.";
    readonly ROLE_NOT_FOUND: "The specified platform role does not exist.";
    readonly ROLE_ALREADY_ASSIGNED: "This role is already assigned to the user.";
    readonly CANNOT_REMOVE_LAST_SUPER_ADMIN: "Cannot remove the last Super Admin from the platform.";
    readonly CANNOT_MODIFY_SYSTEM_ROLE: "System-defined roles cannot be modified or deleted.";
    readonly INVALID_ROLE_ASSIGNMENT: "Invalid role assignment. Check user and role IDs.";
    readonly SUPPORT_SESSION_NOT_FOUND: "The specified support access session does not exist.";
    readonly SUPPORT_SESSION_EXPIRED: "This support access session has expired.";
    readonly SUPPORT_SESSION_ALREADY_ENDED: "This support access session has already ended.";
    readonly SUPPORT_SESSION_LIMIT_REACHED: "Maximum number of active support sessions reached.";
    readonly INVALID_SUPPORT_REASON: "Invalid support access reason code.";
    readonly TICKET_ID_REQUIRED: "A valid ticket ID is required for support access.";
    readonly WORKSPACE_NOT_FOUND: "The specified workspace does not exist.";
    readonly MODERATION_CASE_NOT_FOUND: "The specified moderation case does not exist.";
    readonly MODERATION_CASE_ALREADY_RESOLVED: "This moderation case has already been resolved.";
    readonly INVALID_MODERATION_ACTION: "Invalid moderation action for the current case status.";
    readonly CONTENT_NOT_FOUND: "The flagged content could not be found.";
    readonly USER_NOT_FOUND: "The specified user does not exist.";
    readonly USER_ALREADY_SUSPENDED: "This user is already suspended.";
    readonly USER_ALREADY_BANNED: "This user is already banned.";
    readonly USER_NOT_SUSPENDED: "This user is not currently suspended.";
    readonly USER_NOT_BANNED: "This user is not currently banned.";
    readonly CANNOT_MODIFY_SELF: "You cannot perform this action on your own account.";
    readonly RATE_LIMITED: "Too many requests. Please wait before trying again.";
    readonly BULK_OPERATION_LIMIT: "Bulk operation limit exceeded. Please try again later.";
    readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
    readonly INVALID_REQUEST: "Invalid request. Please check the provided data.";
    readonly AUDIT_LOG_WRITE_FAILED: "Failed to write audit log entry.";
};
/**
 * Configuration for content moderation
 */
export declare const MODERATION_CONFIG: {
    /** Default priority for new moderation cases (1-5, 5 being highest) */
    readonly DEFAULT_PRIORITY: 3;
    /** Priority for reported content (user reports) */
    readonly REPORTED_CONTENT_PRIORITY: 3;
    /** Priority for system-detected violations */
    readonly SYSTEM_DETECTED_PRIORITY: 4;
    /** Priority for legal/compliance issues */
    readonly LEGAL_PRIORITY: 5;
    /** Maximum cases assignable to a single moderator */
    readonly MAX_CASES_PER_MODERATOR: 50;
    /** Appeal window in days after content removal */
    readonly APPEAL_WINDOW_DAYS: 30;
    /** Auto-escalation threshold - days before case escalates priority */
    readonly AUTO_ESCALATION_DAYS: 3;
};
/**
 * Pagination defaults for admin lists
 */
export declare const ADMIN_PAGINATION: {
    /** Default page number */
    readonly DEFAULT_PAGE: 1;
    /** Default items per page */
    readonly DEFAULT_LIMIT: 25;
    /** Maximum items per page */
    readonly MAX_LIMIT: 100;
    /** Default items per page for audit logs */
    readonly AUDIT_LOG_DEFAULT_LIMIT: 50;
    /** Maximum items per page for audit logs */
    readonly AUDIT_LOG_MAX_LIMIT: 500;
};
/**
 * Consolidated admin constants export for convenience
 */
export declare const ADMIN: {
    readonly ROLE_NAMES: {
        readonly [PlatformRoleType.SUPER_ADMIN]: "Super Admin";
        readonly [PlatformRoleType.SUPPORT_ADMIN]: "Support Admin";
        readonly [PlatformRoleType.BILLING_ADMIN]: "Billing Admin";
        readonly [PlatformRoleType.CONTENT_MODERATOR]: "Content Moderator";
        readonly [PlatformRoleType.TRUST_SAFETY_ADMIN]: "Trust & Safety Admin";
        readonly [PlatformRoleType.PLATFORM_ADMIN]: "Platform Admin";
        readonly [PlatformRoleType.ANALYTICS_VIEWER]: "Analytics Viewer";
        readonly [PlatformRoleType.DEV_OPS_ADMIN]: "DevOps Admin";
        readonly [PlatformRoleType.COMPLIANCE_ADMIN]: "Compliance Admin";
    };
    readonly ROLE_DESCRIPTIONS: {
        readonly [PlatformRoleType.SUPER_ADMIN]: "Full platform access with the ability to manage all aspects including other admins.";
        readonly [PlatformRoleType.SUPPORT_ADMIN]: "Customer support with workspace viewing and support session capabilities.";
        readonly [PlatformRoleType.BILLING_ADMIN]: "Billing management with access to subscriptions, payments, and refunds.";
        readonly [PlatformRoleType.CONTENT_MODERATOR]: "Content moderation with the ability to review and take action on flagged content.";
        readonly [PlatformRoleType.TRUST_SAFETY_ADMIN]: "Elevated moderation with user ban/suspend powers for trust & safety operations.";
        readonly [PlatformRoleType.PLATFORM_ADMIN]: "Platform configuration with feature flag and settings management.";
        readonly [PlatformRoleType.ANALYTICS_VIEWER]: "Read-only access to analytics, reports, and platform statistics.";
        readonly [PlatformRoleType.DEV_OPS_ADMIN]: "Developer operations with infrastructure and deployment management.";
        readonly [PlatformRoleType.COMPLIANCE_ADMIN]: "Legal and compliance access for data requests and regulatory compliance.";
    };
    readonly ROLE_PERMISSIONS: Record<string, readonly string[]>;
    readonly SUPPORT_ACCESS: {
        /** Default session duration in minutes */
        readonly DEFAULT_DURATION_MINUTES: 30;
        /** Maximum allowed session duration in minutes */
        readonly MAX_DURATION_MINUTES: 60;
        /** Minimum session duration in minutes */
        readonly MIN_DURATION_MINUTES: 5;
        /** Warning threshold before session expiry in minutes */
        readonly EXPIRY_WARNING_MINUTES: 5;
        /** Grace period after session end for logging in seconds */
        readonly END_GRACE_PERIOD_SECONDS: 60;
        /** Maximum active sessions per admin user */
        readonly MAX_ACTIVE_SESSIONS_PER_ADMIN: 1;
        /** Maximum historical sessions to display in UI */
        readonly HISTORY_DISPLAY_LIMIT: 50;
    };
    readonly TIMING: {
        /** Permission cache TTL in Redis (ms) */
        readonly PERMISSION_CACHE_TTL_MS: 300000;
        /** Role cache TTL in Redis (ms) */
        readonly ROLE_CACHE_TTL_MS: 600000;
        /** Admin session inactivity timeout (ms) */
        readonly SESSION_INACTIVITY_TIMEOUT_MS: 1800000;
        /** Audit log retention period (days) - logs older than this may be archived */
        readonly AUDIT_LOG_RETENTION_DAYS: 365;
        /** Support access session check interval (ms) */
        readonly SESSION_CHECK_INTERVAL_MS: 60000;
        /** Dashboard stats cache TTL (ms) */
        readonly DASHBOARD_STATS_CACHE_TTL_MS: 60000;
    };
    readonly RATE_LIMITS: {
        /** Admin login attempts per 15 minutes per IP */
        readonly LOGIN_ATTEMPTS_PER_15_MIN: 5;
        /** Workspace searches per minute per admin */
        readonly WORKSPACE_SEARCHES_PER_MINUTE: 30;
        /** Support access session starts per hour per admin */
        readonly SUPPORT_SESSIONS_PER_HOUR: 10;
        /** Moderation actions per minute per admin */
        readonly MODERATION_ACTIONS_PER_MINUTE: 20;
        /** Audit log queries per minute per admin */
        readonly AUDIT_QUERIES_PER_MINUTE: 30;
        /** Admin API requests per minute per admin */
        readonly API_REQUESTS_PER_MINUTE: 100;
        /** Bulk operations per hour per admin */
        readonly BULK_OPERATIONS_PER_HOUR: 10;
    };
    readonly API_PATHS: {
        /** Base path for admin API */
        readonly BASE: "/api/v1/admin";
        /** Platform roles management */
        readonly ROLES: "/api/v1/admin/roles";
        /** Platform admins management */
        readonly ADMINS: "/api/v1/admin/admins";
        /** Admin audit logs */
        readonly AUDIT_LOGS: "/api/v1/admin/audit-logs";
        /** Support access sessions */
        readonly SUPPORT_ACCESS: "/api/v1/admin/support-access";
        /** Content moderation */
        readonly MODERATION: "/api/v1/admin/moderation";
        /** Workspace search and management */
        readonly WORKSPACES: "/api/v1/admin/workspaces";
        /** User management */
        readonly USERS: "/api/v1/admin/users";
        /** Billing management */
        readonly BILLING: "/api/v1/admin/billing";
        /** Platform settings */
        readonly SETTINGS: "/api/v1/admin/settings";
        /** Feature flags */
        readonly FEATURE_FLAGS: "/api/v1/admin/feature-flags";
        /** Dashboard and statistics */
        readonly DASHBOARD: "/api/v1/admin/dashboard";
        /** System status and operations */
        readonly SYSTEM: "/api/v1/admin/system";
    };
    readonly ERROR_MESSAGES: {
        readonly UNAUTHORIZED: "You are not authorized to access admin features.";
        readonly FORBIDDEN: "You do not have permission to perform this action.";
        readonly INSUFFICIENT_PERMISSIONS: "Insufficient permissions for this operation.";
        readonly SESSION_EXPIRED: "Your admin session has expired. Please log in again.";
        readonly REQUIRES_2FA: "This operation requires two-factor authentication.";
        readonly ROLE_NOT_FOUND: "The specified platform role does not exist.";
        readonly ROLE_ALREADY_ASSIGNED: "This role is already assigned to the user.";
        readonly CANNOT_REMOVE_LAST_SUPER_ADMIN: "Cannot remove the last Super Admin from the platform.";
        readonly CANNOT_MODIFY_SYSTEM_ROLE: "System-defined roles cannot be modified or deleted.";
        readonly INVALID_ROLE_ASSIGNMENT: "Invalid role assignment. Check user and role IDs.";
        readonly SUPPORT_SESSION_NOT_FOUND: "The specified support access session does not exist.";
        readonly SUPPORT_SESSION_EXPIRED: "This support access session has expired.";
        readonly SUPPORT_SESSION_ALREADY_ENDED: "This support access session has already ended.";
        readonly SUPPORT_SESSION_LIMIT_REACHED: "Maximum number of active support sessions reached.";
        readonly INVALID_SUPPORT_REASON: "Invalid support access reason code.";
        readonly TICKET_ID_REQUIRED: "A valid ticket ID is required for support access.";
        readonly WORKSPACE_NOT_FOUND: "The specified workspace does not exist.";
        readonly MODERATION_CASE_NOT_FOUND: "The specified moderation case does not exist.";
        readonly MODERATION_CASE_ALREADY_RESOLVED: "This moderation case has already been resolved.";
        readonly INVALID_MODERATION_ACTION: "Invalid moderation action for the current case status.";
        readonly CONTENT_NOT_FOUND: "The flagged content could not be found.";
        readonly USER_NOT_FOUND: "The specified user does not exist.";
        readonly USER_ALREADY_SUSPENDED: "This user is already suspended.";
        readonly USER_ALREADY_BANNED: "This user is already banned.";
        readonly USER_NOT_SUSPENDED: "This user is not currently suspended.";
        readonly USER_NOT_BANNED: "This user is not currently banned.";
        readonly CANNOT_MODIFY_SELF: "You cannot perform this action on your own account.";
        readonly RATE_LIMITED: "Too many requests. Please wait before trying again.";
        readonly BULK_OPERATION_LIMIT: "Bulk operation limit exceeded. Please try again later.";
        readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
        readonly INVALID_REQUEST: "Invalid request. Please check the provided data.";
        readonly AUDIT_LOG_WRITE_FAILED: "Failed to write audit log entry.";
    };
    readonly MODERATION: {
        /** Default priority for new moderation cases (1-5, 5 being highest) */
        readonly DEFAULT_PRIORITY: 3;
        /** Priority for reported content (user reports) */
        readonly REPORTED_CONTENT_PRIORITY: 3;
        /** Priority for system-detected violations */
        readonly SYSTEM_DETECTED_PRIORITY: 4;
        /** Priority for legal/compliance issues */
        readonly LEGAL_PRIORITY: 5;
        /** Maximum cases assignable to a single moderator */
        readonly MAX_CASES_PER_MODERATOR: 50;
        /** Appeal window in days after content removal */
        readonly APPEAL_WINDOW_DAYS: 30;
        /** Auto-escalation threshold - days before case escalates priority */
        readonly AUTO_ESCALATION_DAYS: 3;
    };
    readonly PAGINATION: {
        /** Default page number */
        readonly DEFAULT_PAGE: 1;
        /** Default items per page */
        readonly DEFAULT_LIMIT: 25;
        /** Maximum items per page */
        readonly MAX_LIMIT: 100;
        /** Default items per page for audit logs */
        readonly AUDIT_LOG_DEFAULT_LIMIT: 50;
        /** Maximum items per page for audit logs */
        readonly AUDIT_LOG_MAX_LIMIT: 500;
    };
};
//# sourceMappingURL=admin.d.ts.map