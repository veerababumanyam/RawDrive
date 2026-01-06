/**
 * Granular Permission System Types
 *
 * Defines types for conditional permissions, time-based access,
 * and role audit trails.
 */

// ---------------------------------------------------------------------------
// Permission Condition Enums
// ---------------------------------------------------------------------------

/**
 * Types of permission conditions that can be applied.
 */
export enum PermissionConditionType {
  /** Filter by gallery status (e.g., only approved galleries) */
  GALLERY_STATUS = 'gallery_status',
  /** Filter by specific gallery IDs */
  GALLERY_IDS = 'gallery_ids',
  /** Filter by client IDs */
  CLIENT_IDS = 'client_ids',
  /** Filter by date range (e.g., Q4 events only) */
  DATE_RANGE = 'date_range',
  /** Filter by asset type (photos, videos) */
  ASSET_TYPE = 'asset_type',
  /** Filter by tags */
  TAG_FILTER = 'tag_filter',
  /** Filter by sub-gallery IDs */
  SUB_GALLERY_IDS = 'sub_gallery_ids',
  /** Custom condition with arbitrary config */
  CUSTOM = 'custom',
}

/**
 * Types of actions tracked in role audit log.
 */
export enum RoleAuditActionType {
  ROLE_CREATED = 'role_created',
  ROLE_UPDATED = 'role_updated',
  ROLE_DELETED = 'role_deleted',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  PERMISSION_EXPIRED = 'permission_expired',
  MEMBER_ROLE_ASSIGNED = 'member_role_assigned',
  MEMBER_ROLE_REMOVED = 'member_role_removed',
  TIME_BASED_ACCESS_GRANTED = 'time_based_access_granted',
  TIME_BASED_ACCESS_REVOKED = 'time_based_access_revoked',
  TIME_BASED_ACCESS_EXPIRED = 'time_based_access_expired',
  DELEGATION_RULE_CREATED = 'delegation_rule_created',
  DELEGATION_RULE_UPDATED = 'delegation_rule_updated',
  DELEGATION_RULE_DELETED = 'delegation_rule_deleted',
  CONDITION_CREATED = 'condition_created',
  CONDITION_UPDATED = 'condition_updated',
  CONDITION_DELETED = 'condition_deleted',
}

/**
 * Types of targets for role audit log entries.
 */
export enum RoleAuditTargetType {
  ROLE = 'role',
  MEMBER_ROLE = 'member_role',
  GRANULAR_PERMISSION = 'granular_permission',
  PERMISSION_CONDITION = 'permission_condition',
  DELEGATION_RULE = 'delegation_rule',
  TIME_BASED_ASSIGNMENT = 'time_based_assignment',
}

// ---------------------------------------------------------------------------
// Permission Condition Configuration Types
// ---------------------------------------------------------------------------

/**
 * Configuration for gallery status condition.
 */
export interface GalleryStatusConditionConfig {
  /** Allowed gallery statuses (e.g., ['published', 'draft']) */
  allowed_statuses: string[];
}

/**
 * Configuration for gallery IDs condition.
 */
export interface GalleryIdsConditionConfig {
  /** List of allowed gallery IDs */
  gallery_ids: string[];
  /** Whether to include sub-galleries */
  include_sub_galleries?: boolean;
}

/**
 * Configuration for client IDs condition.
 */
export interface ClientIdsConditionConfig {
  /** List of allowed client IDs */
  client_ids: string[];
}

/**
 * Configuration for date range condition.
 */
export interface DateRangeConditionConfig {
  /** Start date (ISO string) */
  start_date?: string;
  /** End date (ISO string) */
  end_date?: string;
  /** Field to apply date filter on */
  date_field: 'created_at' | 'shoot_date' | 'published_at';
}

/**
 * Configuration for asset type condition.
 */
export interface AssetTypeConditionConfig {
  /** Allowed asset types */
  allowed_types: ('image' | 'video' | 'raw')[];
}

/**
 * Configuration for tag filter condition.
 */
export interface TagFilterConditionConfig {
  /** Required tags (AND logic) */
  required_tags?: string[];
  /** Any of these tags (OR logic) */
  any_tags?: string[];
  /** Excluded tags */
  excluded_tags?: string[];
}

/**
 * Configuration for sub-gallery IDs condition.
 */
export interface SubGalleryIdsConditionConfig {
  /** List of allowed sub-gallery IDs */
  sub_gallery_ids: string[];
}

/**
 * Configuration for custom condition.
 */
export interface CustomConditionConfig {
  /** Custom expression or rule */
  expression: string;
  /** Parameters for the expression */
  parameters?: Record<string, unknown>;
}

/**
 * Union type for all condition configurations.
 */
export type PermissionConditionConfig =
  | GalleryStatusConditionConfig
  | GalleryIdsConditionConfig
  | ClientIdsConditionConfig
  | DateRangeConditionConfig
  | AssetTypeConditionConfig
  | TagFilterConditionConfig
  | SubGalleryIdsConditionConfig
  | CustomConditionConfig;

// ---------------------------------------------------------------------------
// Permission Condition Interfaces
// ---------------------------------------------------------------------------

/**
 * A permission condition that restricts when a permission applies.
 */
export interface PermissionCondition {
  condition_id: string;
  workspace_id: string;
  name: string;
  description?: string;
  condition_type: PermissionConditionType;
  condition_config: PermissionConditionConfig;
  created_at: string;
  updated_at: string;
  created_by_user_id?: string;
}

/**
 * Request to create a permission condition.
 */
export interface CreatePermissionConditionRequest {
  name: string;
  description?: string;
  condition_type: PermissionConditionType;
  condition_config: PermissionConditionConfig;
}

/**
 * Request to update a permission condition.
 */
export interface UpdatePermissionConditionRequest {
  name?: string;
  description?: string;
  condition_config?: PermissionConditionConfig;
}

// ---------------------------------------------------------------------------
// Granular Permission Interfaces
// ---------------------------------------------------------------------------

/**
 * A granular permission with optional conditions.
 */
export interface GranularPermission {
  granular_permission_id: string;
  workspace_id: string;
  member_role_id: string;
  permission: string;
  condition_id?: string;
  condition?: PermissionCondition;
  granted_at: string;
  granted_by_user_id?: string;
  expires_at?: string;
  is_active: boolean;
  notes?: string;
}

/**
 * Request to grant a granular permission.
 */
export interface GrantGranularPermissionRequest {
  member_role_id: string;
  permission: string;
  condition_id?: string;
  expires_at?: string;
  notes?: string;
}

/**
 * Request to update a granular permission.
 */
export interface UpdateGranularPermissionRequest {
  expires_at?: string;
  is_active?: boolean;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Time-Based Role Assignment Interfaces
// ---------------------------------------------------------------------------

/**
 * A time-based role assignment for temporary access.
 */
export interface TimeBasedRoleAssignment {
  assignment_id: string;
  workspace_id: string;
  membership_id: string;
  role_id: string;
  starts_at: string;
  expires_at: string;
  reason?: string;
  granted_by_user_id?: string;
  granted_by_display_name?: string;
  created_at: string;
  revoked_at?: string;
  revoked_by_user_id?: string;
  revocation_reason?: string;
  /** Computed fields for convenience */
  is_active?: boolean;
  days_remaining?: number;
  /** Related role info */
  role_name?: string;
  role_permissions?: string[];
  /** Related user info */
  user_display_name?: string;
  user_email?: string;
}

/**
 * Request to grant time-based access.
 */
export interface GrantTimeBasedAccessRequest {
  membership_id: string;
  role_id: string;
  starts_at?: string;
  expires_at: string;
  reason?: string;
}

/**
 * Request to revoke time-based access.
 */
export interface RevokeTimeBasedAccessRequest {
  reason?: string;
}

// ---------------------------------------------------------------------------
// Role Audit Log Interfaces
// ---------------------------------------------------------------------------

/**
 * An entry in the role audit log.
 */
export interface RoleAuditLogEntry {
  audit_id: string;
  workspace_id: string;
  actor_user_id?: string;
  actor_display_name?: string;
  actor_email?: string;
  action_type: RoleAuditActionType;
  target_type: RoleAuditTargetType;
  target_id: string;
  target_user_id?: string;
  target_user_display_name?: string;
  target_user_email?: string;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  change_summary?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

/**
 * Query parameters for listing role audit logs.
 */
export interface ListRoleAuditLogsQuery {
  action_type?: RoleAuditActionType;
  target_type?: RoleAuditTargetType;
  target_id?: string;
  actor_user_id?: string;
  target_user_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Permission Delegation Interfaces
// ---------------------------------------------------------------------------

/**
 * A rule defining what permissions a role can delegate.
 */
export interface PermissionDelegationRule {
  rule_id: string;
  workspace_id: string;
  delegator_role_id: string;
  delegator_role_name?: string;
  delegatable_permissions: string[];
  max_delegation_depth: number;
  can_set_expiration: boolean;
  max_expiration_days?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a delegation rule.
 */
export interface CreateDelegationRuleRequest {
  delegator_role_id: string;
  delegatable_permissions: string[];
  max_delegation_depth?: number;
  can_set_expiration?: boolean;
  max_expiration_days?: number;
}

/**
 * Request to update a delegation rule.
 */
export interface UpdateDelegationRuleRequest {
  delegatable_permissions?: string[];
  max_delegation_depth?: number;
  can_set_expiration?: boolean;
  max_expiration_days?: number;
}

// ---------------------------------------------------------------------------
// Permission Check Interfaces
// ---------------------------------------------------------------------------

/**
 * Result of a granular permission check.
 */
export interface GranularPermissionCheckResult {
  allowed: boolean;
  permission: string;
  /** The condition that matched, if any */
  matching_condition?: PermissionCondition;
  /** Resources that are allowed by the condition */
  allowed_resources?: string[];
  /** Reason for denial if not allowed */
  denial_reason?: string;
}

/**
 * Request to check granular permissions.
 */
export interface CheckGranularPermissionRequest {
  permission: string;
  /** Resource ID to check (gallery_id, client_id, etc.) */
  resource_id?: string;
  /** Resource type */
  resource_type?: 'gallery' | 'client' | 'asset' | 'sub_gallery';
  /** Additional context for the check */
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Effective Permissions Interface
// ---------------------------------------------------------------------------

/**
 * User's effective permissions with conditions.
 */
export interface EffectivePermissions {
  /** Simple permissions without conditions */
  base_permissions: string[];
  /** Granular permissions with conditions */
  conditional_permissions: Array<{
    permission: string;
    condition: PermissionCondition;
    expires_at?: string;
  }>;
  /** Time-based role assignments */
  time_based_roles: Array<{
    role_name: string;
    permissions: string[];
    expires_at: string;
    days_remaining: number;
  }>;
}

// ---------------------------------------------------------------------------
// Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Response for listing permission conditions.
 */
export interface PermissionConditionListResponse {
  items: PermissionCondition[];
  total: number;
}

/**
 * Response for listing granular permissions.
 */
export interface GranularPermissionListResponse {
  items: GranularPermission[];
  total: number;
}

/**
 * Response for listing time-based assignments.
 */
export interface TimeBasedAssignmentListResponse {
  items: TimeBasedRoleAssignment[];
  total: number;
  active_count: number;
  expired_count: number;
}

/**
 * Response for listing role audit logs.
 */
export interface RoleAuditLogListResponse {
  items: RoleAuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Response for listing delegation rules.
 */
export interface DelegationRuleListResponse {
  items: PermissionDelegationRule[];
  total: number;
}
