/**
 * Compliance Types
 *
 * Types for the Audit & Compliance system:
 * - Data Subject Requests (GDPR/CCPA/DPDP)
 * - Legal Holds (litigation, regulatory, preservation)
 * - Retention Policies (data lifecycle management)
 * - Incidents (security and compliance incidents)
 * - Audit Log queries and exports
 *
 * @module compliance
 */

// ---------------------------------------------------------------------------
// Data Subject Request Enums
// ---------------------------------------------------------------------------

/**
 * Types of data subject requests per GDPR/CCPA
 */
export const DSRRequestType = {
  /** Right to access personal data (GDPR Art. 15) */
  ACCESS: 'access',
  /** Right to rectification (GDPR Art. 16) */
  RECTIFICATION: 'rectification',
  /** Right to erasure/be forgotten (GDPR Art. 17) */
  ERASURE: 'erasure',
  /** Right to data portability (GDPR Art. 20) */
  PORTABILITY: 'portability',
  /** Right to restrict processing (GDPR Art. 18) */
  RESTRICTION: 'restriction',
  /** Right to object (GDPR Art. 21) */
  OBJECTION: 'objection',
  /** CCPA opt-out of sale */
  OPT_OUT_SALE: 'opt_out_sale',
  /** CCPA right to know */
  DISCLOSURE: 'disclosure',
} as const;
export type DSRRequestType = typeof DSRRequestType[keyof typeof DSRRequestType];

/**
 * Status of a data subject request
 */
export const DSRStatus = {
  /** Initial state, awaiting review */
  PENDING: 'pending',
  /** Verifying requester identity */
  IDENTITY_VERIFICATION: 'identity_verification',
  /** Request acknowledged, in queue */
  ACKNOWLEDGED: 'acknowledged',
  /** Actively being processed */
  IN_PROGRESS: 'in_progress',
  /** Needs manager/legal approval */
  AWAITING_APPROVAL: 'awaiting_approval',
  /** Blocked by legal hold */
  BLOCKED: 'blocked',
  /** Successfully completed */
  COMPLETED: 'completed',
  /** Partially fulfilled */
  PARTIALLY_COMPLETED: 'partially_completed',
  /** Rejected (invalid request, identity not verified) */
  REJECTED: 'rejected',
  /** Cancelled by requester */
  CANCELLED: 'cancelled',
  /** Deadline passed without completion */
  EXPIRED: 'expired',
} as const;
export type DSRStatus = typeof DSRStatus[keyof typeof DSRStatus];

/**
 * Source of a data subject request
 */
export const DSRSource = {
  /** Self-service user request */
  USER_PORTAL: 'user_portal',
  /** Email request */
  EMAIL: 'email',
  /** API-initiated request */
  API: 'api',
  /** Admin-initiated on behalf of user */
  ADMIN: 'admin',
  /** Legal/regulatory initiated */
  LEGAL: 'legal',
  /** System automated (e.g., account deletion) */
  AUTOMATED: 'automated',
} as const;
export type DSRSource = typeof DSRSource[keyof typeof DSRSource];

/**
 * Type of data subject
 */
export const DSRSubjectType = {
  /** Platform user */
  USER: 'user',
  /** Client/customer */
  CLIENT: 'client',
  /** Anonymous visitor */
  VISITOR: 'visitor',
  /** Event guest */
  GUEST: 'guest',
  /** Internal employee */
  EMPLOYEE: 'employee',
  /** Other data subject */
  OTHER: 'other',
} as const;
export type DSRSubjectType = typeof DSRSubjectType[keyof typeof DSRSubjectType];

/**
 * Priority of a data subject request
 */
export const DSRPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;
export type DSRPriority = typeof DSRPriority[keyof typeof DSRPriority];

/**
 * Status of identity verification for data subject request
 */
export const DSRVerificationStatus = {
  /** Not yet verified */
  PENDING: 'pending',
  /** Verification in progress */
  IN_PROGRESS: 'in_progress',
  /** Identity confirmed */
  VERIFIED: 'verified',
  /** Verification failed */
  FAILED: 'failed',
  /** Verification waived (e.g., logged-in user) */
  WAIVED: 'waived',
} as const;
export type DSRVerificationStatus = typeof DSRVerificationStatus[keyof typeof DSRVerificationStatus];

// ---------------------------------------------------------------------------
// Legal Hold Enums
// ---------------------------------------------------------------------------

/**
 * Types of legal holds
 */
export const LegalHoldType = {
  /** Legal litigation/lawsuit */
  LITIGATION: 'litigation',
  /** Regulatory investigation */
  REGULATORY: 'regulatory',
  /** Internal audit/investigation */
  INTERNAL_AUDIT: 'internal_audit',
  /** Compliance requirement */
  COMPLIANCE: 'compliance',
  /** General preservation request */
  PRESERVATION: 'preservation',
  /** Subpoena/court order */
  SUBPOENA: 'subpoena',
  /** Government inquiry */
  GOVERNMENT: 'government',
  /** Other hold type */
  OTHER: 'other',
} as const;
export type LegalHoldType = typeof LegalHoldType[keyof typeof LegalHoldType];

/**
 * Status of a legal hold
 */
export const LegalHoldStatus = {
  /** Hold being prepared, not yet active */
  DRAFT: 'draft',
  /** Awaiting legal/management approval */
  PENDING_APPROVAL: 'pending_approval',
  /** Currently enforced */
  ACTIVE: 'active',
  /** Temporarily suspended */
  SUSPENDED: 'suspended',
  /** Hold has been released */
  RELEASED: 'released',
  /** Hold expired (effective_until passed) */
  EXPIRED: 'expired',
  /** Hold cancelled before activation */
  CANCELLED: 'cancelled',
} as const;
export type LegalHoldStatus = typeof LegalHoldStatus[keyof typeof LegalHoldStatus];

/**
 * Priority of a legal hold
 */
export const LegalHoldPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
export type LegalHoldPriority = typeof LegalHoldPriority[keyof typeof LegalHoldPriority];

/**
 * Type of legal hold scope
 */
export const LegalHoldScopeType = {
  /** All resources in workspace */
  WORKSPACE_WIDE: 'workspace_wide',
  /** All resources for specific users */
  USER_BASED: 'user_based',
  /** Specific resources/types only */
  SELECTIVE: 'selective',
  /** Resources matching keywords */
  KEYWORD_BASED: 'keyword_based',
  /** Resources within date range */
  DATE_RANGE: 'date_range',
  /** Multiple criteria combined */
  COMBINED: 'combined',
} as const;
export type LegalHoldScopeType = typeof LegalHoldScopeType[keyof typeof LegalHoldScopeType];

// ---------------------------------------------------------------------------
// Retention Policy Enums
// ---------------------------------------------------------------------------

/**
 * Types of retention policies
 */
export const RetentionPolicyType = {
  /** System-wide default policy */
  SYSTEM: 'system',
  /** Required by regulation */
  REGULATORY: 'regulatory',
  /** Industry standard */
  INDUSTRY: 'industry',
  /** Organization-wide policy */
  ORGANIZATIONAL: 'organizational',
  /** Workspace-specific policy */
  WORKSPACE: 'workspace',
  /** Custom user-defined policy */
  CUSTOM: 'custom',
} as const;
export type RetentionPolicyType = typeof RetentionPolicyType[keyof typeof RetentionPolicyType];

/**
 * Status of a retention policy
 */
export const RetentionPolicyStatus = {
  /** Policy being prepared */
  DRAFT: 'draft',
  /** Awaiting approval */
  PENDING_APPROVAL: 'pending_approval',
  /** Currently enforced */
  ACTIVE: 'active',
  /** Temporarily suspended */
  PAUSED: 'paused',
  /** No longer in use */
  RETIRED: 'retired',
  /** Replaced by newer version */
  SUPERSEDED: 'superseded',
} as const;
export type RetentionPolicyStatus = typeof RetentionPolicyStatus[keyof typeof RetentionPolicyStatus];

/**
 * Action to take when retention period expires
 */
export const RetentionActionOnExpiry = {
  /** Permanently delete */
  DELETE: 'delete',
  /** Move to cold storage */
  ARCHIVE: 'archive',
  /** Remove PII but keep aggregate data */
  ANONYMIZE: 'anonymize',
  /** Flag for manual review */
  REVIEW: 'review',
  /** Only notify, no automated action */
  NOTIFY_ONLY: 'notify_only',
} as const;
export type RetentionActionOnExpiry = typeof RetentionActionOnExpiry[keyof typeof RetentionActionOnExpiry];

/**
 * Frequency of retention policy execution
 */
export const RetentionExecutionFrequency = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  MANUAL: 'manual',
} as const;
export type RetentionExecutionFrequency = typeof RetentionExecutionFrequency[keyof typeof RetentionExecutionFrequency];

/**
 * Status of a retention policy execution
 */
export const RetentionExecutionStatus = {
  /** Waiting to start */
  PENDING: 'pending',
  /** Currently executing */
  RUNNING: 'running',
  /** Finished successfully */
  COMPLETED: 'completed',
  /** Finished with some errors */
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
  /** Failed to complete */
  FAILED: 'failed',
  /** Cancelled by user */
  CANCELLED: 'cancelled',
} as const;
export type RetentionExecutionStatus = typeof RetentionExecutionStatus[keyof typeof RetentionExecutionStatus];

// ---------------------------------------------------------------------------
// Incident Enums
// ---------------------------------------------------------------------------

/**
 * Types of security/compliance incidents
 */
export const IncidentType = {
  /** Unauthorized access to personal data */
  DATA_BREACH: 'data_breach',
  /** Security system compromise */
  SECURITY_BREACH: 'security_breach',
  /** Unauthorized system/data access */
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  /** Malware/ransomware infection */
  MALWARE: 'malware',
  /** Phishing attack */
  PHISHING: 'phishing',
  /** Denial of service attack */
  DDOS: 'ddos',
  /** Accidental data loss */
  DATA_LOSS: 'data_loss',
  /** Data integrity issue */
  DATA_CORRUPTION: 'data_corruption',
  /** Critical system failure */
  SYSTEM_FAILURE: 'system_failure',
  /** Internal policy violation */
  POLICY_VIOLATION: 'policy_violation',
  /** Regulatory compliance failure */
  COMPLIANCE_FAILURE: 'compliance_failure',
  /** Third-party/vendor incident */
  THIRD_PARTY: 'third_party',
  /** Insider threat incident */
  INSIDER_THREAT: 'insider_threat',
  /** Physical security incident */
  PHYSICAL_SECURITY: 'physical_security',
  /** Social engineering attack */
  SOCIAL_ENGINEERING: 'social_engineering',
  /** Security misconfiguration */
  MISCONFIGURATION: 'misconfiguration',
  /** Exploited vulnerability */
  VULNERABILITY: 'vulnerability',
  /** Other incident type */
  OTHER: 'other',
} as const;
export type IncidentType = typeof IncidentType[keyof typeof IncidentType];

/**
 * Categories of incidents
 */
export const IncidentCategory = {
  /** Security-related incident */
  SECURITY: 'security',
  /** Privacy/data protection incident */
  PRIVACY: 'privacy',
  /** Compliance violation */
  COMPLIANCE: 'compliance',
  /** Operational incident */
  OPERATIONAL: 'operational',
  /** Legal/regulatory incident */
  LEGAL: 'legal',
  /** Reputational impact incident */
  REPUTATIONAL: 'reputational',
  /** Financial impact incident */
  FINANCIAL: 'financial',
} as const;
export type IncidentCategory = typeof IncidentCategory[keyof typeof IncidentCategory];

/**
 * Severity levels for incidents
 */
export const IncidentSeverity = {
  /** Critical: immediate action required */
  CRITICAL: 'critical',
  /** High: urgent attention needed */
  HIGH: 'high',
  /** Medium: standard response */
  MEDIUM: 'medium',
  /** Low: can be scheduled */
  LOW: 'low',
  /** Informational: no immediate action */
  INFORMATIONAL: 'informational',
} as const;
export type IncidentSeverity = typeof IncidentSeverity[keyof typeof IncidentSeverity];

/**
 * Priority levels for incidents
 */
export const IncidentPriority = {
  /** P1: Drop everything */
  CRITICAL: 'critical',
  /** P2: High priority */
  HIGH: 'high',
  /** P3: Normal priority */
  MEDIUM: 'medium',
  /** P4: Low priority */
  LOW: 'low',
  /** P5: Deferred/backlog */
  DEFERRED: 'deferred',
} as const;
export type IncidentPriority = typeof IncidentPriority[keyof typeof IncidentPriority];

/**
 * Status of an incident
 */
export const IncidentStatus = {
  /** Initial detection */
  DETECTED: 'detected',
  /** Incident confirmed */
  CONFIRMED: 'confirmed',
  /** Under investigation */
  INVESTIGATING: 'investigating',
  /** Containment in progress */
  CONTAINING: 'containing',
  /** Containment complete */
  CONTAINED: 'contained',
  /** Eradication in progress */
  ERADICATING: 'eradicating',
  /** Threat removed */
  ERADICATED: 'eradicated',
  /** Recovery in progress */
  RECOVERING: 'recovering',
  /** Systems restored */
  RECOVERED: 'recovered',
  /** Incident resolved */
  RESOLVED: 'resolved',
  /** Incident closed */
  CLOSED: 'closed',
  /** PIR in progress */
  POST_INCIDENT_REVIEW: 'post_incident_review',
  /** Determined to be false positive */
  FALSE_POSITIVE: 'false_positive',
  /** Duplicate of another incident */
  DUPLICATE: 'duplicate',
  /** Escalated to higher authority */
  ESCALATED: 'escalated',
} as const;
export type IncidentStatus = typeof IncidentStatus[keyof typeof IncidentStatus];

// ---------------------------------------------------------------------------
// Audit Log Enums
// ---------------------------------------------------------------------------

/**
 * Status of an audit log export
 */
export const AuditExportStatus = {
  /** Export is pending */
  PENDING: 'pending',
  /** Export is being generated */
  PROCESSING: 'processing',
  /** Export completed successfully */
  COMPLETED: 'completed',
  /** Export failed */
  FAILED: 'failed',
  /** Export has expired and is no longer available */
  EXPIRED: 'expired',
} as const;
export type AuditExportStatus = typeof AuditExportStatus[keyof typeof AuditExportStatus];

/**
 * Format for audit log exports
 */
export const AuditExportFormat = {
  CSV: 'csv',
  JSON: 'json',
} as const;
export type AuditExportFormat = typeof AuditExportFormat[keyof typeof AuditExportFormat];

// ---------------------------------------------------------------------------
// Data Subject Request Interfaces
// ---------------------------------------------------------------------------

/**
 * Data subject request entity
 */
export interface DataSubjectRequest {
  request_id: string;
  workspace_id: string;
  request_number: string;
  subject_user_id?: string;
  subject_email: string;
  subject_name?: string;
  subject_type: DSRSubjectType;
  request_type: DSRRequestType;
  request_source: DSRSource;
  description?: string;
  status: DSRStatus;
  status_reason?: string;
  priority: DSRPriority;
  assigned_to_user_id?: string;
  submitted_at: string;
  deadline_at: string;
  extended_deadline_at?: string;
  extension_reason?: string;
  acknowledged_at?: string;
  processing_started_at?: string;
  completed_at?: string;
  verification_status: DSRVerificationStatus;
  verification_method?: string;
  verified_at?: string;
  verified_by_user_id?: string;
  export_job_id?: string;
  export_storage_key?: string;
  export_expires_at?: string;
  export_download_count: number;
  blocked_by_legal_hold_id?: string;
  blocked_at?: string;
  blocked_reason?: string;
  scope: Record<string, unknown>;
  internal_notes?: string;
  status_history: StatusHistoryEntry[];
  metadata: Record<string, unknown>;
  requester_ip_address?: string;
  requester_user_agent?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a new data subject request
 */
export interface CreateDataSubjectRequestRequest {
  subject_email: string;
  subject_name?: string;
  subject_user_id?: string;
  subject_type?: DSRSubjectType;
  request_type: DSRRequestType;
  request_source?: DSRSource;
  description?: string;
  priority?: DSRPriority;
  scope?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update a data subject request
 */
export interface UpdateDataSubjectRequestRequest {
  status?: DSRStatus;
  status_reason?: string;
  priority?: DSRPriority;
  assigned_to_user_id?: string;
  extended_deadline_at?: string;
  extension_reason?: string;
  verification_status?: DSRVerificationStatus;
  verification_method?: string;
  internal_notes?: string;
  scope?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Lightweight data subject request summary
 */
export interface DataSubjectRequestSummary {
  request_id: string;
  workspace_id: string;
  request_number: string;
  subject_email: string;
  request_type: DSRRequestType;
  status: DSRStatus;
  priority: DSRPriority;
  submitted_at: string;
  deadline_at: string;
  days_until_deadline: number;
}

// ---------------------------------------------------------------------------
// Legal Hold Interfaces
// ---------------------------------------------------------------------------

/**
 * Legal hold entity
 */
export interface LegalHold {
  hold_id: string;
  workspace_id: string;
  hold_number: string;
  name: string;
  description?: string;
  hold_type: LegalHoldType;
  matter_id?: string;
  matter_name?: string;
  status: LegalHoldStatus;
  status_reason?: string;
  priority: LegalHoldPriority;
  external_reference?: string;
  legal_counsel?: string;
  law_firm?: string;
  scope_type: LegalHoldScopeType;
  scope_users: string[];
  scope_resources: ScopeResource[];
  scope_resource_types: string[];
  scope_date_range?: DateRangeFilter;
  scope_keywords: string[];
  custodians: CustodianInfo[];
  custodian_acknowledgments: CustodianAcknowledgment[];
  issued_at: string;
  effective_from: string;
  effective_until?: string;
  released_at?: string;
  issued_by_user_id: string;
  released_by_user_id?: string;
  release_reason?: string;
  notification_sent_at?: string;
  reminder_frequency_days?: number;
  last_reminder_sent_at?: string;
  next_reminder_at?: string;
  affected_users_count: number;
  affected_resources_count: number;
  blocked_deletions_count: number;
  blocked_requests_count: number;
  internal_notes?: string;
  status_history: StatusHistoryEntry[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a new legal hold
 */
export interface CreateLegalHoldRequest {
  name: string;
  description?: string;
  hold_type?: LegalHoldType;
  matter_id?: string;
  matter_name?: string;
  priority?: LegalHoldPriority;
  external_reference?: string;
  legal_counsel?: string;
  law_firm?: string;
  scope_type?: LegalHoldScopeType;
  scope_users?: string[];
  scope_resources?: ScopeResource[];
  scope_resource_types?: string[];
  scope_date_range?: DateRangeFilter;
  scope_keywords?: string[];
  custodians?: CustodianInfo[];
  effective_from?: string;
  effective_until?: string;
  reminder_frequency_days?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update a legal hold
 */
export interface UpdateLegalHoldRequest {
  name?: string;
  description?: string;
  status?: LegalHoldStatus;
  status_reason?: string;
  priority?: LegalHoldPriority;
  scope_users?: string[];
  scope_resources?: ScopeResource[];
  scope_resource_types?: string[];
  scope_date_range?: DateRangeFilter;
  scope_keywords?: string[];
  custodians?: CustodianInfo[];
  effective_until?: string;
  reminder_frequency_days?: number;
  internal_notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Lightweight legal hold summary
 */
export interface LegalHoldSummary {
  hold_id: string;
  workspace_id: string;
  hold_number: string;
  name: string;
  hold_type: LegalHoldType;
  status: LegalHoldStatus;
  priority: LegalHoldPriority;
  effective_from: string;
  effective_until?: string;
  affected_resources_count: number;
}

/**
 * Resource under legal hold
 */
export interface LegalHoldResource {
  id: string;
  hold_id: string;
  workspace_id: string;
  resource_type: string;
  resource_id: string;
  user_id?: string;
  capture_method: string;
  added_at: string;
  added_by_user_id?: string;
  deletion_attempts: number;
  last_deletion_attempt_at?: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Retention Policy Interfaces
// ---------------------------------------------------------------------------

/**
 * Retention policy entity
 */
export interface RetentionPolicy {
  policy_id: string;
  workspace_id: string;
  policy_name: string;
  policy_code: string;
  description?: string;
  policy_type: RetentionPolicyType;
  status: RetentionPolicyStatus;
  status_reason?: string;
  priority: number;
  resource_types: string[];
  resource_filters: Record<string, unknown>;
  retention_period_days: number;
  archive_after_days?: number;
  delete_after_days?: number;
  grace_period_days: number;
  action_on_expiry: RetentionActionOnExpiry;
  archive_storage_class?: string;
  notification_days_before: number[];
  regulatory_basis?: string;
  regulatory_reference?: string;
  compliance_frameworks: string[];
  allow_user_extension: boolean;
  max_extension_days?: number;
  allow_legal_hold_override: boolean;
  applies_to_existing: boolean;
  applies_to_new: boolean;
  effective_from?: string;
  effective_until?: string;
  created_by_user_id: string;
  approved_by_user_id?: string;
  approved_at?: string;
  version: number;
  previous_version_id?: string;
  is_active_version: boolean;
  last_executed_at?: string;
  next_execution_at?: string;
  execution_frequency: RetentionExecutionFrequency;
  total_resources_affected: number;
  total_resources_archived: number;
  total_resources_deleted: number;
  total_storage_reclaimed_bytes: number;
  internal_notes?: string;
  change_history: ChangeHistoryEntry[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a new retention policy
 */
export interface CreateRetentionPolicyRequest {
  policy_name: string;
  policy_code: string;
  description?: string;
  policy_type?: RetentionPolicyType;
  priority?: number;
  resource_types?: string[];
  resource_filters?: Record<string, unknown>;
  retention_period_days: number;
  archive_after_days?: number;
  delete_after_days?: number;
  grace_period_days?: number;
  action_on_expiry?: RetentionActionOnExpiry;
  archive_storage_class?: string;
  notification_days_before?: number[];
  regulatory_basis?: string;
  regulatory_reference?: string;
  compliance_frameworks?: string[];
  allow_user_extension?: boolean;
  max_extension_days?: number;
  allow_legal_hold_override?: boolean;
  applies_to_existing?: boolean;
  applies_to_new?: boolean;
  effective_from?: string;
  effective_until?: string;
  execution_frequency?: RetentionExecutionFrequency;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update a retention policy
 */
export interface UpdateRetentionPolicyRequest {
  policy_name?: string;
  description?: string;
  status?: RetentionPolicyStatus;
  status_reason?: string;
  priority?: number;
  resource_types?: string[];
  resource_filters?: Record<string, unknown>;
  retention_period_days?: number;
  archive_after_days?: number;
  delete_after_days?: number;
  grace_period_days?: number;
  action_on_expiry?: RetentionActionOnExpiry;
  archive_storage_class?: string;
  notification_days_before?: number[];
  allow_user_extension?: boolean;
  max_extension_days?: number;
  allow_legal_hold_override?: boolean;
  applies_to_existing?: boolean;
  applies_to_new?: boolean;
  effective_from?: string;
  effective_until?: string;
  execution_frequency?: RetentionExecutionFrequency;
  internal_notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Lightweight retention policy summary
 */
export interface RetentionPolicySummary {
  policy_id: string;
  workspace_id: string;
  policy_name: string;
  policy_code: string;
  policy_type: RetentionPolicyType;
  status: RetentionPolicyStatus;
  retention_period_days: number;
  action_on_expiry: RetentionActionOnExpiry;
  is_active_version: boolean;
}

/**
 * Retention policy execution record
 */
export interface RetentionPolicyExecution {
  execution_id: string;
  policy_id: string;
  workspace_id: string;
  execution_type: string;
  status: RetentionExecutionStatus;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  initiated_by_user_id?: string;
  resources_scanned: number;
  resources_matched: number;
  resources_archived: number;
  resources_deleted: number;
  resources_anonymized: number;
  resources_flagged: number;
  resources_skipped: number;
  resources_failed: number;
  storage_scanned_bytes: number;
  storage_reclaimed_bytes: number;
  error_count: number;
  warning_count: number;
  errors: ExecutionError[];
  warnings: ExecutionWarning[];
  affected_resources: AffectedResource[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Incident Interfaces
// ---------------------------------------------------------------------------

/**
 * Incident entity
 */
export interface Incident {
  incident_id: string;
  workspace_id: string;
  incident_number: string;
  title: string;
  description: string;
  incident_type: IncidentType;
  category: IncidentCategory;
  severity: IncidentSeverity;
  impact: string;
  urgency: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  status_reason?: string;
  detected_at: string;
  detected_by_user_id?: string;
  detection_method: string;
  detection_source?: string;
  affected_users_count: number;
  affected_resources_count: number;
  affected_data_categories: string[];
  affected_systems: string[];
  geographic_scope: string[];
  is_data_breach: boolean;
  personal_data_involved: boolean;
  data_subjects_count?: number;
  data_categories_affected: string[];
  breach_type?: string;
  requires_notification: boolean;
  notification_deadline_at?: string;
  authority_notified_at?: string;
  authority_notification_reference?: string;
  subjects_notified_at?: string;
  subjects_notification_count?: number;
  assigned_to_user_id?: string;
  incident_commander_id?: string;
  team_members: IncidentTeamMember[];
  investigation_started_at?: string;
  investigation_completed_at?: string;
  root_cause?: string;
  root_cause_category?: string;
  attack_vector?: string;
  threat_actor_type?: string;
  containment_started_at?: string;
  containment_completed_at?: string;
  containment_actions: IncidentAction[];
  eradication_started_at?: string;
  eradication_completed_at?: string;
  eradication_actions: IncidentAction[];
  recovery_started_at?: string;
  recovery_completed_at?: string;
  recovery_actions: IncidentAction[];
  resolved_at?: string;
  resolution_summary?: string;
  resolution_type?: string;
  post_incident_review_at?: string;
  lessons_learned?: string;
  recommendations: IncidentRecommendation[];
  follow_up_actions: FollowUpAction[];
  evidence_preserved: boolean;
  evidence_location?: string;
  legal_hold_id?: string;
  related_incident_ids: string[];
  related_dsr_ids: string[];
  external_ticket_id?: string;
  external_ticket_url?: string;
  insurance_claim_id?: string;
  communications: IncidentCommunication[];
  timeline: TimelineEvent[];
  internal_notes?: string;
  status_history: StatusHistoryEntry[];
  metadata: Record<string, unknown>;
  reporter_ip_address?: string;
  reporter_user_agent?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

/**
 * Request to create a new incident
 */
export interface CreateIncidentRequest {
  title: string;
  description: string;
  incident_type: IncidentType;
  category?: IncidentCategory;
  severity?: IncidentSeverity;
  impact?: string;
  urgency?: string;
  detected_at?: string;
  detected_by_user_id?: string;
  detection_method?: string;
  detection_source?: string;
  is_data_breach?: boolean;
  personal_data_involved?: boolean;
  assigned_to_user_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update an incident
 */
export interface UpdateIncidentRequest {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  impact?: string;
  urgency?: string;
  priority?: IncidentPriority;
  status?: IncidentStatus;
  status_reason?: string;
  assigned_to_user_id?: string;
  incident_commander_id?: string;
  team_members?: IncidentTeamMember[];
  affected_users_count?: number;
  affected_resources_count?: number;
  affected_data_categories?: string[];
  affected_systems?: string[];
  is_data_breach?: boolean;
  personal_data_involved?: boolean;
  data_subjects_count?: number;
  data_categories_affected?: string[];
  breach_type?: string;
  requires_notification?: boolean;
  root_cause?: string;
  root_cause_category?: string;
  attack_vector?: string;
  threat_actor_type?: string;
  containment_actions?: IncidentAction[];
  eradication_actions?: IncidentAction[];
  recovery_actions?: IncidentAction[];
  resolution_summary?: string;
  resolution_type?: string;
  lessons_learned?: string;
  recommendations?: IncidentRecommendation[];
  follow_up_actions?: FollowUpAction[];
  evidence_preserved?: boolean;
  evidence_location?: string;
  legal_hold_id?: string;
  external_ticket_id?: string;
  external_ticket_url?: string;
  internal_notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Lightweight incident summary
 */
export interface IncidentSummary {
  incident_id: string;
  workspace_id: string;
  incident_number: string;
  title: string;
  incident_type: IncidentType;
  category: IncidentCategory;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  status: IncidentStatus;
  detected_at: string;
  is_data_breach: boolean;
  requires_notification: boolean;
}

/**
 * Incident timeline update
 */
export interface IncidentUpdate {
  update_id: string;
  incident_id: string;
  workspace_id: string;
  update_type: string;
  title?: string;
  content: string;
  previous_status?: string;
  new_status?: string;
  visibility: string;
  is_public: boolean;
  created_by_user_id: string;
  attachments: IncidentAttachment[];
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Resource affected by an incident
 */
export interface IncidentAffectedResource {
  id: string;
  incident_id: string;
  workspace_id: string;
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  user_id?: string;
  impact_type: string;
  impact_description?: string;
  data_classification?: string;
  contains_pii: boolean;
  contains_sensitive_data: boolean;
  identified_at: string;
  remediated_at?: string;
  remediation_status: string;
  remediation_notes?: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Audit Log Interfaces
// ---------------------------------------------------------------------------

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  event_id: string;
  workspace_id: string;
  event_type: string;
  event_category: string;
  actor_type: string;
  actor_id?: string;
  actor_email?: string;
  actor_display_name?: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  action: string;
  description?: string;
  previous_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  request_id?: string;
  status: string;
  error_message?: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

/**
 * Lightweight audit log summary
 */
export interface AuditLogSummary {
  event_id: string;
  event_type: string;
  event_category: string;
  actor_type: string;
  actor_email?: string;
  resource_type?: string;
  action: string;
  status: string;
  occurred_at: string;
}

/**
 * Query parameters for listing audit logs
 */
export interface ListAuditLogsQuery {
  event_type?: string;
  event_category?: string;
  actor_type?: string;
  actor_id?: string;
  resource_type?: string;
  resource_id?: string;
  action?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'occurred_at' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Audit log export entity
 */
export interface AuditExport {
  export_id: string;
  workspace_id: string;
  name: string;
  format: AuditExportFormat;
  status: AuditExportStatus;
  filters: ListAuditLogsQuery;
  total_records?: number;
  storage_key?: string;
  file_size_bytes?: number;
  download_url?: string;
  download_expires_at?: string;
  download_count: number;
  error_message?: string;
  created_by_user_id: string;
  created_at: string;
  completed_at?: string;
  expires_at?: string;
}

/**
 * Request to create an audit log export
 */
export interface CreateAuditExportRequest {
  name?: string;
  format?: AuditExportFormat;
  filters?: ListAuditLogsQuery;
}

// ---------------------------------------------------------------------------
// Query Interfaces
// ---------------------------------------------------------------------------

/**
 * Query parameters for listing data subject requests
 */
export interface ListDataSubjectRequestsQuery {
  request_type?: DSRRequestType;
  status?: DSRStatus;
  priority?: DSRPriority;
  subject_email?: string;
  assigned_to_user_id?: string;
  verification_status?: DSRVerificationStatus;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
  sort_by?: 'submitted_at' | 'deadline_at' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Query parameters for listing legal holds
 */
export interface ListLegalHoldsQuery {
  hold_type?: LegalHoldType;
  status?: LegalHoldStatus;
  priority?: LegalHoldPriority;
  matter_id?: string;
  issued_by_user_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
  sort_by?: 'issued_at' | 'effective_from' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Query parameters for listing retention policies
 */
export interface ListRetentionPoliciesQuery {
  policy_type?: RetentionPolicyType;
  status?: RetentionPolicyStatus;
  resource_type?: string;
  is_active_version?: boolean;
  page?: number;
  limit?: number;
  sort_by?: 'policy_name' | 'priority' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Query parameters for listing incidents
 */
export interface ListIncidentsQuery {
  incident_type?: IncidentType;
  category?: IncidentCategory;
  severity?: IncidentSeverity;
  priority?: IncidentPriority;
  status?: IncidentStatus;
  is_data_breach?: boolean;
  requires_notification?: boolean;
  assigned_to_user_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
  sort_by?: 'detected_at' | 'severity' | 'priority' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Paginated data subject requests response
 */
export interface DataSubjectRequestsListResponse {
  data: DataSubjectRequestSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated legal holds response
 */
export interface LegalHoldsListResponse {
  data: LegalHoldSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated retention policies response
 */
export interface RetentionPoliciesListResponse {
  data: RetentionPolicySummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated incidents response
 */
export interface IncidentsListResponse {
  data: IncidentSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated audit logs response
 */
export interface AuditLogsListResponse {
  data: AuditLogSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Statistics Interfaces
// ---------------------------------------------------------------------------

/**
 * Compliance dashboard statistics
 */
export interface ComplianceDashboardStats {
  data_subject_requests: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    overdue: number;
    avg_completion_days: number;
  };
  legal_holds: {
    total: number;
    active: number;
    resources_held: number;
    blocked_deletions: number;
  };
  retention_policies: {
    total: number;
    active: number;
    resources_affected: number;
    storage_reclaimed_bytes: number;
  };
  incidents: {
    total: number;
    open: number;
    critical: number;
    data_breaches: number;
    avg_resolution_hours: number;
  };
  calculated_at: string;
}

/**
 * DSR statistics
 */
export interface DSRStats {
  total_requests: number;
  by_status: Record<DSRStatus, number>;
  by_type: Record<DSRRequestType, number>;
  overdue_count: number;
  avg_completion_time_hours: number;
  compliance_rate: number;
}

/**
 * Legal hold statistics
 */
export interface LegalHoldStats {
  total_holds: number;
  by_status: Record<LegalHoldStatus, number>;
  by_type: Record<LegalHoldType, number>;
  total_resources_held: number;
  total_blocked_deletions: number;
}

/**
 * Incident statistics
 */
export interface IncidentStats {
  total_incidents: number;
  by_status: Record<IncidentStatus, number>;
  by_severity: Record<IncidentSeverity, number>;
  by_type: Record<IncidentType, number>;
  data_breaches_count: number;
  avg_resolution_time_hours: number;
  mttr_hours: number;
}

// ---------------------------------------------------------------------------
// Helper Interfaces
// ---------------------------------------------------------------------------

/**
 * Status history entry
 */
export interface StatusHistoryEntry {
  status: string;
  changed_at: string;
  changed_by_user_id?: string;
  reason?: string;
}

/**
 * Change history entry for policies
 */
export interface ChangeHistoryEntry {
  changed_at: string;
  changed_by_user_id: string;
  field: string;
  previous_value: unknown;
  new_value: unknown;
  reason?: string;
}

/**
 * Custodian information for legal holds
 */
export interface CustodianInfo {
  user_id: string;
  name: string;
  email: string;
  notified_at?: string;
  acknowledged_at?: string;
  acknowledgment_method?: string;
}

/**
 * Custodian acknowledgment record
 */
export interface CustodianAcknowledgment {
  user_id: string;
  acknowledged_at: string;
  method: string;
  ip_address?: string;
}

/**
 * Scope resource for legal holds
 */
export interface ScopeResource {
  resource_type: string;
  resource_id: string;
  resource_name?: string;
}

/**
 * Date range filter
 */
export interface DateRangeFilter {
  start_date?: string;
  end_date?: string;
}

/**
 * Execution error
 */
export interface ExecutionError {
  resource_type: string;
  resource_id: string;
  error_code: string;
  error_message: string;
  occurred_at: string;
}

/**
 * Execution warning
 */
export interface ExecutionWarning {
  resource_type: string;
  resource_id: string;
  warning_code: string;
  warning_message: string;
  occurred_at: string;
}

/**
 * Affected resource in retention execution
 */
export interface AffectedResource {
  resource_type: string;
  resource_id: string;
  action_taken: string;
  size_bytes?: number;
}

/**
 * Incident team member
 */
export interface IncidentTeamMember {
  user_id: string;
  role: string;
  assigned_at: string;
  removed_at?: string;
}

/**
 * Incident action
 */
export interface IncidentAction {
  action: string;
  performed_at: string;
  performed_by_user_id?: string;
  notes?: string;
}

/**
 * Incident recommendation
 */
export interface IncidentRecommendation {
  recommendation: string;
  priority: string;
  assigned_to_user_id?: string;
  due_date?: string;
  status: string;
  completed_at?: string;
}

/**
 * Follow-up action
 */
export interface FollowUpAction {
  action: string;
  assigned_to_user_id?: string;
  due_date?: string;
  status: string;
  completed_at?: string;
  notes?: string;
}

/**
 * Incident communication record
 */
export interface IncidentCommunication {
  type: string;
  sent_at: string;
  recipients: string[];
  content_summary: string;
  sent_by_user_id?: string;
}

/**
 * Timeline event
 */
export interface TimelineEvent {
  event: string;
  occurred_at: string;
  description?: string;
  actor_user_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Incident attachment
 */
export interface IncidentAttachment {
  attachment_id: string;
  name: string;
  file_type: string;
  file_size_bytes: number;
  storage_key: string;
  uploaded_at: string;
  uploaded_by_user_id: string;
}
