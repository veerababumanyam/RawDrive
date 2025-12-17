# RawDrive Log Retention Policy

## Overview
This document outlines the log retention policies for RawDrive's audit and security logging infrastructure using Grafana Loki.

## Retention Periods

| Log Type | Retention Period | Rationale |
|----------|-----------------|-----------|
| **Audit Logs** (default) | 30 days | Security compliance, incident investigation |
| **Authentication Events** | 30 days | Security auditing, breach detection |
| **Error Logs** | 30 days | Debugging, incident response |
| **System Metrics** | 30 days | Performance monitoring |

## Log Categories

### Security & Audit Events (Critical - 30 days)
- `auth.login` - User login attempts (success/failure)
- `auth.logout` - User logout events
- `auth.signup` - New user registrations
- `auth.token_refresh` - Token refresh events
- `auth.password_change` - Password changes
- `auth.password_reset` - Password reset requests
- `auth.session_invalidated` - Session invalidations
- `auth.oauth_callback` - OAuth authentication events

### Workspace Events (Important - 30 days)
- `workspace.created` - Workspace creation
- `workspace.updated` - Workspace modifications
- `workspace.deleted` - Workspace deletions

### Member Events (Important - 30 days)
- `member.invited` - Member invitations
- `member.joined` - Member joins
- `member.removed` - Member removals
- `member.role_changed` - Role changes

### Content Events (Standard - 30 days)
- `gallery.created/updated/deleted` - Gallery operations
- `photo.uploaded/deleted` - Photo operations
- `album.created/updated/deleted` - Album operations

## Storage Optimization

### Compaction Settings
- **Compaction Interval**: Every 10 minutes
- **Retention Delete Delay**: 2 hours (allows recovery from accidental deletion)
- **Worker Count**: 150 (for efficient cleanup)

### Chunk Configuration
- **Target Chunk Size**: ~1.5 MB
- **Max Chunk Age**: 2 hours
- **Idle Period**: 1 hour

### Ingestion Limits
- **Rate Limit**: 10 MB/s per tenant
- **Burst Size**: 20 MB
- **Max Line Size**: 256 KB (truncated if exceeded)

## Query Limits

To prevent resource exhaustion:
- **Max Query Length**: 30 days
- **Max Entries per Query**: 5,000
- **Max Series per Query**: 500
- **Query Parallelism**: 32

## Compliance Considerations

### Data Privacy
- Logs are scoped by `workspace_id` for multi-tenant isolation
- No PII is stored in log messages (use user IDs, not emails)
- IP addresses are hashed for privacy

### Legal Requirements
- 30-day retention meets most regulatory requirements
- For extended retention (HIPAA, SOX), configure per-tenant overrides
- Export to long-term storage (S3/GCS) before expiry if needed

## Monitoring Storage

### Estimated Storage Requirements
With 30-day retention:
- Small workspace (100 users): ~500 MB/month
- Medium workspace (1,000 users): ~5 GB/month
- Large workspace (10,000 users): ~50 GB/month

### Storage Alerts
Set up Grafana alerts for:
- Disk usage > 80%
- Ingestion rate spikes
- Compaction failures

## Configuration Files

- **Loki Config**: `infrastructure/docker/loki/loki-config.yaml`
- **Docker Compose**: `infrastructure/docker/docker-compose.yml`
- **Grafana Dashboards**: `infrastructure/docker/grafana/provisioning/dashboards/`

## Future Enhancements

1. **Per-Tenant Retention**: Different retention periods per workspace based on subscription tier
2. **Cold Storage**: Archive logs > 30 days to S3/GCS for compliance
3. **Log Aggregation**: Roll up statistics before deletion
4. **Real-time Alerting**: AlertManager integration for security events
