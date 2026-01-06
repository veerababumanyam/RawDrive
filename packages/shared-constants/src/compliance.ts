/**
 * Compliance Constants
 *
 * Constants for the Audit & Compliance system:
 * - Re-exported enums from shared-types
 * - Data Subject Request (DSR) configuration
 * - Legal Hold configuration
 * - Retention Policy configuration
 * - Incident management configuration
 * - Audit log configuration
 * - API paths
 * - Error messages
 *
 * @module compliance
 */

import { API_BASE } from './api';

// ---------------------------------------------------------------------------
// Re-export enums from shared-types for convenience
// (These are defined in shared-types to colocate with their TypeScript types)
// ---------------------------------------------------------------------------

export {
  // Data Subject Request enums
  DSRRequestType,
  DSRStatus,
  DSRSource,
  DSRSubjectType,
  DSRPriority,
  DSRVerificationStatus,
  // Legal Hold enums
  LegalHoldType,
  LegalHoldStatus,
  LegalHoldPriority,
  LegalHoldScopeType,
  // Retention Policy enums
  RetentionPolicyType,
  RetentionPolicyStatus,
  RetentionActionOnExpiry,
  RetentionExecutionFrequency,
  RetentionExecutionStatus,
  // Incident enums
  IncidentType,
  IncidentCategory,
  IncidentSeverity,
  IncidentPriority,
  IncidentStatus,
  // Audit Export enums
  AuditExportStatus,
  AuditExportFormat,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Data Subject Request Configuration
// ---------------------------------------------------------------------------

/**
 * Data Subject Request timing configuration
 */
export const DSR_TIMING = {
  /** Default deadline for DSR completion in days (GDPR: 30 days) */
  DEFAULT_DEADLINE_DAYS: 30,

  /** Maximum extension period in days (GDPR: additional 60 days) */
  MAX_EXTENSION_DAYS: 60,

  /** Grace period after completion before data deletion in days */
  COMPLETION_GRACE_PERIOD_DAYS: 7,

  /** Export download link expiry in hours */
  EXPORT_LINK_EXPIRY_HOURS: 48,

  /** Maximum export download attempts */
  MAX_EXPORT_DOWNLOADS: 5,

  /** Identity verification expiry in hours */
  VERIFICATION_EXPIRY_HOURS: 72,

  /** Reminder interval before deadline in days */
  REMINDER_DAYS_BEFORE_DEADLINE: [7, 3, 1],

  /** Auto-escalation after days without progress */
  AUTO_ESCALATION_DAYS: 14,

  /** Request acknowledgment SLA in hours */
  ACKNOWLEDGMENT_SLA_HOURS: 24,
} as const;

/**
 * Data Subject Request rate limits
 */
export const DSR_RATE_LIMITS = {
  /** Maximum requests per subject per month */
  REQUESTS_PER_SUBJECT_PER_MONTH: 5,

  /** Maximum concurrent processing requests per workspace */
  MAX_CONCURRENT_PROCESSING: 10,

  /** Maximum bulk request submissions per hour */
  BULK_SUBMISSIONS_PER_HOUR: 50,
} as const;

/**
 * Data Subject Request export configuration
 */
export const DSR_EXPORT_CONFIG = {
  /** Maximum file size for export in bytes (500MB) */
  MAX_EXPORT_SIZE_BYTES: 500 * 1024 * 1024,

  /** Supported export formats */
  EXPORT_FORMATS: ['json', 'csv', 'zip'] as const,

  /** Default export format */
  DEFAULT_FORMAT: 'zip' as const,

  /** Include timestamps in export */
  INCLUDE_TIMESTAMPS: true,

  /** Include metadata in export */
  INCLUDE_METADATA: true,

  /** Compress exports by default */
  COMPRESS_BY_DEFAULT: true,
} as const;

// ---------------------------------------------------------------------------
// Legal Hold Configuration
// ---------------------------------------------------------------------------

/**
 * Legal Hold timing configuration
 */
export const LEGAL_HOLD_TIMING = {
  /** Default reminder frequency in days */
  DEFAULT_REMINDER_FREQUENCY_DAYS: 30,

  /** Minimum reminder frequency in days */
  MIN_REMINDER_FREQUENCY_DAYS: 7,

  /** Maximum reminder frequency in days */
  MAX_REMINDER_FREQUENCY_DAYS: 90,

  /** Custodian acknowledgment deadline in days */
  ACKNOWLEDGMENT_DEADLINE_DAYS: 7,

  /** Escalation after missed acknowledgment in days */
  ESCALATION_AFTER_MISSED_ACK_DAYS: 3,

  /** Hold review reminder interval in days */
  REVIEW_REMINDER_DAYS: 90,

  /** Auto-expire draft holds after days */
  DRAFT_EXPIRY_DAYS: 30,
} as const;

/**
 * Legal Hold limits
 */
export const LEGAL_HOLD_LIMITS = {
  /** Maximum active holds per workspace */
  MAX_ACTIVE_HOLDS_PER_WORKSPACE: 100,

  /** Maximum custodians per hold */
  MAX_CUSTODIANS_PER_HOLD: 500,

  /** Maximum scope keywords per hold */
  MAX_KEYWORDS_PER_HOLD: 50,

  /** Maximum scope resources per hold */
  MAX_RESOURCES_PER_HOLD: 10000,

  /** Maximum scope users per hold */
  MAX_USERS_PER_HOLD: 1000,

  /** Maximum keyword length */
  MAX_KEYWORD_LENGTH: 100,
} as const;

/**
 * Legal Hold notification configuration
 */
export const LEGAL_HOLD_NOTIFICATION = {
  /** Send notification on hold creation */
  NOTIFY_ON_CREATION: true,

  /** Send notification on hold release */
  NOTIFY_ON_RELEASE: true,

  /** Send notification on hold modification */
  NOTIFY_ON_MODIFICATION: true,

  /** Include legal disclaimer in notifications */
  INCLUDE_DISCLAIMER: true,

  /** Require acknowledgment from custodians */
  REQUIRE_ACKNOWLEDGMENT: true,
} as const;

// ---------------------------------------------------------------------------
// Retention Policy Configuration
// ---------------------------------------------------------------------------

/**
 * Retention Policy timing configuration
 */
export const RETENTION_TIMING = {
  /** Minimum retention period in days */
  MIN_RETENTION_DAYS: 1,

  /** Maximum retention period in days (10 years) */
  MAX_RETENTION_DAYS: 3650,

  /** Default grace period before permanent deletion in days */
  DEFAULT_GRACE_PERIOD_DAYS: 30,

  /** Maximum grace period in days */
  MAX_GRACE_PERIOD_DAYS: 90,

  /** Notification days before expiry (default) */
  DEFAULT_NOTIFICATION_DAYS: [30, 7, 1],

  /** Policy review interval in days */
  POLICY_REVIEW_INTERVAL_DAYS: 180,

  /** Execution job timeout in minutes */
  EXECUTION_TIMEOUT_MINUTES: 60,
} as const;

/**
 * Retention Policy limits
 */
export const RETENTION_LIMITS = {
  /** Maximum policies per workspace */
  MAX_POLICIES_PER_WORKSPACE: 50,

  /** Maximum resource filters per policy */
  MAX_FILTERS_PER_POLICY: 20,

  /** Maximum resource types per policy */
  MAX_RESOURCE_TYPES_PER_POLICY: 10,

  /** Maximum compliance frameworks per policy */
  MAX_FRAMEWORKS_PER_POLICY: 10,

  /** Maximum user extensions per resource */
  MAX_EXTENSIONS_PER_RESOURCE: 3,
} as const;

/**
 * Retention Policy execution configuration
 */
export const RETENTION_EXECUTION = {
  /** Default batch size for processing */
  DEFAULT_BATCH_SIZE: 100,

  /** Maximum batch size */
  MAX_BATCH_SIZE: 1000,

  /** Retry attempts on failure */
  RETRY_ATTEMPTS: 3,

  /** Retry delay in seconds */
  RETRY_DELAY_SECONDS: 60,

  /** Maximum concurrent executions per workspace */
  MAX_CONCURRENT_EXECUTIONS: 3,

  /** Dry run by default for new policies */
  DRY_RUN_BY_DEFAULT: true,
} as const;

/**
 * Common compliance frameworks
 */
export const COMPLIANCE_FRAMEWORKS = {
  GDPR: 'GDPR',
  CCPA: 'CCPA',
  HIPAA: 'HIPAA',
  SOC2: 'SOC2',
  SOX: 'SOX',
  PCI_DSS: 'PCI_DSS',
  ISO_27001: 'ISO_27001',
  DPDP: 'DPDP',
  LGPD: 'LGPD',
  PIPEDA: 'PIPEDA',
} as const;

/**
 * Human-readable names for compliance frameworks
 */
export const COMPLIANCE_FRAMEWORK_NAMES = {
  [COMPLIANCE_FRAMEWORKS.GDPR]: 'General Data Protection Regulation (EU)',
  [COMPLIANCE_FRAMEWORKS.CCPA]: 'California Consumer Privacy Act',
  [COMPLIANCE_FRAMEWORKS.HIPAA]: 'Health Insurance Portability and Accountability Act',
  [COMPLIANCE_FRAMEWORKS.SOC2]: 'SOC 2 Type II',
  [COMPLIANCE_FRAMEWORKS.SOX]: 'Sarbanes-Oxley Act',
  [COMPLIANCE_FRAMEWORKS.PCI_DSS]: 'Payment Card Industry Data Security Standard',
  [COMPLIANCE_FRAMEWORKS.ISO_27001]: 'ISO/IEC 27001',
  [COMPLIANCE_FRAMEWORKS.DPDP]: 'Digital Personal Data Protection Act (India)',
  [COMPLIANCE_FRAMEWORKS.LGPD]: 'Lei Geral de Protecao de Dados (Brazil)',
  [COMPLIANCE_FRAMEWORKS.PIPEDA]: 'Personal Information Protection and Electronic Documents Act (Canada)',
} as const;

// ---------------------------------------------------------------------------
// Incident Configuration
// ---------------------------------------------------------------------------

/**
 * Incident timing configuration
 */
export const INCIDENT_TIMING = {
  /** GDPR breach notification deadline in hours */
  GDPR_NOTIFICATION_DEADLINE_HOURS: 72,

  /** Initial response SLA for critical incidents in minutes */
  CRITICAL_RESPONSE_SLA_MINUTES: 15,

  /** Initial response SLA for high severity incidents in minutes */
  HIGH_RESPONSE_SLA_MINUTES: 60,

  /** Initial response SLA for medium severity incidents in hours */
  MEDIUM_RESPONSE_SLA_HOURS: 4,

  /** Initial response SLA for low severity incidents in hours */
  LOW_RESPONSE_SLA_HOURS: 24,

  /** Post-incident review deadline in days */
  PIR_DEADLINE_DAYS: 14,

  /** Follow-up action review interval in days */
  FOLLOW_UP_REVIEW_DAYS: 7,

  /** Incident auto-close after days of inactivity */
  AUTO_CLOSE_INACTIVE_DAYS: 30,

  /** Status update reminder interval in hours */
  STATUS_UPDATE_REMINDER_HOURS: 4,
} as const;

/**
 * Incident limits
 */
export const INCIDENT_LIMITS = {
  /** Maximum team members per incident */
  MAX_TEAM_MEMBERS: 20,

  /** Maximum attachments per incident */
  MAX_ATTACHMENTS: 50,

  /** Maximum attachment size in bytes (50MB) */
  MAX_ATTACHMENT_SIZE_BYTES: 50 * 1024 * 1024,

  /** Maximum related incidents */
  MAX_RELATED_INCIDENTS: 10,

  /** Maximum recommendations per incident */
  MAX_RECOMMENDATIONS: 20,

  /** Maximum follow-up actions per incident */
  MAX_FOLLOW_UP_ACTIONS: 30,

  /** Maximum timeline events per incident */
  MAX_TIMELINE_EVENTS: 500,

  /** Maximum communications per incident */
  MAX_COMMUNICATIONS: 100,
} as const;

/**
 * Incident severity to priority mapping (default)
 */
export const INCIDENT_SEVERITY_PRIORITY_MAP = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  informational: 'deferred',
} as const;

/**
 * Breach notification requirements by regulation
 */
export const BREACH_NOTIFICATION_REQUIREMENTS = {
  GDPR: {
    authority_deadline_hours: 72,
    subject_deadline_days: null, // "without undue delay"
    threshold: 'risk_to_rights_and_freedoms',
  },
  CCPA: {
    authority_deadline_hours: null,
    subject_deadline_days: null, // "expedient time"
    threshold: 'unencrypted_personal_info',
  },
  HIPAA: {
    authority_deadline_hours: null,
    subject_deadline_days: 60,
    threshold: 'unsecured_phi',
  },
} as const;

// ---------------------------------------------------------------------------
// Audit Log Configuration
// ---------------------------------------------------------------------------

/**
 * Audit log timing configuration
 */
export const AUDIT_LOG_TIMING = {
  /** Minimum retention period in days */
  MIN_RETENTION_DAYS: 30,

  /** Default retention period in days */
  DEFAULT_RETENTION_DAYS: 365,

  /** Maximum retention period in days (7 years) */
  MAX_RETENTION_DAYS: 2555,

  /** Export job timeout in minutes */
  EXPORT_TIMEOUT_MINUTES: 30,

  /** Export download link expiry in hours */
  EXPORT_LINK_EXPIRY_HOURS: 24,

  /** Query timeout for large date ranges in seconds */
  LARGE_QUERY_TIMEOUT_SECONDS: 30,

  /** Large date range threshold in days */
  LARGE_DATE_RANGE_THRESHOLD_DAYS: 90,
} as const;

/**
 * Audit log rate limits
 */
export const AUDIT_LOG_RATE_LIMITS = {
  /** Maximum queries per minute per user */
  QUERIES_PER_MINUTE: 30,

  /** Maximum exports per hour per workspace */
  EXPORTS_PER_HOUR: 10,

  /** Maximum results per page */
  MAX_PAGE_SIZE: 500,

  /** Default results per page */
  DEFAULT_PAGE_SIZE: 50,
} as const;

/**
 * Audit export configuration
 */
export const AUDIT_EXPORT_CONFIG = {
  /** Maximum records per export */
  MAX_RECORDS: 1000000,

  /** Maximum file size in bytes (1GB) */
  MAX_FILE_SIZE_BYTES: 1024 * 1024 * 1024,

  /** Supported formats */
  FORMATS: ['csv', 'json'] as const,

  /** Default format */
  DEFAULT_FORMAT: 'csv' as const,

  /** Include PII in exports (requires elevated permissions) */
  INCLUDE_PII_DEFAULT: false,

  /** Export expiry in hours */
  EXPIRY_HOURS: 24,

  /** Maximum concurrent exports per workspace */
  MAX_CONCURRENT_EXPORTS: 3,
} as const;

// ---------------------------------------------------------------------------
// API Paths
// ---------------------------------------------------------------------------

/**
 * Compliance API paths
 */
export const COMPLIANCE_API_PATHS = {
  /** Base path for compliance endpoints */
  BASE: `${API_BASE}/compliance`,

  // Audit Logs
  /** Audit logs list and search */
  AUDIT_LOGS: `${API_BASE}/audit-logs`,
  /** Single audit log entry */
  AUDIT_LOG: `${API_BASE}/audit-logs/{eventId}`,
  /** Audit log exports */
  AUDIT_EXPORTS: `${API_BASE}/audit-logs/exports`,
  /** Single audit export */
  AUDIT_EXPORT: `${API_BASE}/audit-logs/exports/{exportId}`,
  /** Download audit export */
  AUDIT_EXPORT_DOWNLOAD: `${API_BASE}/audit-logs/exports/{exportId}/download`,

  // Data Subject Requests
  /** DSR list and create */
  DATA_SUBJECT_REQUESTS: `${API_BASE}/compliance/data-subject-requests`,
  /** Single DSR */
  DATA_SUBJECT_REQUEST: `${API_BASE}/compliance/data-subject-requests/{requestId}`,
  /** DSR status update */
  DSR_STATUS: `${API_BASE}/compliance/data-subject-requests/{requestId}/status`,
  /** DSR export download */
  DSR_EXPORT_DOWNLOAD: `${API_BASE}/compliance/data-subject-requests/{requestId}/export`,
  /** DSR statistics */
  DSR_STATS: `${API_BASE}/compliance/data-subject-requests/stats`,

  // Legal Holds
  /** Legal holds list and create */
  LEGAL_HOLDS: `${API_BASE}/compliance/legal-holds`,
  /** Single legal hold */
  LEGAL_HOLD: `${API_BASE}/compliance/legal-holds/{holdId}`,
  /** Legal hold status update */
  LEGAL_HOLD_STATUS: `${API_BASE}/compliance/legal-holds/{holdId}/status`,
  /** Legal hold resources */
  LEGAL_HOLD_RESOURCES: `${API_BASE}/compliance/legal-holds/{holdId}/resources`,
  /** Legal hold custodians */
  LEGAL_HOLD_CUSTODIANS: `${API_BASE}/compliance/legal-holds/{holdId}/custodians`,
  /** Legal hold acknowledgments */
  LEGAL_HOLD_ACKNOWLEDGMENTS: `${API_BASE}/compliance/legal-holds/{holdId}/acknowledgments`,
  /** Legal hold statistics */
  LEGAL_HOLD_STATS: `${API_BASE}/compliance/legal-holds/stats`,
  /** Check if resource is under hold */
  LEGAL_HOLD_CHECK: `${API_BASE}/compliance/legal-holds/check`,

  // Retention Policies
  /** Retention policies list and create */
  RETENTION_POLICIES: `${API_BASE}/compliance/retention-policies`,
  /** Single retention policy */
  RETENTION_POLICY: `${API_BASE}/compliance/retention-policies/{policyId}`,
  /** Retention policy status update */
  RETENTION_POLICY_STATUS: `${API_BASE}/compliance/retention-policies/{policyId}/status`,
  /** Retention policy executions */
  RETENTION_EXECUTIONS: `${API_BASE}/compliance/retention-policies/{policyId}/executions`,
  /** Single execution */
  RETENTION_EXECUTION: `${API_BASE}/compliance/retention-policies/{policyId}/executions/{executionId}`,
  /** Trigger policy execution */
  RETENTION_EXECUTE: `${API_BASE}/compliance/retention-policies/{policyId}/execute`,
  /** Retention policy statistics */
  RETENTION_STATS: `${API_BASE}/compliance/retention-policies/stats`,

  // Incidents
  /** Incidents list and create */
  INCIDENTS: `${API_BASE}/compliance/incidents`,
  /** Single incident */
  INCIDENT: `${API_BASE}/compliance/incidents/{incidentId}`,
  /** Incident status update */
  INCIDENT_STATUS: `${API_BASE}/compliance/incidents/{incidentId}/status`,
  /** Incident updates/timeline */
  INCIDENT_UPDATES: `${API_BASE}/compliance/incidents/{incidentId}/updates`,
  /** Incident team members */
  INCIDENT_TEAM: `${API_BASE}/compliance/incidents/{incidentId}/team`,
  /** Incident affected resources */
  INCIDENT_RESOURCES: `${API_BASE}/compliance/incidents/{incidentId}/resources`,
  /** Incident attachments */
  INCIDENT_ATTACHMENTS: `${API_BASE}/compliance/incidents/{incidentId}/attachments`,
  /** Incident statistics */
  INCIDENT_STATS: `${API_BASE}/compliance/incidents/stats`,

  // Dashboard
  /** Compliance dashboard */
  DASHBOARD: `${API_BASE}/compliance/dashboard`,
  /** Compliance overview stats */
  OVERVIEW: `${API_BASE}/compliance/overview`,
} as const;

// ---------------------------------------------------------------------------
// Error Messages
// ---------------------------------------------------------------------------

/**
 * Compliance error messages
 */
export const COMPLIANCE_ERROR_MESSAGES = {
  // Authentication/Authorization
  UNAUTHORIZED: 'You are not authorized to access compliance features.',
  FORBIDDEN: 'You do not have permission to perform this compliance action.',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions for this compliance operation.',

  // Data Subject Requests
  DSR_NOT_FOUND: 'Data subject request not found.',
  DSR_ALREADY_COMPLETED: 'This data subject request has already been completed.',
  DSR_ALREADY_CANCELLED: 'This data subject request has already been cancelled.',
  DSR_BLOCKED_BY_HOLD: 'This request is blocked by an active legal hold.',
  DSR_RATE_LIMITED: 'Too many data subject requests. Please try again later.',
  DSR_INVALID_STATUS_TRANSITION: 'Invalid status transition for data subject request.',
  DSR_VERIFICATION_REQUIRED: 'Identity verification is required before processing.',
  DSR_VERIFICATION_EXPIRED: 'Identity verification has expired. Please verify again.',
  DSR_EXPORT_NOT_READY: 'Data export is not yet ready for download.',
  DSR_EXPORT_EXPIRED: 'Data export has expired. Please request a new export.',
  DSR_EXTENSION_LIMIT_REACHED: 'Maximum deadline extension limit has been reached.',

  // Legal Holds
  LEGAL_HOLD_NOT_FOUND: 'Legal hold not found.',
  LEGAL_HOLD_ALREADY_ACTIVE: 'This legal hold is already active.',
  LEGAL_HOLD_ALREADY_RELEASED: 'This legal hold has already been released.',
  LEGAL_HOLD_INVALID_STATUS: 'Invalid status transition for legal hold.',
  LEGAL_HOLD_LIMIT_REACHED: 'Maximum number of active legal holds reached.',
  LEGAL_HOLD_RESOURCE_ALREADY_HELD: 'Resource is already under this legal hold.',
  LEGAL_HOLD_CUSTODIAN_LIMIT: 'Maximum number of custodians per hold reached.',
  LEGAL_HOLD_DELETION_BLOCKED: 'Deletion blocked by active legal hold.',
  LEGAL_HOLD_ACK_REQUIRED: 'Custodian acknowledgment is required.',
  LEGAL_HOLD_SCOPE_EMPTY: 'Legal hold scope cannot be empty.',

  // Retention Policies
  RETENTION_POLICY_NOT_FOUND: 'Retention policy not found.',
  RETENTION_POLICY_ALREADY_ACTIVE: 'This retention policy is already active.',
  RETENTION_POLICY_IN_USE: 'Cannot delete policy that is currently in use.',
  RETENTION_POLICY_INVALID_STATUS: 'Invalid status transition for retention policy.',
  RETENTION_POLICY_LIMIT_REACHED: 'Maximum number of retention policies reached.',
  RETENTION_EXECUTION_IN_PROGRESS: 'A retention execution is already in progress.',
  RETENTION_EXECUTION_NOT_FOUND: 'Retention execution not found.',
  RETENTION_BLOCKED_BY_HOLD: 'Retention action blocked by active legal hold.',
  RETENTION_INVALID_PERIOD: 'Invalid retention period. Check minimum and maximum values.',

  // Incidents
  INCIDENT_NOT_FOUND: 'Incident not found.',
  INCIDENT_ALREADY_CLOSED: 'This incident has already been closed.',
  INCIDENT_INVALID_STATUS: 'Invalid status transition for incident.',
  INCIDENT_TEAM_LIMIT: 'Maximum number of team members reached.',
  INCIDENT_ATTACHMENT_LIMIT: 'Maximum number of attachments reached.',
  INCIDENT_ATTACHMENT_TOO_LARGE: 'Attachment exceeds maximum file size.',
  INCIDENT_UPDATE_NOT_FOUND: 'Incident update not found.',
  INCIDENT_NOTIFICATION_FAILED: 'Failed to send incident notification.',

  // Audit Logs
  AUDIT_LOG_NOT_FOUND: 'Audit log entry not found.',
  AUDIT_EXPORT_NOT_FOUND: 'Audit export not found.',
  AUDIT_EXPORT_IN_PROGRESS: 'Audit export is already in progress.',
  AUDIT_EXPORT_FAILED: 'Audit export failed. Please try again.',
  AUDIT_EXPORT_EXPIRED: 'Audit export has expired. Please request a new export.',
  AUDIT_QUERY_TIMEOUT: 'Query timed out. Please narrow your date range.',
  AUDIT_RATE_LIMITED: 'Too many audit log queries. Please wait before trying again.',

  // General
  INVALID_DATE_RANGE: 'Invalid date range. Start date must be before end date.',
  DATE_RANGE_TOO_LARGE: 'Date range exceeds maximum allowed span.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  INVALID_REQUEST: 'Invalid request. Please check the provided data.',
} as const;

// ---------------------------------------------------------------------------
// Human-Readable Labels
// ---------------------------------------------------------------------------

/**
 * Human-readable labels for DSR request types
 */
export const DSR_REQUEST_TYPE_LABELS = {
  access: 'Access Request',
  rectification: 'Rectification Request',
  erasure: 'Erasure Request (Right to be Forgotten)',
  portability: 'Data Portability Request',
  restriction: 'Processing Restriction Request',
  objection: 'Objection to Processing',
  opt_out_sale: 'Opt-Out of Sale (CCPA)',
  disclosure: 'Disclosure Request (CCPA)',
} as const;

/**
 * Human-readable labels for DSR statuses
 */
export const DSR_STATUS_LABELS = {
  pending: 'Pending',
  identity_verification: 'Identity Verification',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  awaiting_approval: 'Awaiting Approval',
  blocked: 'Blocked',
  completed: 'Completed',
  partially_completed: 'Partially Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
} as const;

/**
 * Human-readable labels for legal hold types
 */
export const LEGAL_HOLD_TYPE_LABELS = {
  litigation: 'Litigation Hold',
  regulatory: 'Regulatory Investigation',
  internal_audit: 'Internal Audit',
  compliance: 'Compliance Requirement',
  preservation: 'Preservation Request',
  subpoena: 'Subpoena/Court Order',
  government: 'Government Inquiry',
  other: 'Other',
} as const;

/**
 * Human-readable labels for legal hold statuses
 */
export const LEGAL_HOLD_STATUS_LABELS = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  active: 'Active',
  suspended: 'Suspended',
  released: 'Released',
  expired: 'Expired',
  cancelled: 'Cancelled',
} as const;

/**
 * Human-readable labels for incident severities
 */
export const INCIDENT_SEVERITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
} as const;

/**
 * Human-readable labels for incident statuses
 */
export const INCIDENT_STATUS_LABELS = {
  detected: 'Detected',
  confirmed: 'Confirmed',
  investigating: 'Investigating',
  containing: 'Containing',
  contained: 'Contained',
  eradicating: 'Eradicating',
  eradicated: 'Eradicated',
  recovering: 'Recovering',
  recovered: 'Recovered',
  resolved: 'Resolved',
  closed: 'Closed',
  post_incident_review: 'Post-Incident Review',
  false_positive: 'False Positive',
  duplicate: 'Duplicate',
  escalated: 'Escalated',
} as const;

// ---------------------------------------------------------------------------
// Pagination Defaults
// ---------------------------------------------------------------------------

/**
 * Compliance pagination defaults
 */
export const COMPLIANCE_PAGINATION = {
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

  /** Default items per page for incidents */
  INCIDENT_DEFAULT_LIMIT: 20,

  /** Default items per page for timeline events */
  TIMELINE_DEFAULT_LIMIT: 50,
} as const;

// ---------------------------------------------------------------------------
// Consolidated Export
// ---------------------------------------------------------------------------

/**
 * All compliance constants consolidated
 */
export const COMPLIANCE = {
  // DSR
  DSR_TIMING,
  DSR_RATE_LIMITS,
  DSR_EXPORT_CONFIG,
  DSR_REQUEST_TYPE_LABELS,
  DSR_STATUS_LABELS,

  // Legal Hold
  LEGAL_HOLD_TIMING,
  LEGAL_HOLD_LIMITS,
  LEGAL_HOLD_NOTIFICATION,
  LEGAL_HOLD_TYPE_LABELS,
  LEGAL_HOLD_STATUS_LABELS,

  // Retention
  RETENTION_TIMING,
  RETENTION_LIMITS,
  RETENTION_EXECUTION,
  COMPLIANCE_FRAMEWORKS,
  COMPLIANCE_FRAMEWORK_NAMES,

  // Incident
  INCIDENT_TIMING,
  INCIDENT_LIMITS,
  INCIDENT_SEVERITY_PRIORITY_MAP,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  BREACH_NOTIFICATION_REQUIREMENTS,

  // Audit
  AUDIT_LOG_TIMING,
  AUDIT_LOG_RATE_LIMITS,
  AUDIT_EXPORT_CONFIG,

  // API
  API_PATHS: COMPLIANCE_API_PATHS,

  // Errors
  ERROR_MESSAGES: COMPLIANCE_ERROR_MESSAGES,

  // Pagination
  PAGINATION: COMPLIANCE_PAGINATION,
} as const;
