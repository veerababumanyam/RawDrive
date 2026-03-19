---
name: compliance-legal
description: "Compliance, legal, and data governance patterns for RawDrive: GDPR/CCPA compliance, audit logging, legal holds, biometric consent (face recognition), data retention policies, and right-to-erasure workflows. Use this skill when implementing audit trails, data deletion/anonymization, consent management, legal hold functionality, data export (DSAR), cookie consent, privacy policies, or any compliance-related feature. Also use when working with face recognition consent flows, biometric data handling, or retention schedule enforcement. Triggers on: GDPR, CCPA, compliance, audit log, legal hold, data retention, right to erasure, data deletion, consent, biometric, DSAR, privacy, cookie consent, anonymization, retention policy."
---

# Compliance & Legal Patterns

RawDrive handles sensitive personal data (photos, faces, locations) — compliance is not optional. Face recognition features require explicit biometric consent under GDPR Art. 9 and BIPA.

## Audit Logging

Every state-changing operation must produce an immutable audit record:

```python
# Repository pattern for audit logs
class AuditLogRepository:
    async def log_action(
        self,
        workspace_id: UUID,
        user_id: UUID,
        action: AuditAction,
        resource_type: str,
        resource_id: UUID,
        details: dict | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            workspace_id=workspace_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
            created_at=datetime.utcnow(),
        )
        self.db.add(entry)
        await self.db.flush()
        return entry
```

### Audit Actions Enum

```python
class AuditAction(str, Enum):
    # Data access
    VIEW = "view"
    EXPORT = "export"
    DOWNLOAD = "download"
    # Data modification
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    RESTORE = "restore"
    # Auth
    LOGIN = "login"
    LOGOUT = "logout"
    PASSWORD_CHANGE = "password_change"
    # Sharing
    SHARE_CREATE = "share_create"
    SHARE_REVOKE = "share_revoke"
    # Compliance
    CONSENT_GRANTED = "consent_granted"
    CONSENT_REVOKED = "consent_revoked"
    LEGAL_HOLD_APPLIED = "legal_hold_applied"
    LEGAL_HOLD_RELEASED = "legal_hold_released"
    DATA_EXPORT_REQUESTED = "data_export_requested"
    DATA_DELETION_REQUESTED = "data_deletion_requested"
```

## Biometric Consent (Face Recognition)

Face recognition requires **explicit, informed, revocable consent** before processing:

```python
# Consent flow for face recognition
class BiometricConsentService:
    async def request_consent(
        self, workspace_id: UUID, user_id: UUID, purpose: str
    ) -> ConsentRecord:
        """Create a pending consent request. Never process faces without consent."""
        record = ConsentRecord(
            workspace_id=workspace_id,
            user_id=user_id,
            consent_type=ConsentType.BIOMETRIC_FACE,
            purpose=purpose,
            status=ConsentStatus.PENDING,
            requested_at=datetime.utcnow(),
        )
        # Log the consent request
        await self.audit_repo.log_action(
            workspace_id=workspace_id,
            user_id=user_id,
            action=AuditAction.CONSENT_GRANTED,
            resource_type="biometric_consent",
            resource_id=record.id,
        )
        return record

    async def revoke_consent(
        self, workspace_id: UUID, user_id: UUID, consent_id: UUID
    ) -> None:
        """Revoke consent and trigger deletion of all derived biometric data."""
        consent = await self.consent_repo.get(consent_id, workspace_id)
        consent.status = ConsentStatus.REVOKED
        consent.revoked_at = datetime.utcnow()
        # Queue deletion of face embeddings and groupings
        await self.task_queue.enqueue(
            "delete_biometric_data",
            workspace_id=workspace_id,
            user_id=user_id,
        )
```

### Frontend Consent UI

```typescript
// Consent banner component pattern
interface BiometricConsentProps {
  galleryId: string;
  onConsent: (granted: boolean) => void;
}

// Must show BEFORE any face processing begins
// Must explain: what data, why, how long stored, how to revoke
// Must allow granular control (face grouping vs face search separately)
```

## Legal Holds

Legal holds prevent deletion of data that may be relevant to litigation:

```python
class LegalHoldService:
    async def apply_hold(
        self,
        workspace_id: UUID,
        hold_name: str,
        resource_type: str,
        resource_ids: list[UUID],
        reason: str,
        applied_by: UUID,
    ) -> LegalHold:
        """Apply legal hold — blocked resources cannot be deleted or modified."""
        hold = LegalHold(
            workspace_id=workspace_id,
            name=hold_name,
            resource_type=resource_type,
            reason=reason,
            applied_by=applied_by,
            status=LegalHoldStatus.ACTIVE,
        )
        # Associate resources
        for rid in resource_ids:
            hold.resources.append(LegalHoldResource(resource_id=rid))
        # Audit
        await self.audit_repo.log_action(...)
        return hold

    async def check_hold(
        self, workspace_id: UUID, resource_type: str, resource_id: UUID
    ) -> bool:
        """Check before ANY deletion — return True if resource is under hold."""
        return await self.hold_repo.has_active_hold(
            workspace_id, resource_type, resource_id
        )
```

### Delete Guard Pattern

```python
# Every delete operation must check legal holds first
async def delete_asset(self, workspace_id: UUID, asset_id: UUID) -> None:
    if await self.legal_hold_service.check_hold(workspace_id, "asset", asset_id):
        raise ForbiddenError("Asset is under legal hold and cannot be deleted")
    # Proceed with soft delete...
```

## Data Retention Policies

```python
class RetentionPolicy:
    """Configurable per-workspace retention schedules."""
    # Defaults (override per workspace)
    TRASH_RETENTION_DAYS = 30          # Soft-deleted items
    AUDIT_LOG_RETENTION_DAYS = 365     # Audit trail
    SESSION_RETENTION_DAYS = 90        # Login sessions
    BIOMETRIC_RETENTION_DAYS = 180     # Face embeddings after consent revoke
    INVITATION_RETENTION_DAYS = 365    # Expired invitations

class RetentionEnforcementWorker:
    """Background worker that enforces retention policies."""
    async def run(self):
        # 1. Find expired items per policy
        # 2. Check legal holds before deletion
        # 3. Hard-delete or anonymize
        # 4. Log all actions to audit trail
```

## Right to Erasure (GDPR Art. 17)

Data Subject Access Requests (DSARs) must be handled within 30 days:

```python
class DSARService:
    async def handle_erasure_request(
        self, workspace_id: UUID, user_id: UUID
    ) -> DSARTicket:
        """Process right-to-erasure request."""
        ticket = DSARTicket(
            workspace_id=workspace_id,
            user_id=user_id,
            request_type=DSARType.ERASURE,
            status=DSARStatus.PENDING,
            deadline=datetime.utcnow() + timedelta(days=30),
        )
        # Queue comprehensive data deletion:
        # 1. Personal profile data → anonymize
        # 2. Photos uploaded by user → delete
        # 3. Face embeddings → delete
        # 4. Activity logs → anonymize (keep for audit but strip PII)
        # 5. Shared gallery access → revoke
        # 6. Payment records → retain (legal obligation) but anonymize PII
        return ticket

    async def handle_export_request(
        self, workspace_id: UUID, user_id: UUID
    ) -> DSARTicket:
        """Process data portability request (GDPR Art. 20)."""
        # Export all user data in machine-readable format (JSON + ZIP of assets)
```

## Cookie Consent & Privacy

```typescript
// Frontend cookie consent categories
enum ConsentCategory {
  ESSENTIAL = 'essential',       // Always on — auth, CSRF
  ANALYTICS = 'analytics',       // Posthog, GA
  FUNCTIONAL = 'functional',     // Preferences, theme
  MARKETING = 'marketing',       // Tracking pixels
}

// Store consent in both cookie and backend for audit trail
```

## Compliance Checklist for New Features

Before shipping any feature that handles personal data:

1. **Data inventory** — What PII does this feature collect/process?
2. **Legal basis** — Consent, legitimate interest, or contractual necessity?
3. **Retention** — How long is data kept? Is there auto-cleanup?
4. **Access control** — Is workspace_id isolation enforced?
5. **Audit trail** — Are all state changes logged?
6. **Deletion path** — Can data be deleted for DSAR compliance?
7. **Encryption** — Is data encrypted at rest and in transit?
8. **Third parties** — Does data flow to external services? DPA needed?
