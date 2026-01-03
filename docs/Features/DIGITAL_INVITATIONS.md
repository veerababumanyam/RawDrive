# Digital Invitations Feature

RawDrive's Digital Invitations system allows photographers to create beautiful, customizable event invitations with integrated RSVP management.

## Overview

The Digital Invitations feature enables:
- **Rich invitation design** with customizable templates, themes, and branding
- **RSVP management** with guest tracking, party size, dietary preferences
- **Multi-channel sharing** via direct links, QR codes, and email
- **Real-time analytics** for views, RSVPs, and engagement metrics
- **Export capabilities** for guest lists in CSV and PDF formats

## Security Features (020-invitation-rsvp-hardening)

### Workspace Isolation

All invitation and RSVP data is strictly isolated by workspace:
- `workspace_id` is enforced at the repository level on all queries
- Cross-workspace access returns empty results (defense in depth)
- Access denied attempts are logged for security monitoring

### Duplicate RSVP Prevention

- Unique constraint on `(invitation_id, lower(guest_email))`
- Duplicate submissions return `409 Conflict` with edit token prompt
- Edit tokens allow guests to update their RSVPs securely

### Audit Logging (SOC 2 Compliance)

All lifecycle events are logged:
- `RSVP_SUBMITTED` - New RSVP created
- `RSVP_UPDATED` - RSVP modified via edit token
- `RSVP_DELETED` - RSVP removed
- `RSVP_EXPORTED` - Guest list exported (CSV or PDF)
- `INVITATION_ACCESS_DENIED` - Unauthorized access attempt

Audit events include:
- `workspace_id` for tenant isolation
- `metadata` with non-PII details (format, count, source)
- No guest names, emails, or phone numbers in logs

### PII Protection

Personal information is protected:
- Logs filter out emails, phone numbers, and names
- Audit events use IDs only, not PII
- Export audit tracks format and count, not content

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/public/invitations/{slug}` | GET | View public invitation |
| `/public/invitations/{slug}/rsvp` | POST | Submit RSVP |
| `/public/invitations/{slug}/rsvp/{token}` | PUT | Update RSVP via edit token |

### Protected Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces/{id}/invitations` | GET | List invitations |
| `/v1/workspaces/{id}/invitations` | POST | Create invitation |
| `/v1/workspaces/{id}/invitations/{id}` | GET | Get invitation details |
| `/v1/workspaces/{id}/invitations/{id}/rsvps` | GET | List RSVPs |
| `/v1/workspaces/{id}/invitations/{id}/rsvps/export` | GET | Export RSVPs |
| `/v1/workspaces/{id}/invitations/{id}/rsvps/stats` | GET | Get RSVP statistics |

### Export Formats

```bash
# CSV Export
GET /v1/workspaces/{id}/invitations/{id}/rsvps/export?format=csv

# PDF Export
GET /v1/workspaces/{id}/invitations/{id}/rsvps/export?format=pdf
```

## Error Handling

### Error Boundary

The RSVP Dashboard includes a React error boundary with:
- Automatic retry with exponential backoff (1s, 2s, 4s...)
- Maximum 3 retry attempts before showing refresh option
- Theme-aware error UI with accessibility support
- Dismiss option for non-critical errors

### Error Response Format

```json
{
  "error": "RSVPDuplicateError",
  "message": "An RSVP with this email already exists",
  "details": {
    "code": "DUPLICATE_RSVP",
    "edit_url": "/invitations/{slug}/rsvp/edit?token=..."
  }
}
```

## Monitoring

A Grafana dashboard (`rsvp.json`) provides:
- RSVP error rates and types
- Audit event distribution
- Access denied alerts
- Export activity tracking
- Anomaly detection for unusual patterns

## Configuration

### Environment Variables

```bash
# Email notifications
SENDGRID_API_KEY=sg_xxx

# Audit logging
LOKI_URL=http://loki:3100

# Rate limiting
RSVP_RATE_LIMIT=100/minute
```

## Testing

### Backend Tests

```bash
# Run all invitation tests
cd backend && uv run pytest tests/integration/test_invitation*.py -v

# Coverage: 95% target for security-critical code
```

### Frontend Tests

```bash
# Run RSVP component tests
cd frontend && npx vitest run tests/components/InvitationErrorBoundary.test.tsx
cd frontend && npx vitest run tests/features/invitations/
```

## Last Updated

2025-01-03 (Feature: 020-invitation-rsvp-hardening)
