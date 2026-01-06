"""Pydantic models for compliance-related tables.

This module contains models for the Audit & Compliance system:
- DataSubjectRequest: Tracks GDPR/CCPA/DPDP data subject rights requests
- LegalHold: Manages legal/regulatory holds to prevent data deletion
- LegalHoldResource: Junction table for resources under legal hold
- RetentionPolicy: Defines data retention rules and lifecycle management
- RetentionPolicyExecution: Tracks retention policy execution runs
- RetentionPolicyExemption: Manages resource exemptions from retention policies
- Incident: Tracks security and compliance incidents
- IncidentUpdate: Detailed timeline entries for incidents
- IncidentAffectedResource: Resources affected by incidents

These models support regulatory compliance (GDPR, CCPA, DPDP, SOC 2), data governance,
incident management, and legal hold enforcement.

Feature: Audit & Compliance System
Task: T005 - Create SQLAlchemy models for compliance entities
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# DATA SUBJECT REQUEST ENUMS
# =============================================================================


class DSRRequestType(str, Enum):
    """Types of data subject requests per GDPR/CCPA."""

    ACCESS = "access"  # Right to access (GDPR Art. 15)
    RECTIFICATION = "rectification"  # Right to rectification (GDPR Art. 16)
    ERASURE = "erasure"  # Right to erasure/be forgotten (GDPR Art. 17)
    PORTABILITY = "portability"  # Right to data portability (GDPR Art. 20)
    RESTRICTION = "restriction"  # Right to restrict processing (GDPR Art. 18)
    OBJECTION = "objection"  # Right to object (GDPR Art. 21)
    OPT_OUT_SALE = "opt_out_sale"  # CCPA opt-out of sale
    DISCLOSURE = "disclosure"  # CCPA right to know


class DSRStatus(str, Enum):
    """Status of a data subject request."""

    PENDING = "pending"  # Initial state, awaiting review
    IDENTITY_VERIFICATION = "identity_verification"  # Verifying requester identity
    ACKNOWLEDGED = "acknowledged"  # Request acknowledged, in queue
    IN_PROGRESS = "in_progress"  # Actively being processed
    AWAITING_APPROVAL = "awaiting_approval"  # Needs manager/legal approval
    BLOCKED = "blocked"  # Blocked by legal hold
    COMPLETED = "completed"  # Successfully completed
    PARTIALLY_COMPLETED = "partially_completed"  # Partially fulfilled
    REJECTED = "rejected"  # Rejected (invalid request, identity not verified)
    CANCELLED = "cancelled"  # Cancelled by requester
    EXPIRED = "expired"  # Deadline passed without completion


class DSRSource(str, Enum):
    """Source of a data subject request."""

    USER_PORTAL = "user_portal"  # Self-service user request
    EMAIL = "email"  # Email request
    API = "api"  # API-initiated request
    ADMIN = "admin"  # Admin-initiated on behalf of user
    LEGAL = "legal"  # Legal/regulatory initiated
    AUTOMATED = "automated"  # System automated (e.g., account deletion)


class DSRSubjectType(str, Enum):
    """Type of data subject."""

    USER = "user"  # Platform user
    CLIENT = "client"  # Client/customer
    VISITOR = "visitor"  # Anonymous visitor
    GUEST = "guest"  # Event guest
    EMPLOYEE = "employee"  # Internal employee
    OTHER = "other"  # Other data subject


class DSRPriority(str, Enum):
    """Priority of a data subject request."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class DSRVerificationStatus(str, Enum):
    """Status of identity verification for data subject request."""

    PENDING = "pending"  # Not yet verified
    IN_PROGRESS = "in_progress"  # Verification in progress
    VERIFIED = "verified"  # Identity confirmed
    FAILED = "failed"  # Verification failed
    WAIVED = "waived"  # Verification waived (e.g., logged-in user)


# =============================================================================
# LEGAL HOLD ENUMS
# =============================================================================


class LegalHoldType(str, Enum):
    """Types of legal holds."""

    LITIGATION = "litigation"  # Legal litigation/lawsuit
    REGULATORY = "regulatory"  # Regulatory investigation
    INTERNAL_AUDIT = "internal_audit"  # Internal audit/investigation
    COMPLIANCE = "compliance"  # Compliance requirement
    PRESERVATION = "preservation"  # General preservation request
    SUBPOENA = "subpoena"  # Subpoena/court order
    GOVERNMENT = "government"  # Government inquiry
    OTHER = "other"  # Other hold type


class LegalHoldStatus(str, Enum):
    """Status of a legal hold."""

    DRAFT = "draft"  # Hold being prepared, not yet active
    PENDING_APPROVAL = "pending_approval"  # Awaiting legal/management approval
    ACTIVE = "active"  # Currently enforced
    SUSPENDED = "suspended"  # Temporarily suspended
    RELEASED = "released"  # Hold has been released
    EXPIRED = "expired"  # Hold expired (effective_until passed)
    CANCELLED = "cancelled"  # Hold cancelled before activation


class LegalHoldPriority(str, Enum):
    """Priority of a legal hold."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class LegalHoldScopeType(str, Enum):
    """Type of legal hold scope."""

    WORKSPACE_WIDE = "workspace_wide"  # All resources in workspace
    USER_BASED = "user_based"  # All resources for specific users
    SELECTIVE = "selective"  # Specific resources/types only
    KEYWORD_BASED = "keyword_based"  # Resources matching keywords
    DATE_RANGE = "date_range"  # Resources within date range
    COMBINED = "combined"  # Multiple criteria combined


class LegalHoldCaptureMethod(str, Enum):
    """Method used to capture a resource under legal hold."""

    SCOPE_MATCH = "scope_match"  # Automatically matched by scope criteria
    MANUAL_ADD = "manual_add"  # Manually added by admin
    CUSTODIAN = "custodian"  # Captured as custodian resource
    KEYWORD_MATCH = "keyword_match"  # Matched by keyword search
    RELATED = "related"  # Related/linked resource


# =============================================================================
# RETENTION POLICY ENUMS
# =============================================================================


class RetentionPolicyType(str, Enum):
    """Types of retention policies."""

    SYSTEM = "system"  # System-wide default policy
    REGULATORY = "regulatory"  # Required by regulation
    INDUSTRY = "industry"  # Industry standard
    ORGANIZATIONAL = "organizational"  # Organization-wide policy
    WORKSPACE = "workspace"  # Workspace-specific policy
    CUSTOM = "custom"  # Custom user-defined policy


class RetentionPolicyStatus(str, Enum):
    """Status of a retention policy."""

    DRAFT = "draft"  # Policy being prepared
    PENDING_APPROVAL = "pending_approval"  # Awaiting approval
    ACTIVE = "active"  # Currently enforced
    PAUSED = "paused"  # Temporarily suspended
    RETIRED = "retired"  # No longer in use
    SUPERSEDED = "superseded"  # Replaced by newer version


class RetentionActionOnExpiry(str, Enum):
    """Action to take when retention period expires."""

    DELETE = "delete"  # Permanently delete
    ARCHIVE = "archive"  # Move to cold storage
    ANONYMIZE = "anonymize"  # Remove PII but keep aggregate data
    REVIEW = "review"  # Flag for manual review
    NOTIFY_ONLY = "notify_only"  # Only notify, no automated action


class RetentionArchiveStorageClass(str, Enum):
    """Storage class for archived data."""

    STANDARD = "standard"  # Standard storage
    INFREQUENT = "infrequent"  # Infrequent access tier
    COLD = "cold"  # Cold storage
    GLACIER = "glacier"  # Archive/glacier tier
    DEEP_ARCHIVE = "deep_archive"  # Deep archive tier


class RetentionExecutionFrequency(str, Enum):
    """Frequency of retention policy execution."""

    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    MANUAL = "manual"


class RetentionExecutionType(str, Enum):
    """Type of retention policy execution."""

    SCHEDULED = "scheduled"  # Automated scheduled run
    MANUAL = "manual"  # Manually triggered
    PREVIEW = "preview"  # Dry run/preview
    REMEDIATION = "remediation"  # Fix/cleanup run


class RetentionExecutionStatus(str, Enum):
    """Status of a retention policy execution."""

    PENDING = "pending"  # Waiting to start
    RUNNING = "running"  # Currently executing
    COMPLETED = "completed"  # Finished successfully
    COMPLETED_WITH_ERRORS = "completed_with_errors"  # Finished with some errors
    FAILED = "failed"  # Failed to complete
    CANCELLED = "cancelled"  # Cancelled by user


class RetentionExemptionReason(str, Enum):
    """Reason for retention policy exemption."""

    LEGAL_HOLD = "legal_hold"  # Under legal hold
    LITIGATION = "litigation"  # Involved in litigation
    REGULATORY = "regulatory"  # Regulatory requirement
    BUSINESS_CRITICAL = "business_critical"  # Critical business data
    USER_REQUEST = "user_request"  # User requested extension
    ADMIN_OVERRIDE = "admin_override"  # Admin override
    SYSTEM = "system"  # System-protected resource
    OTHER = "other"  # Other reason


class RetentionExemptionType(str, Enum):
    """Type of retention policy exemption."""

    PERMANENT = "permanent"  # Never expires
    TEMPORARY = "temporary"  # Expires at specified time
    UNTIL_REVIEW = "until_review"  # Until manual review


class RetentionExemptionStatus(str, Enum):
    """Status of a retention policy exemption."""

    PENDING = "pending"  # Awaiting approval
    ACTIVE = "active"  # Currently enforced
    EXPIRED = "expired"  # Exemption expired
    REVOKED = "revoked"  # Manually revoked
    SUPERSEDED = "superseded"  # Replaced by another exemption


# =============================================================================
# INCIDENT ENUMS
# =============================================================================


class IncidentType(str, Enum):
    """Types of security/compliance incidents."""

    DATA_BREACH = "data_breach"  # Unauthorized access to personal data
    SECURITY_BREACH = "security_breach"  # Security system compromise
    UNAUTHORIZED_ACCESS = "unauthorized_access"  # Unauthorized system/data access
    MALWARE = "malware"  # Malware/ransomware infection
    PHISHING = "phishing"  # Phishing attack
    DDOS = "ddos"  # Denial of service attack
    DATA_LOSS = "data_loss"  # Accidental data loss
    DATA_CORRUPTION = "data_corruption"  # Data integrity issue
    SYSTEM_FAILURE = "system_failure"  # Critical system failure
    POLICY_VIOLATION = "policy_violation"  # Internal policy violation
    COMPLIANCE_FAILURE = "compliance_failure"  # Regulatory compliance failure
    THIRD_PARTY = "third_party"  # Third-party/vendor incident
    INSIDER_THREAT = "insider_threat"  # Insider threat incident
    PHYSICAL_SECURITY = "physical_security"  # Physical security incident
    SOCIAL_ENGINEERING = "social_engineering"  # Social engineering attack
    MISCONFIGURATION = "misconfiguration"  # Security misconfiguration
    VULNERABILITY = "vulnerability"  # Exploited vulnerability
    OTHER = "other"  # Other incident type


class IncidentCategory(str, Enum):
    """Categories of incidents."""

    SECURITY = "security"  # Security-related incident
    PRIVACY = "privacy"  # Privacy/data protection incident
    COMPLIANCE = "compliance"  # Compliance violation
    OPERATIONAL = "operational"  # Operational incident
    LEGAL = "legal"  # Legal/regulatory incident
    REPUTATIONAL = "reputational"  # Reputational impact incident
    FINANCIAL = "financial"  # Financial impact incident


class IncidentSeverity(str, Enum):
    """Severity levels for incidents."""

    CRITICAL = "critical"  # Critical: immediate action required
    HIGH = "high"  # High: urgent attention needed
    MEDIUM = "medium"  # Medium: standard response
    LOW = "low"  # Low: can be scheduled
    INFORMATIONAL = "informational"  # Informational: no immediate action


class IncidentImpact(str, Enum):
    """Impact levels for incidents."""

    CRITICAL = "critical"  # Critical: major business impact
    HIGH = "high"  # High: significant impact
    MEDIUM = "medium"  # Medium: moderate impact
    LOW = "low"  # Low: minimal impact
    NONE = "none"  # None: no measurable impact


class IncidentUrgency(str, Enum):
    """Urgency levels for incidents."""

    CRITICAL = "critical"  # Immediate action required
    HIGH = "high"  # Action needed within hours
    MEDIUM = "medium"  # Action needed within days
    LOW = "low"  # Action can be scheduled
    PLANNED = "planned"  # Planned/scheduled response


class IncidentPriority(str, Enum):
    """Priority levels for incidents."""

    CRITICAL = "critical"  # P1: Drop everything
    HIGH = "high"  # P2: High priority
    MEDIUM = "medium"  # P3: Normal priority
    LOW = "low"  # P4: Low priority
    DEFERRED = "deferred"  # P5: Deferred/backlog


class IncidentStatus(str, Enum):
    """Status of an incident."""

    DETECTED = "detected"  # Initial detection
    CONFIRMED = "confirmed"  # Incident confirmed
    INVESTIGATING = "investigating"  # Under investigation
    CONTAINING = "containing"  # Containment in progress
    CONTAINED = "contained"  # Containment complete
    ERADICATING = "eradicating"  # Eradication in progress
    ERADICATED = "eradicated"  # Threat removed
    RECOVERING = "recovering"  # Recovery in progress
    RECOVERED = "recovered"  # Systems restored
    RESOLVED = "resolved"  # Incident resolved
    CLOSED = "closed"  # Incident closed
    POST_INCIDENT_REVIEW = "post_incident_review"  # PIR in progress
    FALSE_POSITIVE = "false_positive"  # Determined to be false positive
    DUPLICATE = "duplicate"  # Duplicate of another incident
    ESCALATED = "escalated"  # Escalated to higher authority


class IncidentDetectionMethod(str, Enum):
    """Methods of incident detection."""

    MANUAL = "manual"  # Manually reported
    AUTOMATED = "automated"  # Automated detection system
    MONITORING = "monitoring"  # Monitoring/alerting system
    AUDIT = "audit"  # Discovered during audit
    USER_REPORT = "user_report"  # User reported
    THIRD_PARTY = "third_party"  # Third party notification
    LAW_ENFORCEMENT = "law_enforcement"  # Law enforcement notification
    PENETRATION_TEST = "penetration_test"  # Discovered during pen test
    VULNERABILITY_SCAN = "vulnerability_scan"  # Discovered during vuln scan
    LOG_ANALYSIS = "log_analysis"  # Log analysis
    ANOMALY_DETECTION = "anomaly_detection"  # Anomaly detection system
    EXTERNAL_REPORT = "external_report"  # External security researcher


class IncidentBreachType(str, Enum):
    """Types of data breach per GDPR classification."""

    CONFIDENTIALITY = "confidentiality"  # Unauthorized disclosure
    INTEGRITY = "integrity"  # Unauthorized alteration
    AVAILABILITY = "availability"  # Loss of access/availability
    COMBINED = "combined"  # Multiple breach types


class IncidentRootCauseCategory(str, Enum):
    """Categories of incident root causes."""

    HUMAN_ERROR = "human_error"  # Human mistake
    PROCESS_FAILURE = "process_failure"  # Process/procedure failure
    TECHNICAL_FAILURE = "technical_failure"  # Technical/system failure
    MALICIOUS_ACTIVITY = "malicious_activity"  # Intentional malicious action
    EXTERNAL_FACTOR = "external_factor"  # External factor (vendor, etc.)
    CONFIGURATION_ERROR = "configuration_error"  # Misconfiguration
    DESIGN_FLAW = "design_flaw"  # Design/architecture flaw
    UNKNOWN = "unknown"  # Unknown/undetermined


class IncidentThreatActorType(str, Enum):
    """Types of threat actors."""

    EXTERNAL_HACKER = "external_hacker"  # External malicious actor
    ORGANIZED_CRIME = "organized_crime"  # Organized crime group
    NATION_STATE = "nation_state"  # Nation-state actor
    INSIDER_MALICIOUS = "insider_malicious"  # Malicious insider
    INSIDER_NEGLIGENT = "insider_negligent"  # Negligent insider
    COMPETITOR = "competitor"  # Business competitor
    HACKTIVIST = "hacktivist"  # Hacktivist group
    SCRIPT_KIDDIE = "script_kiddie"  # Unskilled attacker
    UNKNOWN = "unknown"  # Unknown threat actor
    NOT_APPLICABLE = "not_applicable"  # No threat actor (e.g., accident)


class IncidentResolutionType(str, Enum):
    """Types of incident resolution."""

    REMEDIATED = "remediated"  # Issue fully remediated
    MITIGATED = "mitigated"  # Risk mitigated but not eliminated
    ACCEPTED = "accepted"  # Risk accepted
    TRANSFERRED = "transferred"  # Risk transferred (insurance, etc.)
    FALSE_POSITIVE = "false_positive"  # Not a real incident
    NO_ACTION_REQUIRED = "no_action_required"  # No action required
    ESCALATED = "escalated"  # Escalated to external authority


class IncidentUpdateType(str, Enum):
    """Types of incident updates."""

    STATUS_CHANGE = "status_change"  # Status transition
    INVESTIGATION = "investigation"  # Investigation update
    CONTAINMENT = "containment"  # Containment action
    ERADICATION = "eradication"  # Eradication action
    RECOVERY = "recovery"  # Recovery action
    COMMUNICATION = "communication"  # External/internal communication
    EVIDENCE = "evidence"  # Evidence collection
    ESCALATION = "escalation"  # Escalation notice
    ASSIGNMENT = "assignment"  # Assignment change
    SEVERITY_CHANGE = "severity_change"  # Severity adjustment
    NOTIFICATION = "notification"  # Regulatory notification
    GENERAL = "general"  # General update
    RESOLUTION = "resolution"  # Resolution details
    POST_INCIDENT = "post_incident"  # Post-incident review


class IncidentUpdateVisibility(str, Enum):
    """Visibility levels for incident updates."""

    INTERNAL = "internal"  # Internal team only
    MANAGEMENT = "management"  # Management visibility
    ORGANIZATION = "organization"  # Organization-wide
    EXTERNAL = "external"  # External stakeholders
    PUBLIC = "public"  # Public disclosure


class IncidentResourceImpactType(str, Enum):
    """Types of resource impact in incidents."""

    COMPROMISED = "compromised"  # Fully compromised
    AFFECTED = "affected"  # Affected but not compromised
    AT_RISK = "at_risk"  # At risk but not confirmed affected
    INVESTIGATED = "investigated"  # Under investigation
    CLEARED = "cleared"  # Investigated and cleared


class IncidentDataClassification(str, Enum):
    """Data classification levels for affected resources."""

    PUBLIC = "public"  # Public data
    INTERNAL = "internal"  # Internal use only
    CONFIDENTIAL = "confidential"  # Confidential
    RESTRICTED = "restricted"  # Restricted/sensitive
    PII = "pii"  # Personal identifiable information
    PHI = "phi"  # Protected health information
    PCI = "pci"  # Payment card data
    SECRET = "secret"  # Top secret/highly restricted


class IncidentRemediationStatus(str, Enum):
    """Status of resource remediation in incidents."""

    PENDING = "pending"  # Awaiting remediation
    IN_PROGRESS = "in_progress"  # Remediation in progress
    COMPLETED = "completed"  # Remediation complete
    NOT_REQUIRED = "not_required"  # No remediation required
    BLOCKED = "blocked"  # Remediation blocked


# =============================================================================
# DATA SUBJECT REQUEST MODEL
# =============================================================================


class DataSubjectRequest(BaseModel):
    """Model for tracking data subject rights requests (GDPR/CCPA/DPDP).

    Supports:
    - Access requests (GDPR Art. 15) - Right to access personal data
    - Rectification requests (GDPR Art. 16) - Right to correct data
    - Erasure requests (GDPR Art. 17) - Right to be forgotten
    - Portability requests (GDPR Art. 20) - Right to data portability
    - Restriction requests (GDPR Art. 18) - Right to restrict processing
    - Objection requests (GDPR Art. 21) - Right to object to processing

    Regulatory deadlines: 30 days for GDPR, 45 days for CCPA.
    """

    request_id: UUID

    # Multi-tenant isolation
    workspace_id: UUID

    # Request identification
    request_number: str = Field(..., max_length=50, description="Human-readable request ID (e.g., DSR-2026-00001)")

    # Data subject information
    subject_user_id: Optional[UUID] = Field(None, description="User ID if subject is a platform user")
    subject_email: str = Field(..., max_length=255, description="Email address of the data subject")
    subject_name: Optional[str] = Field(None, max_length=255, description="Name of the data subject")
    subject_type: DSRSubjectType = Field(DSRSubjectType.USER, description="Type of data subject")

    # Request details
    request_type: DSRRequestType = Field(..., description="Type of data subject request")
    request_source: DSRSource = Field(DSRSource.USER_PORTAL, description="Source of the request")
    description: Optional[str] = Field(None, description="Description or additional details")

    # Status tracking
    status: DSRStatus = Field(DSRStatus.PENDING, description="Current status of the request")
    status_reason: Optional[str] = Field(None, description="Reason for current status")

    # Priority
    priority: DSRPriority = Field(DSRPriority.NORMAL, description="Priority level")

    # Assignment
    assigned_to_user_id: Optional[UUID] = Field(None, description="User assigned to handle the request")

    # Regulatory deadline tracking
    submitted_at: datetime = Field(..., description="When the request was submitted")
    deadline_at: datetime = Field(..., description="Regulatory deadline for completion")
    extended_deadline_at: Optional[datetime] = Field(None, description="Extended deadline if granted")
    extension_reason: Optional[str] = Field(None, description="Reason for deadline extension")

    # Processing timestamps
    acknowledged_at: Optional[datetime] = Field(None, description="When request was acknowledged")
    processing_started_at: Optional[datetime] = Field(None, description="When processing started")
    completed_at: Optional[datetime] = Field(None, description="When request was completed")

    # Identity verification
    verification_status: DSRVerificationStatus = Field(
        DSRVerificationStatus.PENDING,
        description="Status of identity verification"
    )
    verification_method: Optional[str] = Field(None, max_length=30, description="Method used for verification")
    verified_at: Optional[datetime] = Field(None, description="When identity was verified")
    verified_by_user_id: Optional[UUID] = Field(None, description="User who verified identity")

    # Export/deletion job tracking
    export_job_id: Optional[UUID] = Field(None, description="Background job ID for export")
    export_storage_key: Optional[str] = Field(None, max_length=500, description="Storage location of export")
    export_expires_at: Optional[datetime] = Field(None, description="When export download expires")
    export_download_count: int = Field(0, description="Number of times export was downloaded")

    # Legal hold blocking
    blocked_by_legal_hold_id: Optional[UUID] = Field(None, description="Legal hold blocking this request")
    blocked_at: Optional[datetime] = Field(None, description="When request was blocked")
    blocked_reason: Optional[str] = Field(None, description="Reason for blocking")

    # Scope specification
    scope: dict[str, Any] = Field(
        default_factory=dict,
        description="Which data to include: {categories: [...], date_range: {...}}"
    )

    # Processing notes and audit trail
    internal_notes: Optional[str] = Field(None, description="Internal notes for processing")
    status_history: list[dict[str, Any]] = Field(
        default_factory=list,
        description="History of status changes"
    )

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Request context
    requester_ip_address: Optional[str] = Field(None, max_length=45, description="IP address of requester")
    requester_user_agent: Optional[str] = Field(None, description="User agent of requester")

    # Timestamps
    created_at: datetime
    updated_at: datetime


class DataSubjectRequestCreate(BaseModel):
    """Model for creating a new data subject request."""

    workspace_id: UUID
    subject_email: str = Field(..., max_length=255)
    subject_name: Optional[str] = Field(None, max_length=255)
    subject_user_id: Optional[UUID] = None
    subject_type: DSRSubjectType = DSRSubjectType.USER
    request_type: DSRRequestType
    request_source: DSRSource = DSRSource.USER_PORTAL
    description: Optional[str] = None
    priority: DSRPriority = DSRPriority.NORMAL
    scope: dict[str, Any] = Field(default_factory=dict)
    requester_ip_address: Optional[str] = None
    requester_user_agent: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DataSubjectRequestUpdate(BaseModel):
    """Model for updating a data subject request."""

    status: Optional[DSRStatus] = None
    status_reason: Optional[str] = None
    priority: Optional[DSRPriority] = None
    assigned_to_user_id: Optional[UUID] = None
    extended_deadline_at: Optional[datetime] = None
    extension_reason: Optional[str] = None
    verification_status: Optional[DSRVerificationStatus] = None
    verification_method: Optional[str] = None
    internal_notes: Optional[str] = None
    scope: Optional[dict[str, Any]] = None
    metadata: Optional[dict[str, Any]] = None


class DataSubjectRequestSummary(BaseModel):
    """Lightweight data subject request summary for API responses."""

    request_id: UUID
    workspace_id: UUID
    request_number: str
    subject_email: str
    request_type: DSRRequestType
    status: DSRStatus
    priority: DSRPriority
    submitted_at: datetime
    deadline_at: datetime
    days_until_deadline: int = Field(..., description="Days remaining until deadline")


# =============================================================================
# LEGAL HOLD MODEL
# =============================================================================


class LegalHold(BaseModel):
    """Model for managing legal and regulatory holds.

    Prevents deletion of data under legal hold for:
    - Litigation holds
    - Regulatory investigations
    - Internal audits
    - Compliance requirements
    - Subpoenas and court orders

    Integrates with data subject requests to block erasure when holds apply.
    """

    hold_id: UUID

    # Multi-tenant isolation
    workspace_id: UUID

    # Hold identification
    hold_number: str = Field(..., max_length=50, description="Human-readable hold ID (e.g., LH-2026-00001)")
    name: str = Field(..., max_length=255, description="Name/title of the legal hold")
    description: Optional[str] = Field(None, description="Detailed description of the hold")

    # Hold classification
    hold_type: LegalHoldType = Field(LegalHoldType.LITIGATION, description="Type of legal hold")
    matter_id: Optional[str] = Field(None, max_length=100, description="External legal matter ID")
    matter_name: Optional[str] = Field(None, max_length=255, description="Name of the legal matter")

    # Status tracking
    status: LegalHoldStatus = Field(LegalHoldStatus.ACTIVE, description="Current status")
    status_reason: Optional[str] = Field(None, description="Reason for current status")

    # Priority
    priority: LegalHoldPriority = Field(LegalHoldPriority.NORMAL, description="Priority level")

    # Legal/external references
    external_reference: Optional[str] = Field(None, max_length=255, description="External reference number")
    legal_counsel: Optional[str] = Field(None, max_length=255, description="Legal counsel name")
    law_firm: Optional[str] = Field(None, max_length=255, description="Law firm name")

    # Hold scope definition
    scope_type: LegalHoldScopeType = Field(LegalHoldScopeType.SELECTIVE, description="How scope is determined")

    # Scope filters
    scope_users: list[str] = Field(default_factory=list, description="User IDs covered by hold")
    scope_resources: list[dict[str, Any]] = Field(default_factory=list, description="Specific resources under hold")
    scope_resource_types: list[str] = Field(default_factory=list, description="Resource types covered")
    scope_date_range: Optional[dict[str, Any]] = Field(None, description="Date range filter")
    scope_keywords: list[str] = Field(default_factory=list, description="Keywords for matching")

    # Custodian management
    custodians: list[dict[str, Any]] = Field(default_factory=list, description="Custodian information")
    custodian_acknowledgments: list[dict[str, Any]] = Field(default_factory=list, description="Acknowledgment records")

    # Hold dates
    issued_at: datetime = Field(..., description="When hold was issued")
    effective_from: datetime = Field(..., description="When hold takes effect")
    effective_until: Optional[datetime] = Field(None, description="When hold expires (if set)")
    released_at: Optional[datetime] = Field(None, description="When hold was released")

    # Issuer information
    issued_by_user_id: UUID = Field(..., description="User who issued the hold")
    released_by_user_id: Optional[UUID] = Field(None, description="User who released the hold")
    release_reason: Optional[str] = Field(None, description="Reason for releasing hold")

    # Notifications
    notification_sent_at: Optional[datetime] = Field(None, description="When notifications were sent")
    reminder_frequency_days: Optional[int] = Field(None, description="Days between reminders")
    last_reminder_sent_at: Optional[datetime] = Field(None, description="When last reminder was sent")
    next_reminder_at: Optional[datetime] = Field(None, description="When next reminder is due")

    # Statistics
    affected_users_count: int = Field(0, description="Number of users affected")
    affected_resources_count: int = Field(0, description="Number of resources under hold")
    blocked_deletions_count: int = Field(0, description="Number of blocked deletions")
    blocked_requests_count: int = Field(0, description="Number of blocked DSRs")

    # Internal notes and audit trail
    internal_notes: Optional[str] = Field(None, description="Internal notes")
    status_history: list[dict[str, Any]] = Field(default_factory=list, description="History of status changes")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Timestamps
    created_at: datetime
    updated_at: datetime


class LegalHoldCreate(BaseModel):
    """Model for creating a new legal hold."""

    workspace_id: UUID
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    hold_type: LegalHoldType = LegalHoldType.LITIGATION
    matter_id: Optional[str] = None
    matter_name: Optional[str] = None
    priority: LegalHoldPriority = LegalHoldPriority.NORMAL
    external_reference: Optional[str] = None
    legal_counsel: Optional[str] = None
    law_firm: Optional[str] = None
    scope_type: LegalHoldScopeType = LegalHoldScopeType.SELECTIVE
    scope_users: list[str] = Field(default_factory=list)
    scope_resources: list[dict[str, Any]] = Field(default_factory=list)
    scope_resource_types: list[str] = Field(default_factory=list)
    scope_date_range: Optional[dict[str, Any]] = None
    scope_keywords: list[str] = Field(default_factory=list)
    custodians: list[dict[str, Any]] = Field(default_factory=list)
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    reminder_frequency_days: Optional[int] = None
    issued_by_user_id: UUID
    metadata: dict[str, Any] = Field(default_factory=dict)


class LegalHoldUpdate(BaseModel):
    """Model for updating a legal hold."""

    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[LegalHoldStatus] = None
    status_reason: Optional[str] = None
    priority: Optional[LegalHoldPriority] = None
    scope_users: Optional[list[str]] = None
    scope_resources: Optional[list[dict[str, Any]]] = None
    scope_resource_types: Optional[list[str]] = None
    scope_date_range: Optional[dict[str, Any]] = None
    scope_keywords: Optional[list[str]] = None
    custodians: Optional[list[dict[str, Any]]] = None
    effective_until: Optional[datetime] = None
    reminder_frequency_days: Optional[int] = None
    internal_notes: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class LegalHoldSummary(BaseModel):
    """Lightweight legal hold summary for API responses."""

    hold_id: UUID
    workspace_id: UUID
    hold_number: str
    name: str
    hold_type: LegalHoldType
    status: LegalHoldStatus
    priority: LegalHoldPriority
    effective_from: datetime
    effective_until: Optional[datetime] = None
    affected_resources_count: int = 0


class LegalHoldResource(BaseModel):
    """Model for tracking resources under legal hold."""

    id: UUID

    # References
    hold_id: UUID
    workspace_id: UUID

    # Resource identification
    resource_type: str = Field(..., max_length=50, description="Type of resource (asset, gallery, etc.)")
    resource_id: UUID = Field(..., description="ID of the resource")

    # User association
    user_id: Optional[UUID] = Field(None, description="User associated with the resource")

    # Capture method
    capture_method: LegalHoldCaptureMethod = Field(
        LegalHoldCaptureMethod.SCOPE_MATCH,
        description="How the resource was captured"
    )

    # Tracking
    added_at: datetime = Field(..., description="When resource was added to hold")
    added_by_user_id: Optional[UUID] = Field(None, description="User who added the resource")

    # Deletion attempts
    deletion_attempts: int = Field(0, description="Number of blocked deletion attempts")
    last_deletion_attempt_at: Optional[datetime] = Field(None, description="Last deletion attempt")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


# =============================================================================
# RETENTION POLICY MODEL
# =============================================================================


class RetentionPolicy(BaseModel):
    """Model for data retention policies.

    Defines how long different data types are retained and what happens
    when the retention period expires. Supports:
    - Regulatory requirements (GDPR, CCPA, industry-specific)
    - Tiered retention (active -> archive -> delete)
    - Automated enforcement with grace periods
    - Policy versioning and audit trail
    """

    policy_id: UUID

    # Multi-tenant isolation
    workspace_id: UUID

    # Policy identification
    policy_name: str = Field(..., max_length=100, description="Display name for the policy")
    policy_code: str = Field(..., max_length=50, description="Machine-readable code (e.g., GDPR-MIN-7Y)")
    description: Optional[str] = Field(None, description="Detailed description")

    # Policy classification
    policy_type: RetentionPolicyType = Field(RetentionPolicyType.CUSTOM, description="Type of policy")

    # Status
    status: RetentionPolicyStatus = Field(RetentionPolicyStatus.DRAFT, description="Current status")
    status_reason: Optional[str] = Field(None, description="Reason for current status")

    # Priority (for conflict resolution)
    priority: int = Field(100, ge=0, le=1000, description="Priority (higher = more important)")

    # Resource targeting
    resource_types: list[str] = Field(default_factory=list, description="Resource types this policy applies to")
    resource_filters: dict[str, Any] = Field(default_factory=dict, description="Additional filters")

    # Retention periods (in days, 0 = indefinite)
    retention_period_days: int = Field(..., ge=0, description="Minimum days to retain")
    archive_after_days: Optional[int] = Field(None, ge=0, description="Days until archival")
    delete_after_days: Optional[int] = Field(None, ge=0, description="Days until deletion")

    # Grace period
    grace_period_days: int = Field(30, ge=0, description="Days before permanent deletion")

    # Actions
    action_on_expiry: RetentionActionOnExpiry = Field(
        RetentionActionOnExpiry.DELETE,
        description="Action when retention expires"
    )
    archive_storage_class: Optional[RetentionArchiveStorageClass] = Field(
        None,
        description="Storage class for archived data"
    )
    notification_days_before: list[int] = Field(
        default_factory=lambda: [30, 7, 1],
        description="Days before expiry to notify"
    )

    # Regulatory compliance
    regulatory_basis: Optional[str] = Field(None, max_length=50, description="Regulatory basis")
    regulatory_reference: Optional[str] = Field(None, description="Regulatory reference text")
    compliance_frameworks: list[str] = Field(default_factory=list, description="Compliance frameworks")

    # Exceptions and overrides
    allow_user_extension: bool = Field(False, description="Allow users to request extension")
    max_extension_days: Optional[int] = Field(None, description="Maximum extension allowed")
    allow_legal_hold_override: bool = Field(True, description="Legal holds override this policy")

    # Scope limitations
    applies_to_existing: bool = Field(True, description="Applies to existing resources")
    applies_to_new: bool = Field(True, description="Applies to new resources")
    effective_from: Optional[datetime] = Field(None, description="When policy takes effect")
    effective_until: Optional[datetime] = Field(None, description="When policy expires")

    # Policy owner
    created_by_user_id: UUID = Field(..., description="User who created the policy")
    approved_by_user_id: Optional[UUID] = Field(None, description="User who approved the policy")
    approved_at: Optional[datetime] = Field(None, description="When policy was approved")

    # Version tracking
    version: int = Field(1, description="Policy version number")
    previous_version_id: Optional[UUID] = Field(None, description="Previous version of this policy")
    is_active_version: bool = Field(True, description="Is this the active version")

    # Execution tracking
    last_executed_at: Optional[datetime] = Field(None, description="When policy was last executed")
    next_execution_at: Optional[datetime] = Field(None, description="When next execution is scheduled")
    execution_frequency: RetentionExecutionFrequency = Field(
        RetentionExecutionFrequency.DAILY,
        description="How often policy runs"
    )

    # Statistics
    total_resources_affected: int = Field(0, description="Total resources affected")
    total_resources_archived: int = Field(0, description="Total resources archived")
    total_resources_deleted: int = Field(0, description="Total resources deleted")
    total_storage_reclaimed_bytes: int = Field(0, description="Storage reclaimed in bytes")

    # Internal notes and audit trail
    internal_notes: Optional[str] = Field(None, description="Internal notes")
    change_history: list[dict[str, Any]] = Field(default_factory=list, description="History of changes")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Timestamps
    created_at: datetime
    updated_at: datetime


class RetentionPolicyCreate(BaseModel):
    """Model for creating a new retention policy."""

    workspace_id: UUID
    policy_name: str = Field(..., max_length=100)
    policy_code: str = Field(..., max_length=50)
    description: Optional[str] = None
    policy_type: RetentionPolicyType = RetentionPolicyType.CUSTOM
    priority: int = Field(100, ge=0, le=1000)
    resource_types: list[str] = Field(default_factory=list)
    resource_filters: dict[str, Any] = Field(default_factory=dict)
    retention_period_days: int = Field(..., ge=0)
    archive_after_days: Optional[int] = None
    delete_after_days: Optional[int] = None
    grace_period_days: int = 30
    action_on_expiry: RetentionActionOnExpiry = RetentionActionOnExpiry.DELETE
    archive_storage_class: Optional[RetentionArchiveStorageClass] = None
    notification_days_before: list[int] = Field(default_factory=lambda: [30, 7, 1])
    regulatory_basis: Optional[str] = None
    regulatory_reference: Optional[str] = None
    compliance_frameworks: list[str] = Field(default_factory=list)
    allow_user_extension: bool = False
    max_extension_days: Optional[int] = None
    allow_legal_hold_override: bool = True
    applies_to_existing: bool = True
    applies_to_new: bool = True
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    execution_frequency: RetentionExecutionFrequency = RetentionExecutionFrequency.DAILY
    created_by_user_id: UUID
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetentionPolicyUpdate(BaseModel):
    """Model for updating a retention policy."""

    policy_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[RetentionPolicyStatus] = None
    status_reason: Optional[str] = None
    priority: Optional[int] = None
    resource_types: Optional[list[str]] = None
    resource_filters: Optional[dict[str, Any]] = None
    retention_period_days: Optional[int] = None
    archive_after_days: Optional[int] = None
    delete_after_days: Optional[int] = None
    grace_period_days: Optional[int] = None
    action_on_expiry: Optional[RetentionActionOnExpiry] = None
    archive_storage_class: Optional[RetentionArchiveStorageClass] = None
    notification_days_before: Optional[list[int]] = None
    allow_user_extension: Optional[bool] = None
    max_extension_days: Optional[int] = None
    allow_legal_hold_override: Optional[bool] = None
    applies_to_existing: Optional[bool] = None
    applies_to_new: Optional[bool] = None
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    execution_frequency: Optional[RetentionExecutionFrequency] = None
    internal_notes: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class RetentionPolicySummary(BaseModel):
    """Lightweight retention policy summary for API responses."""

    policy_id: UUID
    workspace_id: UUID
    policy_name: str
    policy_code: str
    policy_type: RetentionPolicyType
    status: RetentionPolicyStatus
    retention_period_days: int
    action_on_expiry: RetentionActionOnExpiry
    is_active_version: bool = True


class RetentionPolicyExecution(BaseModel):
    """Model for tracking retention policy execution runs."""

    execution_id: UUID

    # References
    policy_id: UUID
    workspace_id: UUID

    # Execution details
    execution_type: RetentionExecutionType = Field(
        RetentionExecutionType.SCHEDULED,
        description="Type of execution"
    )
    status: RetentionExecutionStatus = Field(
        RetentionExecutionStatus.PENDING,
        description="Current status"
    )

    # Timing
    started_at: Optional[datetime] = Field(None, description="When execution started")
    completed_at: Optional[datetime] = Field(None, description="When execution completed")
    duration_ms: Optional[int] = Field(None, description="Duration in milliseconds")

    # Initiated by
    initiated_by_user_id: Optional[UUID] = Field(None, description="User who initiated (null for scheduled)")

    # Results
    resources_scanned: int = Field(0, description="Resources scanned")
    resources_matched: int = Field(0, description="Resources matching policy")
    resources_archived: int = Field(0, description="Resources archived")
    resources_deleted: int = Field(0, description="Resources deleted")
    resources_anonymized: int = Field(0, description="Resources anonymized")
    resources_flagged: int = Field(0, description="Resources flagged for review")
    resources_skipped: int = Field(0, description="Resources skipped")
    resources_failed: int = Field(0, description="Resources that failed")

    # Storage metrics
    storage_scanned_bytes: int = Field(0, description="Storage scanned in bytes")
    storage_reclaimed_bytes: int = Field(0, description="Storage reclaimed in bytes")

    # Errors and warnings
    error_count: int = Field(0, description="Number of errors")
    warning_count: int = Field(0, description="Number of warnings")
    errors: list[dict[str, Any]] = Field(default_factory=list, description="Error details")
    warnings: list[dict[str, Any]] = Field(default_factory=list, description="Warning details")

    # Affected resources
    affected_resources: list[dict[str, Any]] = Field(default_factory=list, description="Resources affected")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Timestamps
    created_at: datetime


class RetentionPolicyExemption(BaseModel):
    """Model for tracking resource exemptions from retention policies."""

    exemption_id: UUID

    # References
    policy_id: UUID
    workspace_id: UUID

    # Resource identification
    resource_type: str = Field(..., max_length=50, description="Type of resource")
    resource_id: UUID = Field(..., description="ID of the resource")

    # Exemption details
    exemption_reason: RetentionExemptionReason = Field(..., description="Reason for exemption")
    reason_details: Optional[str] = Field(None, description="Detailed reason")

    # Validity
    exemption_type: RetentionExemptionType = Field(
        RetentionExemptionType.PERMANENT,
        description="Type of exemption"
    )
    expires_at: Optional[datetime] = Field(None, description="When exemption expires")

    # User context
    created_by_user_id: UUID = Field(..., description="User who created exemption")
    approved_by_user_id: Optional[UUID] = Field(None, description="User who approved")
    approved_at: Optional[datetime] = Field(None, description="When approved")

    # Status
    status: RetentionExemptionStatus = Field(RetentionExemptionStatus.ACTIVE, description="Current status")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Timestamps
    created_at: datetime
    updated_at: datetime


# =============================================================================
# INCIDENT MODEL
# =============================================================================


class Incident(BaseModel):
    """Model for tracking security and compliance incidents.

    Supports full incident lifecycle management including:
    - Detection and classification
    - Investigation and containment
    - Eradication and recovery
    - Post-incident review
    - GDPR 72-hour notification tracking
    - Evidence preservation and legal hold integration
    """

    incident_id: UUID

    # Multi-tenant isolation
    workspace_id: UUID

    # Incident identification
    incident_number: str = Field(..., max_length=50, description="Human-readable ID (e.g., INC-2026-00001)")
    title: str = Field(..., max_length=255, description="Incident title")
    description: str = Field(..., description="Detailed description")

    # Incident classification
    incident_type: IncidentType = Field(..., description="Type of incident")
    category: IncidentCategory = Field(IncidentCategory.SECURITY, description="Category of incident")

    # Severity and impact
    severity: IncidentSeverity = Field(IncidentSeverity.MEDIUM, description="Incident severity")
    impact: IncidentImpact = Field(IncidentImpact.MEDIUM, description="Business impact")
    urgency: IncidentUrgency = Field(IncidentUrgency.MEDIUM, description="Response urgency")
    priority: IncidentPriority = Field(IncidentPriority.MEDIUM, description="Calculated priority")

    # Status tracking
    status: IncidentStatus = Field(IncidentStatus.DETECTED, description="Current status")
    status_reason: Optional[str] = Field(None, description="Reason for current status")

    # Detection information
    detected_at: datetime = Field(..., description="When incident was detected")
    detected_by_user_id: Optional[UUID] = Field(None, description="User who detected")
    detection_method: IncidentDetectionMethod = Field(
        IncidentDetectionMethod.MANUAL,
        description="How incident was detected"
    )
    detection_source: Optional[str] = Field(None, max_length=100, description="Source of detection")

    # Affected scope
    affected_users_count: int = Field(0, description="Number of users affected")
    affected_resources_count: int = Field(0, description="Number of resources affected")
    affected_data_categories: list[str] = Field(default_factory=list, description="Data categories affected")
    affected_systems: list[str] = Field(default_factory=list, description="Systems affected")
    geographic_scope: list[str] = Field(default_factory=list, description="Geographic regions affected")

    # Data breach specific (GDPR Article 33)
    is_data_breach: bool = Field(False, description="Is this a data breach")
    personal_data_involved: bool = Field(False, description="Personal data involved")
    data_subjects_count: Optional[int] = Field(None, description="Number of data subjects affected")
    data_categories_affected: list[str] = Field(default_factory=list, description="Personal data categories")
    breach_type: Optional[IncidentBreachType] = Field(None, description="Type of breach")

    # Regulatory notification tracking
    requires_notification: bool = Field(False, description="Requires regulatory notification")
    notification_deadline_at: Optional[datetime] = Field(None, description="Notification deadline (72h for GDPR)")
    authority_notified_at: Optional[datetime] = Field(None, description="When authority was notified")
    authority_notification_reference: Optional[str] = Field(None, max_length=100, description="Notification reference")
    subjects_notified_at: Optional[datetime] = Field(None, description="When subjects were notified")
    subjects_notification_count: Optional[int] = Field(None, description="Number of subjects notified")

    # Assignment and ownership
    assigned_to_user_id: Optional[UUID] = Field(None, description="Assigned handler")
    incident_commander_id: Optional[UUID] = Field(None, description="Incident commander")
    team_members: list[dict[str, Any]] = Field(default_factory=list, description="Team member assignments")

    # Investigation tracking
    investigation_started_at: Optional[datetime] = Field(None, description="When investigation started")
    investigation_completed_at: Optional[datetime] = Field(None, description="When investigation completed")
    root_cause: Optional[str] = Field(None, description="Root cause analysis")
    root_cause_category: Optional[IncidentRootCauseCategory] = Field(None, description="Root cause category")
    attack_vector: Optional[str] = Field(None, max_length=100, description="Attack vector used")
    threat_actor_type: Optional[IncidentThreatActorType] = Field(None, description="Type of threat actor")

    # Containment and remediation
    containment_started_at: Optional[datetime] = Field(None, description="When containment started")
    containment_completed_at: Optional[datetime] = Field(None, description="When containment completed")
    containment_actions: list[dict[str, Any]] = Field(default_factory=list, description="Containment actions taken")

    eradication_started_at: Optional[datetime] = Field(None, description="When eradication started")
    eradication_completed_at: Optional[datetime] = Field(None, description="When eradication completed")
    eradication_actions: list[dict[str, Any]] = Field(default_factory=list, description="Eradication actions taken")

    recovery_started_at: Optional[datetime] = Field(None, description="When recovery started")
    recovery_completed_at: Optional[datetime] = Field(None, description="When recovery completed")
    recovery_actions: list[dict[str, Any]] = Field(default_factory=list, description="Recovery actions taken")

    # Resolution
    resolved_at: Optional[datetime] = Field(None, description="When incident was resolved")
    resolution_summary: Optional[str] = Field(None, description="Summary of resolution")
    resolution_type: Optional[IncidentResolutionType] = Field(None, description="Type of resolution")

    # Post-incident
    post_incident_review_at: Optional[datetime] = Field(None, description="When PIR was conducted")
    lessons_learned: Optional[str] = Field(None, description="Lessons learned from incident")
    recommendations: list[dict[str, Any]] = Field(default_factory=list, description="Post-incident recommendations")
    follow_up_actions: list[dict[str, Any]] = Field(default_factory=list, description="Follow-up actions")

    # Evidence and documentation
    evidence_preserved: bool = Field(False, description="Evidence has been preserved")
    evidence_location: Optional[str] = Field(None, max_length=500, description="Location of evidence")
    legal_hold_id: Optional[UUID] = Field(None, description="Associated legal hold")

    # Related entities
    related_incident_ids: list[str] = Field(default_factory=list, description="Related incident IDs")
    related_dsr_ids: list[str] = Field(default_factory=list, description="Related DSR IDs")

    # External references
    external_ticket_id: Optional[str] = Field(None, max_length=100, description="External ticket ID")
    external_ticket_url: Optional[str] = Field(None, max_length=500, description="External ticket URL")
    insurance_claim_id: Optional[str] = Field(None, max_length=100, description="Insurance claim ID")

    # Communication log
    communications: list[dict[str, Any]] = Field(default_factory=list, description="Communications sent")

    # Timeline
    timeline: list[dict[str, Any]] = Field(default_factory=list, description="Incident timeline events")

    # Internal notes and audit trail
    internal_notes: Optional[str] = Field(None, description="Internal notes")
    status_history: list[dict[str, Any]] = Field(default_factory=list, description="History of status changes")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Reporter context
    reporter_ip_address: Optional[str] = Field(None, max_length=45, description="Reporter IP address")
    reporter_user_agent: Optional[str] = Field(None, description="Reporter user agent")

    # Timestamps
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = Field(None, description="When incident was closed")


class IncidentCreate(BaseModel):
    """Model for creating a new incident."""

    workspace_id: UUID
    title: str = Field(..., max_length=255)
    description: str
    incident_type: IncidentType
    category: IncidentCategory = IncidentCategory.SECURITY
    severity: IncidentSeverity = IncidentSeverity.MEDIUM
    impact: IncidentImpact = IncidentImpact.MEDIUM
    urgency: IncidentUrgency = IncidentUrgency.MEDIUM
    detected_at: Optional[datetime] = None
    detected_by_user_id: Optional[UUID] = None
    detection_method: IncidentDetectionMethod = IncidentDetectionMethod.MANUAL
    detection_source: Optional[str] = None
    is_data_breach: bool = False
    personal_data_involved: bool = False
    assigned_to_user_id: Optional[UUID] = None
    reporter_ip_address: Optional[str] = None
    reporter_user_agent: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class IncidentUpdate(BaseModel):
    """Model for updating an incident."""

    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[IncidentSeverity] = None
    impact: Optional[IncidentImpact] = None
    urgency: Optional[IncidentUrgency] = None
    priority: Optional[IncidentPriority] = None
    status: Optional[IncidentStatus] = None
    status_reason: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    incident_commander_id: Optional[UUID] = None
    team_members: Optional[list[dict[str, Any]]] = None
    affected_users_count: Optional[int] = None
    affected_resources_count: Optional[int] = None
    affected_data_categories: Optional[list[str]] = None
    affected_systems: Optional[list[str]] = None
    is_data_breach: Optional[bool] = None
    personal_data_involved: Optional[bool] = None
    data_subjects_count: Optional[int] = None
    data_categories_affected: Optional[list[str]] = None
    breach_type: Optional[IncidentBreachType] = None
    requires_notification: Optional[bool] = None
    root_cause: Optional[str] = None
    root_cause_category: Optional[IncidentRootCauseCategory] = None
    attack_vector: Optional[str] = None
    threat_actor_type: Optional[IncidentThreatActorType] = None
    containment_actions: Optional[list[dict[str, Any]]] = None
    eradication_actions: Optional[list[dict[str, Any]]] = None
    recovery_actions: Optional[list[dict[str, Any]]] = None
    resolution_summary: Optional[str] = None
    resolution_type: Optional[IncidentResolutionType] = None
    lessons_learned: Optional[str] = None
    recommendations: Optional[list[dict[str, Any]]] = None
    follow_up_actions: Optional[list[dict[str, Any]]] = None
    evidence_preserved: Optional[bool] = None
    evidence_location: Optional[str] = None
    legal_hold_id: Optional[UUID] = None
    external_ticket_id: Optional[str] = None
    external_ticket_url: Optional[str] = None
    internal_notes: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class IncidentSummary(BaseModel):
    """Lightweight incident summary for API responses."""

    incident_id: UUID
    workspace_id: UUID
    incident_number: str
    title: str
    incident_type: IncidentType
    category: IncidentCategory
    severity: IncidentSeverity
    priority: IncidentPriority
    status: IncidentStatus
    detected_at: datetime
    is_data_breach: bool = False
    requires_notification: bool = False


class IncidentUpdate_(BaseModel):
    """Model for incident timeline updates (renamed to avoid conflict)."""

    update_id: UUID

    # References
    incident_id: UUID
    workspace_id: UUID

    # Update details
    update_type: IncidentUpdateType = Field(IncidentUpdateType.STATUS_CHANGE, description="Type of update")
    title: Optional[str] = Field(None, max_length=255, description="Update title")
    content: str = Field(..., description="Update content")

    # Status transition
    previous_status: Optional[str] = Field(None, max_length=30, description="Previous status")
    new_status: Optional[str] = Field(None, max_length=30, description="New status")

    # Visibility
    visibility: IncidentUpdateVisibility = Field(IncidentUpdateVisibility.INTERNAL, description="Visibility level")
    is_public: bool = Field(False, description="Is publicly visible")

    # Author
    created_by_user_id: UUID = Field(..., description="User who created the update")

    # Attachments
    attachments: list[dict[str, Any]] = Field(default_factory=list, description="Attached files/evidence")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Timestamps
    created_at: datetime


# Use a type alias for the renamed model
IncidentTimelineUpdate = IncidentUpdate_


class IncidentAffectedResource(BaseModel):
    """Model for tracking resources affected by incidents."""

    id: UUID

    # References
    incident_id: UUID
    workspace_id: UUID

    # Resource identification
    resource_type: str = Field(..., max_length=50, description="Type of resource")
    resource_id: UUID = Field(..., description="ID of the resource")
    resource_name: Optional[str] = Field(None, max_length=255, description="Name of the resource")

    # User association
    user_id: Optional[UUID] = Field(None, description="User associated with the resource")

    # Impact details
    impact_type: IncidentResourceImpactType = Field(
        IncidentResourceImpactType.AFFECTED,
        description="Type of impact"
    )
    impact_description: Optional[str] = Field(None, description="Description of impact")

    # Data classification
    data_classification: Optional[IncidentDataClassification] = Field(
        None,
        description="Data sensitivity classification"
    )
    contains_pii: bool = Field(False, description="Contains personally identifiable information")
    contains_sensitive_data: bool = Field(False, description="Contains sensitive data")

    # Timeline
    identified_at: datetime = Field(..., description="When resource was identified as affected")
    remediated_at: Optional[datetime] = Field(None, description="When resource was remediated")

    # Remediation status
    remediation_status: IncidentRemediationStatus = Field(
        IncidentRemediationStatus.PENDING,
        description="Remediation status"
    )
    remediation_notes: Optional[str] = Field(None, description="Notes on remediation")

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


# =============================================================================
# ADDITIONAL HELPER MODELS
# =============================================================================


class StatusHistoryEntry(BaseModel):
    """Model for a status history entry."""

    status: str
    changed_at: datetime
    changed_by_user_id: Optional[UUID] = None
    reason: Optional[str] = None


class CustodianInfo(BaseModel):
    """Model for legal hold custodian information."""

    user_id: UUID
    name: str
    email: str
    notified_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_method: Optional[str] = None


class TimelineEvent(BaseModel):
    """Model for incident timeline events."""

    event: str
    occurred_at: datetime
    description: Optional[str] = None
    actor_user_id: Optional[UUID] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class IncidentTeamMember(BaseModel):
    """Model for incident team member assignments."""

    user_id: UUID
    role: str
    assigned_at: datetime
    removed_at: Optional[datetime] = None


class IncidentCommunication(BaseModel):
    """Model for incident communication records."""

    type: str  # email, phone, meeting, etc.
    sent_at: datetime
    recipients: list[str]
    content_summary: str
    sent_by_user_id: Optional[UUID] = None


class IncidentRecommendation(BaseModel):
    """Model for post-incident recommendations."""

    recommendation: str
    priority: str
    assigned_to_user_id: Optional[UUID] = None
    due_date: Optional[datetime] = None
    status: str = "pending"
    completed_at: Optional[datetime] = None
