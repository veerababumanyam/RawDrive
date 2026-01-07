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
export { DSRRequestType, DSRStatus, DSRSource, DSRSubjectType, DSRPriority, DSRVerificationStatus, LegalHoldType, LegalHoldStatus, LegalHoldPriority, LegalHoldScopeType, RetentionPolicyType, RetentionPolicyStatus, RetentionActionOnExpiry, RetentionExecutionFrequency, RetentionExecutionStatus, IncidentType, IncidentCategory, IncidentSeverity, IncidentPriority, IncidentStatus, AuditExportStatus, AuditExportFormat, } from '@rawdrive/shared-types';
/**
 * Data Subject Request timing configuration
 */
export declare const DSR_TIMING: {
    /** Default deadline for DSR completion in days (GDPR: 30 days) */
    readonly DEFAULT_DEADLINE_DAYS: 30;
    /** Maximum extension period in days (GDPR: additional 60 days) */
    readonly MAX_EXTENSION_DAYS: 60;
    /** Grace period after completion before data deletion in days */
    readonly COMPLETION_GRACE_PERIOD_DAYS: 7;
    /** Export download link expiry in hours */
    readonly EXPORT_LINK_EXPIRY_HOURS: 48;
    /** Maximum export download attempts */
    readonly MAX_EXPORT_DOWNLOADS: 5;
    /** Identity verification expiry in hours */
    readonly VERIFICATION_EXPIRY_HOURS: 72;
    /** Reminder interval before deadline in days */
    readonly REMINDER_DAYS_BEFORE_DEADLINE: readonly [7, 3, 1];
    /** Auto-escalation after days without progress */
    readonly AUTO_ESCALATION_DAYS: 14;
    /** Request acknowledgment SLA in hours */
    readonly ACKNOWLEDGMENT_SLA_HOURS: 24;
};
/**
 * Data Subject Request rate limits
 */
export declare const DSR_RATE_LIMITS: {
    /** Maximum requests per subject per month */
    readonly REQUESTS_PER_SUBJECT_PER_MONTH: 5;
    /** Maximum concurrent processing requests per workspace */
    readonly MAX_CONCURRENT_PROCESSING: 10;
    /** Maximum bulk request submissions per hour */
    readonly BULK_SUBMISSIONS_PER_HOUR: 50;
};
/**
 * Data Subject Request export configuration
 */
export declare const DSR_EXPORT_CONFIG: {
    /** Maximum file size for export in bytes (500MB) */
    readonly MAX_EXPORT_SIZE_BYTES: number;
    /** Supported export formats */
    readonly EXPORT_FORMATS: readonly ["json", "csv", "zip"];
    /** Default export format */
    readonly DEFAULT_FORMAT: "zip";
    /** Include timestamps in export */
    readonly INCLUDE_TIMESTAMPS: true;
    /** Include metadata in export */
    readonly INCLUDE_METADATA: true;
    /** Compress exports by default */
    readonly COMPRESS_BY_DEFAULT: true;
};
/**
 * Legal Hold timing configuration
 */
export declare const LEGAL_HOLD_TIMING: {
    /** Default reminder frequency in days */
    readonly DEFAULT_REMINDER_FREQUENCY_DAYS: 30;
    /** Minimum reminder frequency in days */
    readonly MIN_REMINDER_FREQUENCY_DAYS: 7;
    /** Maximum reminder frequency in days */
    readonly MAX_REMINDER_FREQUENCY_DAYS: 90;
    /** Custodian acknowledgment deadline in days */
    readonly ACKNOWLEDGMENT_DEADLINE_DAYS: 7;
    /** Escalation after missed acknowledgment in days */
    readonly ESCALATION_AFTER_MISSED_ACK_DAYS: 3;
    /** Hold review reminder interval in days */
    readonly REVIEW_REMINDER_DAYS: 90;
    /** Auto-expire draft holds after days */
    readonly DRAFT_EXPIRY_DAYS: 30;
};
/**
 * Legal Hold limits
 */
export declare const LEGAL_HOLD_LIMITS: {
    /** Maximum active holds per workspace */
    readonly MAX_ACTIVE_HOLDS_PER_WORKSPACE: 100;
    /** Maximum custodians per hold */
    readonly MAX_CUSTODIANS_PER_HOLD: 500;
    /** Maximum scope keywords per hold */
    readonly MAX_KEYWORDS_PER_HOLD: 50;
    /** Maximum scope resources per hold */
    readonly MAX_RESOURCES_PER_HOLD: 10000;
    /** Maximum scope users per hold */
    readonly MAX_USERS_PER_HOLD: 1000;
    /** Maximum keyword length */
    readonly MAX_KEYWORD_LENGTH: 100;
};
/**
 * Legal Hold notification configuration
 */
export declare const LEGAL_HOLD_NOTIFICATION: {
    /** Send notification on hold creation */
    readonly NOTIFY_ON_CREATION: true;
    /** Send notification on hold release */
    readonly NOTIFY_ON_RELEASE: true;
    /** Send notification on hold modification */
    readonly NOTIFY_ON_MODIFICATION: true;
    /** Include legal disclaimer in notifications */
    readonly INCLUDE_DISCLAIMER: true;
    /** Require acknowledgment from custodians */
    readonly REQUIRE_ACKNOWLEDGMENT: true;
};
/**
 * Retention Policy timing configuration
 */
export declare const RETENTION_TIMING: {
    /** Minimum retention period in days */
    readonly MIN_RETENTION_DAYS: 1;
    /** Maximum retention period in days (10 years) */
    readonly MAX_RETENTION_DAYS: 3650;
    /** Default grace period before permanent deletion in days */
    readonly DEFAULT_GRACE_PERIOD_DAYS: 30;
    /** Maximum grace period in days */
    readonly MAX_GRACE_PERIOD_DAYS: 90;
    /** Notification days before expiry (default) */
    readonly DEFAULT_NOTIFICATION_DAYS: readonly [30, 7, 1];
    /** Policy review interval in days */
    readonly POLICY_REVIEW_INTERVAL_DAYS: 180;
    /** Execution job timeout in minutes */
    readonly EXECUTION_TIMEOUT_MINUTES: 60;
};
/**
 * Retention Policy limits
 */
export declare const RETENTION_LIMITS: {
    /** Maximum policies per workspace */
    readonly MAX_POLICIES_PER_WORKSPACE: 50;
    /** Maximum resource filters per policy */
    readonly MAX_FILTERS_PER_POLICY: 20;
    /** Maximum resource types per policy */
    readonly MAX_RESOURCE_TYPES_PER_POLICY: 10;
    /** Maximum compliance frameworks per policy */
    readonly MAX_FRAMEWORKS_PER_POLICY: 10;
    /** Maximum user extensions per resource */
    readonly MAX_EXTENSIONS_PER_RESOURCE: 3;
};
/**
 * Retention Policy execution configuration
 */
export declare const RETENTION_EXECUTION: {
    /** Default batch size for processing */
    readonly DEFAULT_BATCH_SIZE: 100;
    /** Maximum batch size */
    readonly MAX_BATCH_SIZE: 1000;
    /** Retry attempts on failure */
    readonly RETRY_ATTEMPTS: 3;
    /** Retry delay in seconds */
    readonly RETRY_DELAY_SECONDS: 60;
    /** Maximum concurrent executions per workspace */
    readonly MAX_CONCURRENT_EXECUTIONS: 3;
    /** Dry run by default for new policies */
    readonly DRY_RUN_BY_DEFAULT: true;
};
/**
 * Common compliance frameworks
 */
export declare const COMPLIANCE_FRAMEWORKS: {
    readonly GDPR: "GDPR";
    readonly CCPA: "CCPA";
    readonly HIPAA: "HIPAA";
    readonly SOC2: "SOC2";
    readonly SOX: "SOX";
    readonly PCI_DSS: "PCI_DSS";
    readonly ISO_27001: "ISO_27001";
    readonly DPDP: "DPDP";
    readonly LGPD: "LGPD";
    readonly PIPEDA: "PIPEDA";
};
/**
 * Human-readable names for compliance frameworks
 */
export declare const COMPLIANCE_FRAMEWORK_NAMES: {
    readonly GDPR: "General Data Protection Regulation (EU)";
    readonly CCPA: "California Consumer Privacy Act";
    readonly HIPAA: "Health Insurance Portability and Accountability Act";
    readonly SOC2: "SOC 2 Type II";
    readonly SOX: "Sarbanes-Oxley Act";
    readonly PCI_DSS: "Payment Card Industry Data Security Standard";
    readonly ISO_27001: "ISO/IEC 27001";
    readonly DPDP: "Digital Personal Data Protection Act (India)";
    readonly LGPD: "Lei Geral de Protecao de Dados (Brazil)";
    readonly PIPEDA: "Personal Information Protection and Electronic Documents Act (Canada)";
};
/**
 * Incident timing configuration
 */
export declare const INCIDENT_TIMING: {
    /** GDPR breach notification deadline in hours */
    readonly GDPR_NOTIFICATION_DEADLINE_HOURS: 72;
    /** Initial response SLA for critical incidents in minutes */
    readonly CRITICAL_RESPONSE_SLA_MINUTES: 15;
    /** Initial response SLA for high severity incidents in minutes */
    readonly HIGH_RESPONSE_SLA_MINUTES: 60;
    /** Initial response SLA for medium severity incidents in hours */
    readonly MEDIUM_RESPONSE_SLA_HOURS: 4;
    /** Initial response SLA for low severity incidents in hours */
    readonly LOW_RESPONSE_SLA_HOURS: 24;
    /** Post-incident review deadline in days */
    readonly PIR_DEADLINE_DAYS: 14;
    /** Follow-up action review interval in days */
    readonly FOLLOW_UP_REVIEW_DAYS: 7;
    /** Incident auto-close after days of inactivity */
    readonly AUTO_CLOSE_INACTIVE_DAYS: 30;
    /** Status update reminder interval in hours */
    readonly STATUS_UPDATE_REMINDER_HOURS: 4;
};
/**
 * Incident limits
 */
export declare const INCIDENT_LIMITS: {
    /** Maximum team members per incident */
    readonly MAX_TEAM_MEMBERS: 20;
    /** Maximum attachments per incident */
    readonly MAX_ATTACHMENTS: 50;
    /** Maximum attachment size in bytes (50MB) */
    readonly MAX_ATTACHMENT_SIZE_BYTES: number;
    /** Maximum related incidents */
    readonly MAX_RELATED_INCIDENTS: 10;
    /** Maximum recommendations per incident */
    readonly MAX_RECOMMENDATIONS: 20;
    /** Maximum follow-up actions per incident */
    readonly MAX_FOLLOW_UP_ACTIONS: 30;
    /** Maximum timeline events per incident */
    readonly MAX_TIMELINE_EVENTS: 500;
    /** Maximum communications per incident */
    readonly MAX_COMMUNICATIONS: 100;
};
/**
 * Incident severity to priority mapping (default)
 */
export declare const INCIDENT_SEVERITY_PRIORITY_MAP: {
    readonly critical: "critical";
    readonly high: "high";
    readonly medium: "medium";
    readonly low: "low";
    readonly informational: "deferred";
};
/**
 * Breach notification requirements by regulation
 */
export declare const BREACH_NOTIFICATION_REQUIREMENTS: {
    readonly GDPR: {
        readonly authority_deadline_hours: 72;
        readonly subject_deadline_days: null;
        readonly threshold: "risk_to_rights_and_freedoms";
    };
    readonly CCPA: {
        readonly authority_deadline_hours: null;
        readonly subject_deadline_days: null;
        readonly threshold: "unencrypted_personal_info";
    };
    readonly HIPAA: {
        readonly authority_deadline_hours: null;
        readonly subject_deadline_days: 60;
        readonly threshold: "unsecured_phi";
    };
};
/**
 * Audit log timing configuration
 */
export declare const AUDIT_LOG_TIMING: {
    /** Minimum retention period in days */
    readonly MIN_RETENTION_DAYS: 30;
    /** Default retention period in days */
    readonly DEFAULT_RETENTION_DAYS: 365;
    /** Maximum retention period in days (7 years) */
    readonly MAX_RETENTION_DAYS: 2555;
    /** Export job timeout in minutes */
    readonly EXPORT_TIMEOUT_MINUTES: 30;
    /** Export download link expiry in hours */
    readonly EXPORT_LINK_EXPIRY_HOURS: 24;
    /** Query timeout for large date ranges in seconds */
    readonly LARGE_QUERY_TIMEOUT_SECONDS: 30;
    /** Large date range threshold in days */
    readonly LARGE_DATE_RANGE_THRESHOLD_DAYS: 90;
};
/**
 * Audit log rate limits
 */
export declare const AUDIT_LOG_RATE_LIMITS: {
    /** Maximum queries per minute per user */
    readonly QUERIES_PER_MINUTE: 30;
    /** Maximum exports per hour per workspace */
    readonly EXPORTS_PER_HOUR: 10;
    /** Maximum results per page */
    readonly MAX_PAGE_SIZE: 500;
    /** Default results per page */
    readonly DEFAULT_PAGE_SIZE: 50;
};
/**
 * Audit export configuration
 */
export declare const AUDIT_EXPORT_CONFIG: {
    /** Maximum records per export */
    readonly MAX_RECORDS: 1000000;
    /** Maximum file size in bytes (1GB) */
    readonly MAX_FILE_SIZE_BYTES: number;
    /** Supported formats */
    readonly FORMATS: readonly ["csv", "json"];
    /** Default format */
    readonly DEFAULT_FORMAT: "csv";
    /** Include PII in exports (requires elevated permissions) */
    readonly INCLUDE_PII_DEFAULT: false;
    /** Export expiry in hours */
    readonly EXPIRY_HOURS: 24;
    /** Maximum concurrent exports per workspace */
    readonly MAX_CONCURRENT_EXPORTS: 3;
};
/**
 * Compliance API paths
 */
export declare const COMPLIANCE_API_PATHS: {
    /** Base path for compliance endpoints */
    readonly BASE: "/api/v1/compliance";
    /** Audit logs list and search */
    readonly AUDIT_LOGS: "/api/v1/audit-logs";
    /** Single audit log entry */
    readonly AUDIT_LOG: "/api/v1/audit-logs/{eventId}";
    /** Audit log exports */
    readonly AUDIT_EXPORTS: "/api/v1/audit-logs/exports";
    /** Single audit export */
    readonly AUDIT_EXPORT: "/api/v1/audit-logs/exports/{exportId}";
    /** Download audit export */
    readonly AUDIT_EXPORT_DOWNLOAD: "/api/v1/audit-logs/exports/{exportId}/download";
    /** DSR list and create */
    readonly DATA_SUBJECT_REQUESTS: "/api/v1/compliance/data-subject-requests";
    /** Single DSR */
    readonly DATA_SUBJECT_REQUEST: "/api/v1/compliance/data-subject-requests/{requestId}";
    /** DSR status update */
    readonly DSR_STATUS: "/api/v1/compliance/data-subject-requests/{requestId}/status";
    /** DSR export download */
    readonly DSR_EXPORT_DOWNLOAD: "/api/v1/compliance/data-subject-requests/{requestId}/export";
    /** DSR statistics */
    readonly DSR_STATS: "/api/v1/compliance/data-subject-requests/stats";
    /** Legal holds list and create */
    readonly LEGAL_HOLDS: "/api/v1/compliance/legal-holds";
    /** Single legal hold */
    readonly LEGAL_HOLD: "/api/v1/compliance/legal-holds/{holdId}";
    /** Legal hold status update */
    readonly LEGAL_HOLD_STATUS: "/api/v1/compliance/legal-holds/{holdId}/status";
    /** Legal hold resources */
    readonly LEGAL_HOLD_RESOURCES: "/api/v1/compliance/legal-holds/{holdId}/resources";
    /** Legal hold custodians */
    readonly LEGAL_HOLD_CUSTODIANS: "/api/v1/compliance/legal-holds/{holdId}/custodians";
    /** Legal hold acknowledgments */
    readonly LEGAL_HOLD_ACKNOWLEDGMENTS: "/api/v1/compliance/legal-holds/{holdId}/acknowledgments";
    /** Legal hold statistics */
    readonly LEGAL_HOLD_STATS: "/api/v1/compliance/legal-holds/stats";
    /** Check if resource is under hold */
    readonly LEGAL_HOLD_CHECK: "/api/v1/compliance/legal-holds/check";
    /** Retention policies list and create */
    readonly RETENTION_POLICIES: "/api/v1/compliance/retention-policies";
    /** Single retention policy */
    readonly RETENTION_POLICY: "/api/v1/compliance/retention-policies/{policyId}";
    /** Retention policy status update */
    readonly RETENTION_POLICY_STATUS: "/api/v1/compliance/retention-policies/{policyId}/status";
    /** Retention policy executions */
    readonly RETENTION_EXECUTIONS: "/api/v1/compliance/retention-policies/{policyId}/executions";
    /** Single execution */
    readonly RETENTION_EXECUTION: "/api/v1/compliance/retention-policies/{policyId}/executions/{executionId}";
    /** Trigger policy execution */
    readonly RETENTION_EXECUTE: "/api/v1/compliance/retention-policies/{policyId}/execute";
    /** Retention policy statistics */
    readonly RETENTION_STATS: "/api/v1/compliance/retention-policies/stats";
    /** Incidents list and create */
    readonly INCIDENTS: "/api/v1/compliance/incidents";
    /** Single incident */
    readonly INCIDENT: "/api/v1/compliance/incidents/{incidentId}";
    /** Incident status update */
    readonly INCIDENT_STATUS: "/api/v1/compliance/incidents/{incidentId}/status";
    /** Incident updates/timeline */
    readonly INCIDENT_UPDATES: "/api/v1/compliance/incidents/{incidentId}/updates";
    /** Incident team members */
    readonly INCIDENT_TEAM: "/api/v1/compliance/incidents/{incidentId}/team";
    /** Incident affected resources */
    readonly INCIDENT_RESOURCES: "/api/v1/compliance/incidents/{incidentId}/resources";
    /** Incident attachments */
    readonly INCIDENT_ATTACHMENTS: "/api/v1/compliance/incidents/{incidentId}/attachments";
    /** Incident statistics */
    readonly INCIDENT_STATS: "/api/v1/compliance/incidents/stats";
    /** Compliance dashboard */
    readonly DASHBOARD: "/api/v1/compliance/dashboard";
    /** Compliance overview stats */
    readonly OVERVIEW: "/api/v1/compliance/overview";
};
/**
 * Compliance error messages
 */
export declare const COMPLIANCE_ERROR_MESSAGES: {
    readonly UNAUTHORIZED: "You are not authorized to access compliance features.";
    readonly FORBIDDEN: "You do not have permission to perform this compliance action.";
    readonly INSUFFICIENT_PERMISSIONS: "Insufficient permissions for this compliance operation.";
    readonly DSR_NOT_FOUND: "Data subject request not found.";
    readonly DSR_ALREADY_COMPLETED: "This data subject request has already been completed.";
    readonly DSR_ALREADY_CANCELLED: "This data subject request has already been cancelled.";
    readonly DSR_BLOCKED_BY_HOLD: "This request is blocked by an active legal hold.";
    readonly DSR_RATE_LIMITED: "Too many data subject requests. Please try again later.";
    readonly DSR_INVALID_STATUS_TRANSITION: "Invalid status transition for data subject request.";
    readonly DSR_VERIFICATION_REQUIRED: "Identity verification is required before processing.";
    readonly DSR_VERIFICATION_EXPIRED: "Identity verification has expired. Please verify again.";
    readonly DSR_EXPORT_NOT_READY: "Data export is not yet ready for download.";
    readonly DSR_EXPORT_EXPIRED: "Data export has expired. Please request a new export.";
    readonly DSR_EXTENSION_LIMIT_REACHED: "Maximum deadline extension limit has been reached.";
    readonly LEGAL_HOLD_NOT_FOUND: "Legal hold not found.";
    readonly LEGAL_HOLD_ALREADY_ACTIVE: "This legal hold is already active.";
    readonly LEGAL_HOLD_ALREADY_RELEASED: "This legal hold has already been released.";
    readonly LEGAL_HOLD_INVALID_STATUS: "Invalid status transition for legal hold.";
    readonly LEGAL_HOLD_LIMIT_REACHED: "Maximum number of active legal holds reached.";
    readonly LEGAL_HOLD_RESOURCE_ALREADY_HELD: "Resource is already under this legal hold.";
    readonly LEGAL_HOLD_CUSTODIAN_LIMIT: "Maximum number of custodians per hold reached.";
    readonly LEGAL_HOLD_DELETION_BLOCKED: "Deletion blocked by active legal hold.";
    readonly LEGAL_HOLD_ACK_REQUIRED: "Custodian acknowledgment is required.";
    readonly LEGAL_HOLD_SCOPE_EMPTY: "Legal hold scope cannot be empty.";
    readonly RETENTION_POLICY_NOT_FOUND: "Retention policy not found.";
    readonly RETENTION_POLICY_ALREADY_ACTIVE: "This retention policy is already active.";
    readonly RETENTION_POLICY_IN_USE: "Cannot delete policy that is currently in use.";
    readonly RETENTION_POLICY_INVALID_STATUS: "Invalid status transition for retention policy.";
    readonly RETENTION_POLICY_LIMIT_REACHED: "Maximum number of retention policies reached.";
    readonly RETENTION_EXECUTION_IN_PROGRESS: "A retention execution is already in progress.";
    readonly RETENTION_EXECUTION_NOT_FOUND: "Retention execution not found.";
    readonly RETENTION_BLOCKED_BY_HOLD: "Retention action blocked by active legal hold.";
    readonly RETENTION_INVALID_PERIOD: "Invalid retention period. Check minimum and maximum values.";
    readonly INCIDENT_NOT_FOUND: "Incident not found.";
    readonly INCIDENT_ALREADY_CLOSED: "This incident has already been closed.";
    readonly INCIDENT_INVALID_STATUS: "Invalid status transition for incident.";
    readonly INCIDENT_TEAM_LIMIT: "Maximum number of team members reached.";
    readonly INCIDENT_ATTACHMENT_LIMIT: "Maximum number of attachments reached.";
    readonly INCIDENT_ATTACHMENT_TOO_LARGE: "Attachment exceeds maximum file size.";
    readonly INCIDENT_UPDATE_NOT_FOUND: "Incident update not found.";
    readonly INCIDENT_NOTIFICATION_FAILED: "Failed to send incident notification.";
    readonly AUDIT_LOG_NOT_FOUND: "Audit log entry not found.";
    readonly AUDIT_EXPORT_NOT_FOUND: "Audit export not found.";
    readonly AUDIT_EXPORT_IN_PROGRESS: "Audit export is already in progress.";
    readonly AUDIT_EXPORT_FAILED: "Audit export failed. Please try again.";
    readonly AUDIT_EXPORT_EXPIRED: "Audit export has expired. Please request a new export.";
    readonly AUDIT_QUERY_TIMEOUT: "Query timed out. Please narrow your date range.";
    readonly AUDIT_RATE_LIMITED: "Too many audit log queries. Please wait before trying again.";
    readonly INVALID_DATE_RANGE: "Invalid date range. Start date must be before end date.";
    readonly DATE_RANGE_TOO_LARGE: "Date range exceeds maximum allowed span.";
    readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
    readonly INVALID_REQUEST: "Invalid request. Please check the provided data.";
};
/**
 * Human-readable labels for DSR request types
 */
export declare const DSR_REQUEST_TYPE_LABELS: {
    readonly access: "Access Request";
    readonly rectification: "Rectification Request";
    readonly erasure: "Erasure Request (Right to be Forgotten)";
    readonly portability: "Data Portability Request";
    readonly restriction: "Processing Restriction Request";
    readonly objection: "Objection to Processing";
    readonly opt_out_sale: "Opt-Out of Sale (CCPA)";
    readonly disclosure: "Disclosure Request (CCPA)";
};
/**
 * Human-readable labels for DSR statuses
 */
export declare const DSR_STATUS_LABELS: {
    readonly pending: "Pending";
    readonly identity_verification: "Identity Verification";
    readonly acknowledged: "Acknowledged";
    readonly in_progress: "In Progress";
    readonly awaiting_approval: "Awaiting Approval";
    readonly blocked: "Blocked";
    readonly completed: "Completed";
    readonly partially_completed: "Partially Completed";
    readonly rejected: "Rejected";
    readonly cancelled: "Cancelled";
    readonly expired: "Expired";
};
/**
 * Human-readable labels for legal hold types
 */
export declare const LEGAL_HOLD_TYPE_LABELS: {
    readonly litigation: "Litigation Hold";
    readonly regulatory: "Regulatory Investigation";
    readonly internal_audit: "Internal Audit";
    readonly compliance: "Compliance Requirement";
    readonly preservation: "Preservation Request";
    readonly subpoena: "Subpoena/Court Order";
    readonly government: "Government Inquiry";
    readonly other: "Other";
};
/**
 * Human-readable labels for legal hold statuses
 */
export declare const LEGAL_HOLD_STATUS_LABELS: {
    readonly draft: "Draft";
    readonly pending_approval: "Pending Approval";
    readonly active: "Active";
    readonly suspended: "Suspended";
    readonly released: "Released";
    readonly expired: "Expired";
    readonly cancelled: "Cancelled";
};
/**
 * Human-readable labels for incident severities
 */
export declare const INCIDENT_SEVERITY_LABELS: {
    readonly critical: "Critical";
    readonly high: "High";
    readonly medium: "Medium";
    readonly low: "Low";
    readonly informational: "Informational";
};
/**
 * Human-readable labels for incident statuses
 */
export declare const INCIDENT_STATUS_LABELS: {
    readonly detected: "Detected";
    readonly confirmed: "Confirmed";
    readonly investigating: "Investigating";
    readonly containing: "Containing";
    readonly contained: "Contained";
    readonly eradicating: "Eradicating";
    readonly eradicated: "Eradicated";
    readonly recovering: "Recovering";
    readonly recovered: "Recovered";
    readonly resolved: "Resolved";
    readonly closed: "Closed";
    readonly post_incident_review: "Post-Incident Review";
    readonly false_positive: "False Positive";
    readonly duplicate: "Duplicate";
    readonly escalated: "Escalated";
};
/**
 * Compliance pagination defaults
 */
export declare const COMPLIANCE_PAGINATION: {
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
    /** Default items per page for incidents */
    readonly INCIDENT_DEFAULT_LIMIT: 20;
    /** Default items per page for timeline events */
    readonly TIMELINE_DEFAULT_LIMIT: 50;
};
/**
 * All compliance constants consolidated
 */
export declare const COMPLIANCE: {
    readonly DSR_TIMING: {
        /** Default deadline for DSR completion in days (GDPR: 30 days) */
        readonly DEFAULT_DEADLINE_DAYS: 30;
        /** Maximum extension period in days (GDPR: additional 60 days) */
        readonly MAX_EXTENSION_DAYS: 60;
        /** Grace period after completion before data deletion in days */
        readonly COMPLETION_GRACE_PERIOD_DAYS: 7;
        /** Export download link expiry in hours */
        readonly EXPORT_LINK_EXPIRY_HOURS: 48;
        /** Maximum export download attempts */
        readonly MAX_EXPORT_DOWNLOADS: 5;
        /** Identity verification expiry in hours */
        readonly VERIFICATION_EXPIRY_HOURS: 72;
        /** Reminder interval before deadline in days */
        readonly REMINDER_DAYS_BEFORE_DEADLINE: readonly [7, 3, 1];
        /** Auto-escalation after days without progress */
        readonly AUTO_ESCALATION_DAYS: 14;
        /** Request acknowledgment SLA in hours */
        readonly ACKNOWLEDGMENT_SLA_HOURS: 24;
    };
    readonly DSR_RATE_LIMITS: {
        /** Maximum requests per subject per month */
        readonly REQUESTS_PER_SUBJECT_PER_MONTH: 5;
        /** Maximum concurrent processing requests per workspace */
        readonly MAX_CONCURRENT_PROCESSING: 10;
        /** Maximum bulk request submissions per hour */
        readonly BULK_SUBMISSIONS_PER_HOUR: 50;
    };
    readonly DSR_EXPORT_CONFIG: {
        /** Maximum file size for export in bytes (500MB) */
        readonly MAX_EXPORT_SIZE_BYTES: number;
        /** Supported export formats */
        readonly EXPORT_FORMATS: readonly ["json", "csv", "zip"];
        /** Default export format */
        readonly DEFAULT_FORMAT: "zip";
        /** Include timestamps in export */
        readonly INCLUDE_TIMESTAMPS: true;
        /** Include metadata in export */
        readonly INCLUDE_METADATA: true;
        /** Compress exports by default */
        readonly COMPRESS_BY_DEFAULT: true;
    };
    readonly DSR_REQUEST_TYPE_LABELS: {
        readonly access: "Access Request";
        readonly rectification: "Rectification Request";
        readonly erasure: "Erasure Request (Right to be Forgotten)";
        readonly portability: "Data Portability Request";
        readonly restriction: "Processing Restriction Request";
        readonly objection: "Objection to Processing";
        readonly opt_out_sale: "Opt-Out of Sale (CCPA)";
        readonly disclosure: "Disclosure Request (CCPA)";
    };
    readonly DSR_STATUS_LABELS: {
        readonly pending: "Pending";
        readonly identity_verification: "Identity Verification";
        readonly acknowledged: "Acknowledged";
        readonly in_progress: "In Progress";
        readonly awaiting_approval: "Awaiting Approval";
        readonly blocked: "Blocked";
        readonly completed: "Completed";
        readonly partially_completed: "Partially Completed";
        readonly rejected: "Rejected";
        readonly cancelled: "Cancelled";
        readonly expired: "Expired";
    };
    readonly LEGAL_HOLD_TIMING: {
        /** Default reminder frequency in days */
        readonly DEFAULT_REMINDER_FREQUENCY_DAYS: 30;
        /** Minimum reminder frequency in days */
        readonly MIN_REMINDER_FREQUENCY_DAYS: 7;
        /** Maximum reminder frequency in days */
        readonly MAX_REMINDER_FREQUENCY_DAYS: 90;
        /** Custodian acknowledgment deadline in days */
        readonly ACKNOWLEDGMENT_DEADLINE_DAYS: 7;
        /** Escalation after missed acknowledgment in days */
        readonly ESCALATION_AFTER_MISSED_ACK_DAYS: 3;
        /** Hold review reminder interval in days */
        readonly REVIEW_REMINDER_DAYS: 90;
        /** Auto-expire draft holds after days */
        readonly DRAFT_EXPIRY_DAYS: 30;
    };
    readonly LEGAL_HOLD_LIMITS: {
        /** Maximum active holds per workspace */
        readonly MAX_ACTIVE_HOLDS_PER_WORKSPACE: 100;
        /** Maximum custodians per hold */
        readonly MAX_CUSTODIANS_PER_HOLD: 500;
        /** Maximum scope keywords per hold */
        readonly MAX_KEYWORDS_PER_HOLD: 50;
        /** Maximum scope resources per hold */
        readonly MAX_RESOURCES_PER_HOLD: 10000;
        /** Maximum scope users per hold */
        readonly MAX_USERS_PER_HOLD: 1000;
        /** Maximum keyword length */
        readonly MAX_KEYWORD_LENGTH: 100;
    };
    readonly LEGAL_HOLD_NOTIFICATION: {
        /** Send notification on hold creation */
        readonly NOTIFY_ON_CREATION: true;
        /** Send notification on hold release */
        readonly NOTIFY_ON_RELEASE: true;
        /** Send notification on hold modification */
        readonly NOTIFY_ON_MODIFICATION: true;
        /** Include legal disclaimer in notifications */
        readonly INCLUDE_DISCLAIMER: true;
        /** Require acknowledgment from custodians */
        readonly REQUIRE_ACKNOWLEDGMENT: true;
    };
    readonly LEGAL_HOLD_TYPE_LABELS: {
        readonly litigation: "Litigation Hold";
        readonly regulatory: "Regulatory Investigation";
        readonly internal_audit: "Internal Audit";
        readonly compliance: "Compliance Requirement";
        readonly preservation: "Preservation Request";
        readonly subpoena: "Subpoena/Court Order";
        readonly government: "Government Inquiry";
        readonly other: "Other";
    };
    readonly LEGAL_HOLD_STATUS_LABELS: {
        readonly draft: "Draft";
        readonly pending_approval: "Pending Approval";
        readonly active: "Active";
        readonly suspended: "Suspended";
        readonly released: "Released";
        readonly expired: "Expired";
        readonly cancelled: "Cancelled";
    };
    readonly RETENTION_TIMING: {
        /** Minimum retention period in days */
        readonly MIN_RETENTION_DAYS: 1;
        /** Maximum retention period in days (10 years) */
        readonly MAX_RETENTION_DAYS: 3650;
        /** Default grace period before permanent deletion in days */
        readonly DEFAULT_GRACE_PERIOD_DAYS: 30;
        /** Maximum grace period in days */
        readonly MAX_GRACE_PERIOD_DAYS: 90;
        /** Notification days before expiry (default) */
        readonly DEFAULT_NOTIFICATION_DAYS: readonly [30, 7, 1];
        /** Policy review interval in days */
        readonly POLICY_REVIEW_INTERVAL_DAYS: 180;
        /** Execution job timeout in minutes */
        readonly EXECUTION_TIMEOUT_MINUTES: 60;
    };
    readonly RETENTION_LIMITS: {
        /** Maximum policies per workspace */
        readonly MAX_POLICIES_PER_WORKSPACE: 50;
        /** Maximum resource filters per policy */
        readonly MAX_FILTERS_PER_POLICY: 20;
        /** Maximum resource types per policy */
        readonly MAX_RESOURCE_TYPES_PER_POLICY: 10;
        /** Maximum compliance frameworks per policy */
        readonly MAX_FRAMEWORKS_PER_POLICY: 10;
        /** Maximum user extensions per resource */
        readonly MAX_EXTENSIONS_PER_RESOURCE: 3;
    };
    readonly RETENTION_EXECUTION: {
        /** Default batch size for processing */
        readonly DEFAULT_BATCH_SIZE: 100;
        /** Maximum batch size */
        readonly MAX_BATCH_SIZE: 1000;
        /** Retry attempts on failure */
        readonly RETRY_ATTEMPTS: 3;
        /** Retry delay in seconds */
        readonly RETRY_DELAY_SECONDS: 60;
        /** Maximum concurrent executions per workspace */
        readonly MAX_CONCURRENT_EXECUTIONS: 3;
        /** Dry run by default for new policies */
        readonly DRY_RUN_BY_DEFAULT: true;
    };
    readonly COMPLIANCE_FRAMEWORKS: {
        readonly GDPR: "GDPR";
        readonly CCPA: "CCPA";
        readonly HIPAA: "HIPAA";
        readonly SOC2: "SOC2";
        readonly SOX: "SOX";
        readonly PCI_DSS: "PCI_DSS";
        readonly ISO_27001: "ISO_27001";
        readonly DPDP: "DPDP";
        readonly LGPD: "LGPD";
        readonly PIPEDA: "PIPEDA";
    };
    readonly COMPLIANCE_FRAMEWORK_NAMES: {
        readonly GDPR: "General Data Protection Regulation (EU)";
        readonly CCPA: "California Consumer Privacy Act";
        readonly HIPAA: "Health Insurance Portability and Accountability Act";
        readonly SOC2: "SOC 2 Type II";
        readonly SOX: "Sarbanes-Oxley Act";
        readonly PCI_DSS: "Payment Card Industry Data Security Standard";
        readonly ISO_27001: "ISO/IEC 27001";
        readonly DPDP: "Digital Personal Data Protection Act (India)";
        readonly LGPD: "Lei Geral de Protecao de Dados (Brazil)";
        readonly PIPEDA: "Personal Information Protection and Electronic Documents Act (Canada)";
    };
    readonly INCIDENT_TIMING: {
        /** GDPR breach notification deadline in hours */
        readonly GDPR_NOTIFICATION_DEADLINE_HOURS: 72;
        /** Initial response SLA for critical incidents in minutes */
        readonly CRITICAL_RESPONSE_SLA_MINUTES: 15;
        /** Initial response SLA for high severity incidents in minutes */
        readonly HIGH_RESPONSE_SLA_MINUTES: 60;
        /** Initial response SLA for medium severity incidents in hours */
        readonly MEDIUM_RESPONSE_SLA_HOURS: 4;
        /** Initial response SLA for low severity incidents in hours */
        readonly LOW_RESPONSE_SLA_HOURS: 24;
        /** Post-incident review deadline in days */
        readonly PIR_DEADLINE_DAYS: 14;
        /** Follow-up action review interval in days */
        readonly FOLLOW_UP_REVIEW_DAYS: 7;
        /** Incident auto-close after days of inactivity */
        readonly AUTO_CLOSE_INACTIVE_DAYS: 30;
        /** Status update reminder interval in hours */
        readonly STATUS_UPDATE_REMINDER_HOURS: 4;
    };
    readonly INCIDENT_LIMITS: {
        /** Maximum team members per incident */
        readonly MAX_TEAM_MEMBERS: 20;
        /** Maximum attachments per incident */
        readonly MAX_ATTACHMENTS: 50;
        /** Maximum attachment size in bytes (50MB) */
        readonly MAX_ATTACHMENT_SIZE_BYTES: number;
        /** Maximum related incidents */
        readonly MAX_RELATED_INCIDENTS: 10;
        /** Maximum recommendations per incident */
        readonly MAX_RECOMMENDATIONS: 20;
        /** Maximum follow-up actions per incident */
        readonly MAX_FOLLOW_UP_ACTIONS: 30;
        /** Maximum timeline events per incident */
        readonly MAX_TIMELINE_EVENTS: 500;
        /** Maximum communications per incident */
        readonly MAX_COMMUNICATIONS: 100;
    };
    readonly INCIDENT_SEVERITY_PRIORITY_MAP: {
        readonly critical: "critical";
        readonly high: "high";
        readonly medium: "medium";
        readonly low: "low";
        readonly informational: "deferred";
    };
    readonly INCIDENT_SEVERITY_LABELS: {
        readonly critical: "Critical";
        readonly high: "High";
        readonly medium: "Medium";
        readonly low: "Low";
        readonly informational: "Informational";
    };
    readonly INCIDENT_STATUS_LABELS: {
        readonly detected: "Detected";
        readonly confirmed: "Confirmed";
        readonly investigating: "Investigating";
        readonly containing: "Containing";
        readonly contained: "Contained";
        readonly eradicating: "Eradicating";
        readonly eradicated: "Eradicated";
        readonly recovering: "Recovering";
        readonly recovered: "Recovered";
        readonly resolved: "Resolved";
        readonly closed: "Closed";
        readonly post_incident_review: "Post-Incident Review";
        readonly false_positive: "False Positive";
        readonly duplicate: "Duplicate";
        readonly escalated: "Escalated";
    };
    readonly BREACH_NOTIFICATION_REQUIREMENTS: {
        readonly GDPR: {
            readonly authority_deadline_hours: 72;
            readonly subject_deadline_days: null;
            readonly threshold: "risk_to_rights_and_freedoms";
        };
        readonly CCPA: {
            readonly authority_deadline_hours: null;
            readonly subject_deadline_days: null;
            readonly threshold: "unencrypted_personal_info";
        };
        readonly HIPAA: {
            readonly authority_deadline_hours: null;
            readonly subject_deadline_days: 60;
            readonly threshold: "unsecured_phi";
        };
    };
    readonly AUDIT_LOG_TIMING: {
        /** Minimum retention period in days */
        readonly MIN_RETENTION_DAYS: 30;
        /** Default retention period in days */
        readonly DEFAULT_RETENTION_DAYS: 365;
        /** Maximum retention period in days (7 years) */
        readonly MAX_RETENTION_DAYS: 2555;
        /** Export job timeout in minutes */
        readonly EXPORT_TIMEOUT_MINUTES: 30;
        /** Export download link expiry in hours */
        readonly EXPORT_LINK_EXPIRY_HOURS: 24;
        /** Query timeout for large date ranges in seconds */
        readonly LARGE_QUERY_TIMEOUT_SECONDS: 30;
        /** Large date range threshold in days */
        readonly LARGE_DATE_RANGE_THRESHOLD_DAYS: 90;
    };
    readonly AUDIT_LOG_RATE_LIMITS: {
        /** Maximum queries per minute per user */
        readonly QUERIES_PER_MINUTE: 30;
        /** Maximum exports per hour per workspace */
        readonly EXPORTS_PER_HOUR: 10;
        /** Maximum results per page */
        readonly MAX_PAGE_SIZE: 500;
        /** Default results per page */
        readonly DEFAULT_PAGE_SIZE: 50;
    };
    readonly AUDIT_EXPORT_CONFIG: {
        /** Maximum records per export */
        readonly MAX_RECORDS: 1000000;
        /** Maximum file size in bytes (1GB) */
        readonly MAX_FILE_SIZE_BYTES: number;
        /** Supported formats */
        readonly FORMATS: readonly ["csv", "json"];
        /** Default format */
        readonly DEFAULT_FORMAT: "csv";
        /** Include PII in exports (requires elevated permissions) */
        readonly INCLUDE_PII_DEFAULT: false;
        /** Export expiry in hours */
        readonly EXPIRY_HOURS: 24;
        /** Maximum concurrent exports per workspace */
        readonly MAX_CONCURRENT_EXPORTS: 3;
    };
    readonly API_PATHS: {
        /** Base path for compliance endpoints */
        readonly BASE: "/api/v1/compliance";
        /** Audit logs list and search */
        readonly AUDIT_LOGS: "/api/v1/audit-logs";
        /** Single audit log entry */
        readonly AUDIT_LOG: "/api/v1/audit-logs/{eventId}";
        /** Audit log exports */
        readonly AUDIT_EXPORTS: "/api/v1/audit-logs/exports";
        /** Single audit export */
        readonly AUDIT_EXPORT: "/api/v1/audit-logs/exports/{exportId}";
        /** Download audit export */
        readonly AUDIT_EXPORT_DOWNLOAD: "/api/v1/audit-logs/exports/{exportId}/download";
        /** DSR list and create */
        readonly DATA_SUBJECT_REQUESTS: "/api/v1/compliance/data-subject-requests";
        /** Single DSR */
        readonly DATA_SUBJECT_REQUEST: "/api/v1/compliance/data-subject-requests/{requestId}";
        /** DSR status update */
        readonly DSR_STATUS: "/api/v1/compliance/data-subject-requests/{requestId}/status";
        /** DSR export download */
        readonly DSR_EXPORT_DOWNLOAD: "/api/v1/compliance/data-subject-requests/{requestId}/export";
        /** DSR statistics */
        readonly DSR_STATS: "/api/v1/compliance/data-subject-requests/stats";
        /** Legal holds list and create */
        readonly LEGAL_HOLDS: "/api/v1/compliance/legal-holds";
        /** Single legal hold */
        readonly LEGAL_HOLD: "/api/v1/compliance/legal-holds/{holdId}";
        /** Legal hold status update */
        readonly LEGAL_HOLD_STATUS: "/api/v1/compliance/legal-holds/{holdId}/status";
        /** Legal hold resources */
        readonly LEGAL_HOLD_RESOURCES: "/api/v1/compliance/legal-holds/{holdId}/resources";
        /** Legal hold custodians */
        readonly LEGAL_HOLD_CUSTODIANS: "/api/v1/compliance/legal-holds/{holdId}/custodians";
        /** Legal hold acknowledgments */
        readonly LEGAL_HOLD_ACKNOWLEDGMENTS: "/api/v1/compliance/legal-holds/{holdId}/acknowledgments";
        /** Legal hold statistics */
        readonly LEGAL_HOLD_STATS: "/api/v1/compliance/legal-holds/stats";
        /** Check if resource is under hold */
        readonly LEGAL_HOLD_CHECK: "/api/v1/compliance/legal-holds/check";
        /** Retention policies list and create */
        readonly RETENTION_POLICIES: "/api/v1/compliance/retention-policies";
        /** Single retention policy */
        readonly RETENTION_POLICY: "/api/v1/compliance/retention-policies/{policyId}";
        /** Retention policy status update */
        readonly RETENTION_POLICY_STATUS: "/api/v1/compliance/retention-policies/{policyId}/status";
        /** Retention policy executions */
        readonly RETENTION_EXECUTIONS: "/api/v1/compliance/retention-policies/{policyId}/executions";
        /** Single execution */
        readonly RETENTION_EXECUTION: "/api/v1/compliance/retention-policies/{policyId}/executions/{executionId}";
        /** Trigger policy execution */
        readonly RETENTION_EXECUTE: "/api/v1/compliance/retention-policies/{policyId}/execute";
        /** Retention policy statistics */
        readonly RETENTION_STATS: "/api/v1/compliance/retention-policies/stats";
        /** Incidents list and create */
        readonly INCIDENTS: "/api/v1/compliance/incidents";
        /** Single incident */
        readonly INCIDENT: "/api/v1/compliance/incidents/{incidentId}";
        /** Incident status update */
        readonly INCIDENT_STATUS: "/api/v1/compliance/incidents/{incidentId}/status";
        /** Incident updates/timeline */
        readonly INCIDENT_UPDATES: "/api/v1/compliance/incidents/{incidentId}/updates";
        /** Incident team members */
        readonly INCIDENT_TEAM: "/api/v1/compliance/incidents/{incidentId}/team";
        /** Incident affected resources */
        readonly INCIDENT_RESOURCES: "/api/v1/compliance/incidents/{incidentId}/resources";
        /** Incident attachments */
        readonly INCIDENT_ATTACHMENTS: "/api/v1/compliance/incidents/{incidentId}/attachments";
        /** Incident statistics */
        readonly INCIDENT_STATS: "/api/v1/compliance/incidents/stats";
        /** Compliance dashboard */
        readonly DASHBOARD: "/api/v1/compliance/dashboard";
        /** Compliance overview stats */
        readonly OVERVIEW: "/api/v1/compliance/overview";
    };
    readonly ERROR_MESSAGES: {
        readonly UNAUTHORIZED: "You are not authorized to access compliance features.";
        readonly FORBIDDEN: "You do not have permission to perform this compliance action.";
        readonly INSUFFICIENT_PERMISSIONS: "Insufficient permissions for this compliance operation.";
        readonly DSR_NOT_FOUND: "Data subject request not found.";
        readonly DSR_ALREADY_COMPLETED: "This data subject request has already been completed.";
        readonly DSR_ALREADY_CANCELLED: "This data subject request has already been cancelled.";
        readonly DSR_BLOCKED_BY_HOLD: "This request is blocked by an active legal hold.";
        readonly DSR_RATE_LIMITED: "Too many data subject requests. Please try again later.";
        readonly DSR_INVALID_STATUS_TRANSITION: "Invalid status transition for data subject request.";
        readonly DSR_VERIFICATION_REQUIRED: "Identity verification is required before processing.";
        readonly DSR_VERIFICATION_EXPIRED: "Identity verification has expired. Please verify again.";
        readonly DSR_EXPORT_NOT_READY: "Data export is not yet ready for download.";
        readonly DSR_EXPORT_EXPIRED: "Data export has expired. Please request a new export.";
        readonly DSR_EXTENSION_LIMIT_REACHED: "Maximum deadline extension limit has been reached.";
        readonly LEGAL_HOLD_NOT_FOUND: "Legal hold not found.";
        readonly LEGAL_HOLD_ALREADY_ACTIVE: "This legal hold is already active.";
        readonly LEGAL_HOLD_ALREADY_RELEASED: "This legal hold has already been released.";
        readonly LEGAL_HOLD_INVALID_STATUS: "Invalid status transition for legal hold.";
        readonly LEGAL_HOLD_LIMIT_REACHED: "Maximum number of active legal holds reached.";
        readonly LEGAL_HOLD_RESOURCE_ALREADY_HELD: "Resource is already under this legal hold.";
        readonly LEGAL_HOLD_CUSTODIAN_LIMIT: "Maximum number of custodians per hold reached.";
        readonly LEGAL_HOLD_DELETION_BLOCKED: "Deletion blocked by active legal hold.";
        readonly LEGAL_HOLD_ACK_REQUIRED: "Custodian acknowledgment is required.";
        readonly LEGAL_HOLD_SCOPE_EMPTY: "Legal hold scope cannot be empty.";
        readonly RETENTION_POLICY_NOT_FOUND: "Retention policy not found.";
        readonly RETENTION_POLICY_ALREADY_ACTIVE: "This retention policy is already active.";
        readonly RETENTION_POLICY_IN_USE: "Cannot delete policy that is currently in use.";
        readonly RETENTION_POLICY_INVALID_STATUS: "Invalid status transition for retention policy.";
        readonly RETENTION_POLICY_LIMIT_REACHED: "Maximum number of retention policies reached.";
        readonly RETENTION_EXECUTION_IN_PROGRESS: "A retention execution is already in progress.";
        readonly RETENTION_EXECUTION_NOT_FOUND: "Retention execution not found.";
        readonly RETENTION_BLOCKED_BY_HOLD: "Retention action blocked by active legal hold.";
        readonly RETENTION_INVALID_PERIOD: "Invalid retention period. Check minimum and maximum values.";
        readonly INCIDENT_NOT_FOUND: "Incident not found.";
        readonly INCIDENT_ALREADY_CLOSED: "This incident has already been closed.";
        readonly INCIDENT_INVALID_STATUS: "Invalid status transition for incident.";
        readonly INCIDENT_TEAM_LIMIT: "Maximum number of team members reached.";
        readonly INCIDENT_ATTACHMENT_LIMIT: "Maximum number of attachments reached.";
        readonly INCIDENT_ATTACHMENT_TOO_LARGE: "Attachment exceeds maximum file size.";
        readonly INCIDENT_UPDATE_NOT_FOUND: "Incident update not found.";
        readonly INCIDENT_NOTIFICATION_FAILED: "Failed to send incident notification.";
        readonly AUDIT_LOG_NOT_FOUND: "Audit log entry not found.";
        readonly AUDIT_EXPORT_NOT_FOUND: "Audit export not found.";
        readonly AUDIT_EXPORT_IN_PROGRESS: "Audit export is already in progress.";
        readonly AUDIT_EXPORT_FAILED: "Audit export failed. Please try again.";
        readonly AUDIT_EXPORT_EXPIRED: "Audit export has expired. Please request a new export.";
        readonly AUDIT_QUERY_TIMEOUT: "Query timed out. Please narrow your date range.";
        readonly AUDIT_RATE_LIMITED: "Too many audit log queries. Please wait before trying again.";
        readonly INVALID_DATE_RANGE: "Invalid date range. Start date must be before end date.";
        readonly DATE_RANGE_TOO_LARGE: "Date range exceeds maximum allowed span.";
        readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
        readonly INVALID_REQUEST: "Invalid request. Please check the provided data.";
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
        /** Default items per page for incidents */
        readonly INCIDENT_DEFAULT_LIMIT: 20;
        /** Default items per page for timeline events */
        readonly TIMELINE_DEFAULT_LIMIT: 50;
    };
};
//# sourceMappingURL=compliance.d.ts.map