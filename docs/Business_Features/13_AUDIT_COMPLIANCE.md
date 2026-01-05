# Audit & Compliance

## Business Value Proposition

Audit & Compliance provides comprehensive audit logging, compliance tracking, and data governance to ensure security, meet regulatory requirements, and maintain customer trust.

### Key Business Benefits
- **Regulatory Compliance**: Meet GDPR, CCPA, DPDP requirements
- **Security Assurance**: Demonstrate security controls
- **Audit Trail**: Complete audit trail for investigations
- **Data Governance**: Control data lifecycle
- **Customer Trust**: Build customer confidence

> **Reference Documentation**:
> - `docs/Features/DATA_RETENTION_AND_CUSTOMER_REMOVAL.md` - Retention policies
> - `docs/Features/AUTHENTICATION_AND_SECURITY.md` - Security controls

---

## Key Capabilities

### Audit Logging

**Logged Events**:
- Authentication (login, logout, failed attempts)
- Authorization (permission changes, role assignments)
- Data access (gallery views, downloads)
- Data modification (create, update, delete)
- Administrative actions (settings changes)
- Billing events (payments, subscription changes)

**Audit Log Entry**:
```python
class AuditEvent:
    id: UUID
    workspace_id: UUID
    user_id: UUID
    event_type: str
    resource_type: str
    resource_id: UUID
    action: str
    changes: dict  # Before/after values
    ip_address: str
    user_agent: str
    status: str  # 'success', 'failure'
    created_at: datetime
```

**Log Retention**:
- Active logs: 90 days online
- Archived logs: 1 year compressed
- Compliance logs: 7 years (configurable)

### Compliance Frameworks

**GDPR (EU)**:
- Right to access (data export)
- Right to deletion (account deletion)
- Right to portability (data export)
- Data processing records
- Breach notification (72 hours)

**CCPA (California)**:
- Right to know (data access)
- Right to delete
- Right to opt-out
- Non-discrimination

**DPDP (India)**:
- Data principal rights
- Consent management
- Data localization awareness
- Grievance redressal

**SOC 2 Type II** (Planned):
- Security controls
- Availability controls
- Processing integrity
- Confidentiality
- Privacy

### Data Subject Rights

**Access Request**:
- Export all personal data
- Machine-readable format (JSON)
- 30-day response time

**Deletion Request**:
- Delete all personal data
- Anonymize where required
- 30-day response time
- Exceptions for legal holds

**Portability Request**:
- Export in standard format
- Include all user content
- 30-day response time

### Data Governance

**Data Classification**:
- Public: Marketing content
- Internal: Business data
- Confidential: Customer data
- Restricted: Payment data, credentials

**Retention Policies**:
- Active customer data: Indefinite
- Deleted accounts: 30-day grace period
- Inactive accounts: 12-month retention
- Trial accounts: 90-day post-expiry

**Legal Holds**:
- Preserve data for legal proceedings
- Prevent deletion during hold
- Audit trail for hold actions

### Incident Management

**Incident Types**:
- Security breach
- Data leak
- Unauthorized access
- System compromise

**Response Process**:
1. Detection and logging
2. Assessment and classification
3. Containment
4. Notification (if required)
5. Recovery
6. Post-incident review

---

## Technical Architecture

### Backend Services

```
audit_service.py
├── Log audit events
├── Query audit logs
├── Generate reports
└── Export logs

compliance_service.py
├── Handle data subject requests
├── Generate compliance reports
├── Track consent
└── Manage legal holds

data_governance_service.py
├── Classify data
├── Enforce retention
├── Handle deletion
└── Track lineage

incident_service.py
├── Log incidents
├── Track resolution
├── Generate reports
└── Send notifications
```

### API Endpoints

```
# Audit Logs
GET    /api/v1/audit-logs                 # List audit logs
GET    /api/v1/audit-logs/{id}            # Get audit log entry
POST   /api/v1/audit-logs/search          # Search logs
POST   /api/v1/audit-logs/export          # Export logs

# Data Subject Rights
POST   /api/v1/compliance/access-request  # Request data access
POST   /api/v1/compliance/deletion-request
POST   /api/v1/compliance/portability-request
GET    /api/v1/compliance/requests        # List requests
GET    /api/v1/compliance/requests/{id}   # Get request status

# Legal Holds
GET    /api/v1/legal-holds                # List legal holds
POST   /api/v1/legal-holds                # Create legal hold
DELETE /api/v1/legal-holds/{id}           # Release legal hold

# Compliance Reports
GET    /api/v1/compliance/reports         # List reports
POST   /api/v1/compliance/reports/generate
```

### Database Schema

```sql
audit_events
├── id (UUID)
├── workspace_id (UUID)
├── user_id (UUID)
├── event_type (VARCHAR)
├── resource_type (VARCHAR)
├── resource_id (UUID)
├── action (VARCHAR)
├── changes (JSONB)
├── ip_address (INET)
├── user_agent (TEXT)
├── status (VARCHAR)
├── created_at (TIMESTAMPTZ)
└── metadata (JSONB)

data_subject_requests
├── id (UUID)
├── workspace_id (UUID)
├── request_type (VARCHAR)
├── subject_email (VARCHAR)
├── status (VARCHAR)
├── requested_at (TIMESTAMPTZ)
├── completed_at (TIMESTAMPTZ)
└── metadata (JSONB)

legal_holds
├── id (UUID)
├── workspace_id (UUID)
├── hold_name (VARCHAR)
├── description (TEXT)
├── resource_type (VARCHAR)
├── resource_id (UUID)
├── is_active (BOOLEAN)
├── created_at (TIMESTAMPTZ)
└── released_at (TIMESTAMPTZ)

retention_policies
├── id (UUID)
├── workspace_id (UUID)
├── resource_type (VARCHAR)
├── retention_days (INTEGER)
├── is_active (BOOLEAN)
└── created_at (TIMESTAMPTZ)

incidents
├── id (UUID)
├── workspace_id (UUID)
├── incident_type (VARCHAR)
├── severity (VARCHAR)
├── status (VARCHAR)
├── description (TEXT)
├── detected_at (TIMESTAMPTZ)
├── resolved_at (TIMESTAMPTZ)
└── metadata (JSONB)
```

---

## Security Controls

### Data Protection
- **Encryption in Transit**: TLS 1.3
- **Encryption at Rest**: AES-256-GCM
- **Immutable Logs**: Append-only audit logs
- **Access Logging**: All access logged

### Access Control
- **RBAC**: Role-based permissions for audit access
- **Audit Trail**: Complete audit trail
- **Approval Workflow**: Sensitive access requires approval

---

## Business Metrics

- **Audit Log Coverage**: % of operations logged
- **Compliance Score**: Overall compliance status
- **Request Resolution Time**: Average time to resolve requests
- **Incident Response Time**: Average time to respond

---

## Implementation Status

- Completed: Basic audit logging, data retention
- In Progress: Data subject request handling
- Planned: SOC 2 controls, advanced compliance reporting
