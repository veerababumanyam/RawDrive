/**
 * Platform Admin Types
 *
 * Provides type definitions for platform-level administration including:
 * - Platform roles and permissions
 * - Admin user management
 * - Support access sessions (impersonation)
 * - Admin audit logging
 * - Content moderation
 *
 * @module admin
 */

// ---------------------------------------------------------------------------
// Core Enums / Union Types
// ---------------------------------------------------------------------------

/**
 * Platform role identifiers
 * These are the 9 pre-defined platform roles with specific permission sets
 */
export const PlatformRoleType = {
  /** Full platform access - can manage all aspects including other admins */
  SUPER_ADMIN: 'super_admin',
  /** Customer support - can view workspaces and initiate support sessions */
  SUPPORT_ADMIN: 'support_admin',
  /** Billing management - can view/manage subscriptions and payments */
  BILLING_ADMIN: 'billing_admin',
  /** Content moderation - can review and take action on flagged content */
  CONTENT_MODERATOR: 'content_moderator',
  /** Trust & Safety - elevated moderation with ban/suspend powers */
  TRUST_SAFETY_ADMIN: 'trust_safety_admin',
  /** Platform configuration - can manage feature flags and settings */
  PLATFORM_ADMIN: 'platform_admin',
  /** Read-only access to analytics and reports */
  ANALYTICS_VIEWER: 'analytics_viewer',
  /** Developer operations - can manage infrastructure and deployments */
  DEV_OPS_ADMIN: 'dev_ops_admin',
  /** Legal/compliance - can access data for legal requests */
  COMPLIANCE_ADMIN: 'compliance_admin',
} as const;
export type PlatformRoleType = typeof PlatformRoleType[keyof typeof PlatformRoleType];

/**
 * Permission categories for platform administration
 */
export const AdminPermissionCategory = {
  /** User and workspace management */
  USER_MANAGEMENT: 'user_management',
  /** Workspace viewing and support access */
  WORKSPACE_ACCESS: 'workspace_access',
  /** Billing and subscription management */
  BILLING: 'billing',
  /** Content moderation actions */
  MODERATION: 'moderation',
  /** Platform configuration and feature flags */
  PLATFORM_CONFIG: 'platform_config',
  /** Analytics and reporting */
  ANALYTICS: 'analytics',
  /** Admin role management */
  ADMIN_MANAGEMENT: 'admin_management',
  /** Audit log access */
  AUDIT: 'audit',
  /** System operations */
  SYSTEM: 'system',
} as const;
export type AdminPermissionCategory = typeof AdminPermissionCategory[keyof typeof AdminPermissionCategory];

/**
 * Granular permissions for platform administration
 */
export const AdminPermission = {
  // User management permissions
  USERS_VIEW: 'users:view',
  USERS_EDIT: 'users:edit',
  USERS_SUSPEND: 'users:suspend',
  USERS_DELETE: 'users:delete',

  // Workspace access permissions
  WORKSPACES_VIEW: 'workspaces:view',
  WORKSPACES_SEARCH: 'workspaces:search',
  WORKSPACES_SUPPORT_ACCESS: 'workspaces:support_access',
  WORKSPACES_EDIT: 'workspaces:edit',
  WORKSPACES_DELETE: 'workspaces:delete',

  // Billing permissions
  BILLING_VIEW: 'billing:view',
  BILLING_EDIT: 'billing:edit',
  BILLING_REFUND: 'billing:refund',
  SUBSCRIPTIONS_VIEW: 'subscriptions:view',
  SUBSCRIPTIONS_EDIT: 'subscriptions:edit',

  // Moderation permissions
  CONTENT_VIEW: 'content:view',
  CONTENT_FLAG: 'content:flag',
  CONTENT_REMOVE: 'content:remove',
  CONTENT_RESTORE: 'content:restore',
  USERS_WARN: 'users:warn',
  USERS_BAN: 'users:ban',
  USERS_UNBAN: 'users:unban',

  // Platform configuration permissions
  FEATURE_FLAGS_VIEW: 'feature_flags:view',
  FEATURE_FLAGS_EDIT: 'feature_flags:edit',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_EDIT: 'settings:edit',

  // Analytics permissions
  ANALYTICS_VIEW: 'analytics:view',
  REPORTS_VIEW: 'reports:view',
  REPORTS_EXPORT: 'reports:export',

  // Admin management permissions
  ADMINS_VIEW: 'admins:view',
  ADMINS_CREATE: 'admins:create',
  ADMINS_EDIT: 'admins:edit',
  ADMINS_REMOVE: 'admins:remove',
  ROLES_VIEW: 'roles:view',
  ROLES_EDIT: 'roles:edit',

  // Audit permissions
  AUDIT_VIEW: 'audit:view',
  AUDIT_EXPORT: 'audit:export',

  // System permissions
  SYSTEM_STATUS_VIEW: 'system:status_view',
  SYSTEM_MAINTENANCE: 'system:maintenance',
  SYSTEM_DEPLOY: 'system:deploy',

  // Wildcard for super admin
  ALL: '*',
} as const;
export type AdminPermission = typeof AdminPermission[keyof typeof AdminPermission];

/**
 * Status of a platform role assignment
 */
export const PlatformRoleStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
} as const;
export type PlatformRoleStatus = typeof PlatformRoleStatus[keyof typeof PlatformRoleStatus];

/**
 * Status of a support access session
 */
export const SupportAccessSessionStatus = {
  /** Session is currently active */
  ACTIVE: 'active',
  /** Session ended normally */
  ENDED: 'ended',
  /** Session expired due to timeout */
  EXPIRED: 'expired',
  /** Session was revoked by admin */
  REVOKED: 'revoked',
} as const;
export type SupportAccessSessionStatus = typeof SupportAccessSessionStatus[keyof typeof SupportAccessSessionStatus];

/**
 * Reason codes for support access requests
 */
export const SupportAccessReason = {
  /** Customer requested support */
  CUSTOMER_REQUEST: 'customer_request',
  /** Investigating reported issue */
  ISSUE_INVESTIGATION: 'issue_investigation',
  /** Billing dispute resolution */
  BILLING_DISPUTE: 'billing_dispute',
  /** Account recovery assistance */
  ACCOUNT_RECOVERY: 'account_recovery',
  /** Data export request */
  DATA_EXPORT: 'data_export',
  /** Technical troubleshooting */
  TECHNICAL_SUPPORT: 'technical_support',
  /** Security investigation */
  SECURITY_INVESTIGATION: 'security_investigation',
  /** Legal/compliance request */
  LEGAL_REQUEST: 'legal_request',
} as const;
export type SupportAccessReason = typeof SupportAccessReason[keyof typeof SupportAccessReason];

/**
 * Admin audit action types
 */
export const AdminAuditActionType = {
  // Admin role actions
  ROLE_ASSIGNED: 'role_assigned',
  ROLE_REVOKED: 'role_revoked',
  ROLE_UPDATED: 'role_updated',

  // Support access actions
  SUPPORT_ACCESS_STARTED: 'support_access_started',
  SUPPORT_ACCESS_ENDED: 'support_access_ended',
  SUPPORT_ACCESS_REVOKED: 'support_access_revoked',
  SUPPORT_ACCESS_EXPIRED: 'support_access_expired',

  // User management actions
  USER_SUSPENDED: 'user_suspended',
  USER_UNSUSPENDED: 'user_unsuspended',
  USER_BANNED: 'user_banned',
  USER_UNBANNED: 'user_unbanned',
  USER_WARNED: 'user_warned',
  USER_DELETED: 'user_deleted',

  // Workspace actions
  WORKSPACE_VIEWED: 'workspace_viewed',
  WORKSPACE_EDITED: 'workspace_edited',
  WORKSPACE_DELETED: 'workspace_deleted',

  // Content moderation actions
  CONTENT_FLAGGED: 'content_flagged',
  CONTENT_REMOVED: 'content_removed',
  CONTENT_RESTORED: 'content_restored',

  // Billing actions
  BILLING_VIEWED: 'billing_viewed',
  BILLING_EDITED: 'billing_edited',
  REFUND_ISSUED: 'refund_issued',
  SUBSCRIPTION_MODIFIED: 'subscription_modified',

  // Platform config actions
  FEATURE_FLAG_CHANGED: 'feature_flag_changed',
  SETTINGS_CHANGED: 'settings_changed',

  // System actions
  SYSTEM_MAINTENANCE_STARTED: 'system_maintenance_started',
  SYSTEM_MAINTENANCE_ENDED: 'system_maintenance_ended',

  // Auth actions
  ADMIN_LOGIN: 'admin_login',
  ADMIN_LOGOUT: 'admin_logout',
  ADMIN_2FA_SETUP: 'admin_2fa_setup',
} as const;
export type AdminAuditActionType = typeof AdminAuditActionType[keyof typeof AdminAuditActionType];

/**
 * Content moderation status
 */
export const ModerationStatus = {
  /** Content is pending review */
  PENDING: 'pending',
  /** Content has been approved */
  APPROVED: 'approved',
  /** Content has been flagged for review */
  FLAGGED: 'flagged',
  /** Content has been removed */
  REMOVED: 'removed',
  /** Content removal was appealed */
  APPEALED: 'appealed',
  /** Appeal was rejected, content stays removed */
  APPEAL_REJECTED: 'appeal_rejected',
  /** Appeal was approved, content restored */
  APPEAL_APPROVED: 'appeal_approved',
} as const;
export type ModerationStatus = typeof ModerationStatus[keyof typeof ModerationStatus];

/**
 * Content violation types
 */
export const ViolationType = {
  SPAM: 'spam',
  HARASSMENT: 'harassment',
  HATE_SPEECH: 'hate_speech',
  VIOLENCE: 'violence',
  ADULT_CONTENT: 'adult_content',
  COPYRIGHT: 'copyright',
  ILLEGAL_CONTENT: 'illegal_content',
  IMPERSONATION: 'impersonation',
  MISINFORMATION: 'misinformation',
  PRIVACY_VIOLATION: 'privacy_violation',
  TERMS_OF_SERVICE: 'terms_of_service',
  OTHER: 'other',
} as const;
export type ViolationType = typeof ViolationType[keyof typeof ViolationType];

// ---------------------------------------------------------------------------
// Platform Role Interfaces
// ---------------------------------------------------------------------------

/**
 * Platform role definition
 */
export interface PlatformRole {
  /** Unique role identifier (UUID) */
  role_id: string;
  /** Role type identifier */
  role_type: PlatformRoleType;
  /** Human-readable role name */
  name: string;
  /** Role description */
  description: string;
  /** List of permissions granted by this role */
  permissions: AdminPermission[];
  /** Whether this is a system-defined role (cannot be deleted) */
  is_system_role: boolean;
  /** Role creation timestamp (ISO datetime) */
  created_at: string;
  /** Role last update timestamp (ISO datetime) */
  updated_at: string;
}

/**
 * User's platform role assignment
 */
export interface UserPlatformRole {
  /** Assignment ID (UUID) */
  id: string;
  /** User ID who has this role */
  user_id: string;
  /** Role ID assigned */
  role_id: string;
  /** Role details (denormalized) */
  role?: PlatformRole;
  /** Assignment status */
  status: PlatformRoleStatus;
  /** User who assigned this role */
  assigned_by_user_id: string;
  /** Optional note about the assignment */
  assignment_note?: string;
  /** When the assignment becomes active (ISO datetime) */
  effective_from: string;
  /** When the assignment expires (ISO datetime, null for permanent) */
  effective_until?: string;
  /** Assignment creation timestamp (ISO datetime) */
  created_at: string;
  /** Last update timestamp (ISO datetime) */
  updated_at: string;
}

/**
 * Admin user with their platform roles
 */
export interface PlatformAdmin {
  /** User ID */
  user_id: string;
  /** User email */
  email: string;
  /** Display name */
  display_name: string;
  /** Avatar URL */
  avatar_url?: string;
  /** Assigned platform roles */
  roles: UserPlatformRole[];
  /** Aggregated permissions from all roles */
  permissions: AdminPermission[];
  /** Whether user has 2FA enabled */
  has_2fa_enabled: boolean;
  /** Last admin activity timestamp (ISO datetime) */
  last_admin_activity_at?: string;
  /** Account creation timestamp (ISO datetime) */
  created_at: string;
}

// ---------------------------------------------------------------------------
// Support Access Session Interfaces
// ---------------------------------------------------------------------------

/**
 * Support access session for workspace impersonation
 */
export interface SupportAccessSession {
  /** Session ID (UUID) */
  session_id: string;
  /** Admin user who initiated the session */
  admin_user_id: string;
  /** Admin user details (denormalized) */
  admin_user?: {
    user_id: string;
    email: string;
    display_name: string;
  };
  /** Target workspace ID being accessed */
  workspace_id: string;
  /** Workspace details (denormalized) */
  workspace?: {
    workspace_id: string;
    name: string;
    owner_email: string;
  };
  /** Optional target user ID being impersonated */
  target_user_id?: string;
  /** Reason code for access */
  reason_code: SupportAccessReason;
  /** Detailed reason description */
  reason_description: string;
  /** Support ticket ID (required for audit trail) */
  ticket_id: string;
  /** Session status */
  status: SupportAccessSessionStatus;
  /** Session start timestamp (ISO datetime) */
  started_at: string;
  /** Session end timestamp (ISO datetime) */
  ended_at?: string;
  /** Session expiry timestamp (ISO datetime) */
  expires_at: string;
  /** IP address of the admin */
  ip_address: string;
  /** User agent of the admin */
  user_agent: string;
  /** Actions performed during the session */
  actions_count: number;
  /** Session creation timestamp (ISO datetime) */
  created_at: string;
}

/**
 * Request to start a support access session
 */
export interface StartSupportAccessRequest {
  /** Target workspace ID */
  workspace_id: string;
  /** Optional target user ID to impersonate */
  target_user_id?: string;
  /** Reason code for access */
  reason_code: SupportAccessReason;
  /** Detailed reason description */
  reason_description: string;
  /** Support ticket ID */
  ticket_id: string;
  /** Custom session duration in minutes (default: 30, max: 60) */
  duration_minutes?: number;
}

/**
 * Response after starting a support access session
 */
export interface StartSupportAccessResponse {
  /** The created session */
  session: SupportAccessSession;
  /** Access token for the session */
  access_token: string;
  /** Token expiry timestamp (ISO datetime) */
  token_expires_at: string;
  /** Confirmation message */
  message: string;
}

/**
 * Request to end a support access session
 */
export interface EndSupportAccessRequest {
  /** Session ID to end */
  session_id: string;
  /** Optional notes about the session */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Admin Audit Log Interfaces
// ---------------------------------------------------------------------------

/**
 * Admin audit log entry
 */
export interface AdminAuditLog {
  /** Audit log entry ID (UUID) */
  log_id: string;
  /** Admin user who performed the action */
  admin_user_id: string;
  /** Admin user details (denormalized) */
  admin_user?: {
    user_id: string;
    email: string;
    display_name: string;
  };
  /** Action type */
  action_type: AdminAuditActionType;
  /** Resource type affected */
  resource_type: string;
  /** Resource ID affected */
  resource_id?: string;
  /** Target user ID (if action affects a user) */
  target_user_id?: string;
  /** Target workspace ID (if action affects a workspace) */
  target_workspace_id?: string;
  /** Support access session ID (if action was during support access) */
  support_session_id?: string;
  /** Action description */
  description: string;
  /** Previous value (for change tracking) */
  previous_value?: Record<string, unknown>;
  /** New value (for change tracking) */
  new_value?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** IP address of the admin */
  ip_address: string;
  /** User agent of the admin */
  user_agent: string;
  /** Action timestamp (ISO datetime) */
  created_at: string;
}

/**
 * Query parameters for listing admin audit logs
 */
export interface ListAdminAuditLogsQuery {
  /** Filter by admin user ID */
  admin_user_id?: string;
  /** Filter by action type */
  action_type?: AdminAuditActionType;
  /** Filter by resource type */
  resource_type?: string;
  /** Filter by resource ID */
  resource_id?: string;
  /** Filter by target user ID */
  target_user_id?: string;
  /** Filter by target workspace ID */
  target_workspace_id?: string;
  /** Filter by support session ID */
  support_session_id?: string;
  /** Filter by start date (ISO datetime) */
  after?: string;
  /** Filter by end date (ISO datetime) */
  before?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sort_by?: 'created_at';
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Content Moderation Interfaces
// ---------------------------------------------------------------------------

/**
 * Moderation case for flagged content
 */
export interface ModerationCase {
  /** Case ID (UUID) */
  case_id: string;
  /** Content type being moderated */
  content_type: 'asset' | 'gallery' | 'user_profile' | 'comment' | 'workspace';
  /** Content ID */
  content_id: string;
  /** Workspace containing the content */
  workspace_id: string;
  /** User who owns the content */
  owner_user_id: string;
  /** Violation type */
  violation_type: ViolationType;
  /** Current moderation status */
  status: ModerationStatus;
  /** Who reported the content (null if system-detected) */
  reported_by_user_id?: string;
  /** Report reason */
  report_reason?: string;
  /** Admin who is assigned to review */
  assigned_moderator_id?: string;
  /** Admin who made the decision */
  decision_by_user_id?: string;
  /** Decision notes */
  decision_notes?: string;
  /** Decision timestamp (ISO datetime) */
  decision_at?: string;
  /** Appeal reason (if appealed) */
  appeal_reason?: string;
  /** Appeal timestamp (ISO datetime) */
  appealed_at?: string;
  /** Appeal decision notes */
  appeal_decision_notes?: string;
  /** Appeal decision by user ID */
  appeal_decision_by_user_id?: string;
  /** Appeal decision timestamp (ISO datetime) */
  appeal_decision_at?: string;
  /** Case priority (1-5, 5 being highest) */
  priority: number;
  /** Case creation timestamp (ISO datetime) */
  created_at: string;
  /** Last update timestamp (ISO datetime) */
  updated_at: string;
}

/**
 * Request to take moderation action
 */
export interface ModerationActionRequest {
  /** Case ID */
  case_id: string;
  /** Action to take */
  action: 'approve' | 'remove' | 'warn_user' | 'suspend_user' | 'ban_user';
  /** Notes about the decision */
  notes: string;
  /** Whether to notify the content owner */
  notify_owner?: boolean;
  /** Custom notification message */
  notification_message?: string;
}

/**
 * Query parameters for listing moderation cases
 */
export interface ListModerationCasesQuery {
  /** Filter by content type */
  content_type?: ModerationCase['content_type'];
  /** Filter by violation type */
  violation_type?: ViolationType;
  /** Filter by status */
  status?: ModerationStatus;
  /** Filter by assigned moderator */
  assigned_moderator_id?: string;
  /** Filter by owner user ID */
  owner_user_id?: string;
  /** Filter by workspace ID */
  workspace_id?: string;
  /** Filter by priority (minimum) */
  min_priority?: number;
  /** Filter by start date (ISO datetime) */
  after?: string;
  /** Filter by end date (ISO datetime) */
  before?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sort_by?: 'created_at' | 'priority' | 'updated_at';
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Admin Management Request/Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Request to assign a platform role to a user
 */
export interface AssignPlatformRoleRequest {
  /** User ID to assign role to */
  user_id: string;
  /** Role ID to assign */
  role_id: string;
  /** Optional assignment note */
  assignment_note?: string;
  /** When the assignment becomes active (ISO datetime, defaults to now) */
  effective_from?: string;
  /** When the assignment expires (ISO datetime, null for permanent) */
  effective_until?: string;
}

/**
 * Request to revoke a platform role from a user
 */
export interface RevokePlatformRoleRequest {
  /** User ID to revoke role from */
  user_id: string;
  /** Role ID to revoke */
  role_id: string;
  /** Reason for revocation */
  reason: string;
}

/**
 * Request to search for workspaces (admin search)
 */
export interface AdminWorkspaceSearchRequest {
  /** Search query (matches workspace name, ID, or owner email) */
  query: string;
  /** Filter by workspace status */
  status?: 'active' | 'suspended' | 'deleted';
  /** Filter by subscription tier */
  subscription_tier?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
}

/**
 * Workspace search result for admin view
 */
export interface AdminWorkspaceSearchResult {
  /** Workspace ID */
  workspace_id: string;
  /** Workspace name */
  name: string;
  /** Workspace status */
  status: string;
  /** Owner user ID */
  owner_user_id: string;
  /** Owner email */
  owner_email: string;
  /** Owner display name */
  owner_display_name: string;
  /** Member count */
  member_count: number;
  /** Storage used (bytes) */
  storage_used: number;
  /** Storage limit (bytes) */
  storage_limit: number;
  /** Subscription tier */
  subscription_tier: string;
  /** Subscription status */
  subscription_status: string;
  /** Creation timestamp (ISO datetime) */
  created_at: string;
  /** Last activity timestamp (ISO datetime) */
  last_activity_at?: string;
}

/**
 * Request to list platform admins
 */
export interface ListPlatformAdminsQuery {
  /** Filter by role type */
  role_type?: PlatformRoleType;
  /** Filter by role status */
  role_status?: PlatformRoleStatus;
  /** Search by email or name */
  search?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
}

/**
 * Request to list support access sessions
 */
export interface ListSupportAccessSessionsQuery {
  /** Filter by admin user ID */
  admin_user_id?: string;
  /** Filter by workspace ID */
  workspace_id?: string;
  /** Filter by status */
  status?: SupportAccessSessionStatus;
  /** Filter by reason code */
  reason_code?: SupportAccessReason;
  /** Filter by start date (ISO datetime) */
  after?: string;
  /** Filter by end date (ISO datetime) */
  before?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Permission Check Interfaces
// ---------------------------------------------------------------------------

/**
 * Permission check request
 */
export interface CheckPermissionRequest {
  /** User ID to check permissions for */
  user_id: string;
  /** Permission(s) to check */
  permissions: AdminPermission[];
  /** Resource type (optional, for resource-specific checks) */
  resource_type?: string;
  /** Resource ID (optional, for resource-specific checks) */
  resource_id?: string;
}

/**
 * Permission check response
 */
export interface CheckPermissionResponse {
  /** Whether the user has all requested permissions */
  has_permission: boolean;
  /** Breakdown of each permission check */
  permission_results: {
    permission: AdminPermission;
    granted: boolean;
    granted_by_role?: PlatformRoleType;
  }[];
}

// ---------------------------------------------------------------------------
// Admin Dashboard/Statistics Interfaces
// ---------------------------------------------------------------------------

/**
 * Admin dashboard statistics
 */
export interface AdminDashboardStats {
  /** Total platform users */
  total_users: number;
  /** Active users (last 30 days) */
  active_users_30d: number;
  /** Total workspaces */
  total_workspaces: number;
  /** Active workspaces (last 30 days) */
  active_workspaces_30d: number;
  /** Pending moderation cases */
  pending_moderation_cases: number;
  /** High priority moderation cases */
  high_priority_cases: number;
  /** Active support sessions */
  active_support_sessions: number;
  /** Total storage used (bytes) */
  total_storage_used: number;
  /** Monthly recurring revenue (cents) */
  mrr_cents: number;
  /** Stats timestamp (ISO datetime) */
  calculated_at: string;
}

/**
 * Platform role with assignment count
 */
export interface PlatformRoleWithStats extends PlatformRole {
  /** Number of users with this role */
  assigned_users_count: number;
  /** Number of active assignments */
  active_assignments_count: number;
}
