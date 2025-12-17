# Admin and Platform Management

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive provides comprehensive admin and platform management tools for system administrators to monitor, manage, and optimize the platform. These tools enable user management, system monitoring, analytics, and configuration.

## Purpose

Admin features serve to:
- **User Management**: Create, manage, and monitor user accounts
- **System Monitoring**: Track system health and performance
- **Analytics**: Analyze platform usage and trends
- **Content Moderation**: Review and moderate user content
- **Subscription Management**: Manage user subscriptions and billing
- **Configuration**: Configure platform settings and features
- **Compliance**: Ensure regulatory compliance and audit trails

## Admin Roles

### Role Hierarchy

Platform admin roles are **global** (Ops/control-plane) and separate from workspace RBAC.

**Platform admin role templates (recommended)**

| Template | Role ID | Intended use | Can manage platform admins? | Default customer content access |
|---|---|---|---|---|
| Super Admin | `super_admin` | Full control plane + break-glass | ✅ Yes | ❌ No (requires explicit support access + audit) |
| Platform Admin | `platform_admin` | Platform monitoring, incident response coordination | ❌ No | ❌ No |
| Support Admin | `support_admin` | Customer support & troubleshooting | ❌ No | ❌ No (requires explicit support access + audit) |
| Billing Admin | `billing_admin` | Subscription, invoices, refunds | ❌ No | ❌ No |
| Content Moderator | `content_moderator` | Abuse/content moderation queues | ❌ No | ❌ No (moderation views are scoped/minimized) |
| Security Admin | `security_admin` | Security policy, investigations, incident tooling | ❌ No | ❌ No |
| Observability Admin | `observability_admin` | Logs/metrics/traces access and alert ops | ❌ No | ❌ No |
| Auditor (Read-only) | `auditor_readonly` | Read-only audits/log exports | ❌ No | ❌ No |
| Product Admin | `product_admin` | Feature flags, pricing experiments, rollouts | ❌ No | ❌ No |

**Key rules**
- Platform roles grant access to the **Admin Console** and platform operations.
- Platform roles do **not** automatically grant access to customer media/content.
- Any cross-workspace access must be **explicit**, **time-boxed**, and **audited** (see Support Access below).

### Template Permission Mapping (canonical)

Role templates are implemented as sets of explicit permissions. Super Admin assigns templates to admin users; enforcement is permission-based.

**Canonical permission families (platform admin):**
- `platform:admins:*` — create/disable admins, assign templates
- `platform:role_templates:*` — view/change templates (system-defined)
- `platform:workspaces:read` — list/search workspaces and view workspace metadata
- `platform:support_access:*` — start/stop support access scoped to `workspace_id`
- `platform:billing:*` — subscription changes, refunds/credits
- `platform:moderation:*` — moderation actions
- `platform:feature_flags:*` — flag/rollout changes
- `platform:audit:read` — view/export platform audit logs
- `platform:config:*` — global platform configuration and policy
- `platform:observability:read` — logs/metrics/traces access

**Template → permissions (default):**
- `super_admin`: `platform:admins:*`, `platform:role_templates:*`, `platform:workspaces:read`, `platform:support_access:*`, `platform:billing:*`, `platform:moderation:*`, `platform:feature_flags:*`, `platform:audit:read`, `platform:config:*`, `platform:observability:read`
- `platform_admin`: `platform:workspaces:read`, `platform:support_access:*`, `platform:feature_flags:*`, `platform:audit:read`, `platform:observability:read`
- `support_admin`: `platform:workspaces:read`, `platform:support_access:*`, `platform:audit:read`
- `billing_admin`: `platform:billing:*`, `platform:audit:read`
- `content_moderator`: `platform:moderation:*`, `platform:audit:read`
- `security_admin`: `platform:config:*`, `platform:audit:read`, `platform:observability:read`
- `observability_admin`: `platform:observability:read`, `platform:audit:read`
- `auditor_readonly`: `platform:audit:read`, `platform:workspaces:read`
- `product_admin`: `platform:feature_flags:*`, `platform:audit:read`

### Super Admin: Admin Provisioning & Role Assignment (required)

Super Admin must be able to create platform admins and assign templates without any code deploy.

**Provisioning workflow (invite-first):**
1. Super Admin creates an admin invite for an email + selects template(s).
2. System sends an invite link (one-time token) and enforces MFA setup on first login.
3. Admin accepts invite → admin identity is activated.
4. Any changes to assigned templates are versioned and audited.

**Hard requirements:**
- All grants/revokes are auditable (who/when/before/after).
- Super Admin changes require step-up auth (fresh MFA) and rate limiting.
- Admin accounts can be disabled immediately (incident response).

### Super Admin
Full platform access and control.

**Capabilities:**
- Create/disable platform admin accounts (or grant platform roles to existing users)
- Assign/revoke platform role templates (least privilege)
- Modify user subscriptions (with audit)
- Manage global platform configuration and policy
- Configure system settings
- Manage feature flags
- Manage break-glass / support access policies
- View all audit logs

**Notes:**
- “Emergency access override” is implemented as a **break-glass support access session** with strict audit logging and (optionally) approvals.

### Platform Admin
Platform monitoring and support.

**Capabilities:**
- View user accounts
- Moderate content
- View analytics
- Access audit logs
- Support user issues
- Cannot modify system settings
- Cannot access database

### Product Manager
Subscription and feature management.

**Capabilities:**
- Manage subscriptions
- View analytics
- Configure feature flags
- Manage pricing
- Cannot access user data
- Cannot modify system settings

**Notes:**
- In the template model this is expressed as `product_admin` (and optionally `billing_admin`), depending on responsibilities.

### Support Access (auditable cross-workspace access)

Platform admins sometimes need to inspect a specific workspace for support. RawDrive treats this as a separate, auditable capability.

**Requirements:**
- Support access sessions are scoped to a single `workspace_id`.
- Sessions are time-boxed (e.g., 15–60 minutes) and require a reason (ticket ID).
- All support access actions are written to an immutable audit trail.
- Enterprise default: require Workspace Owner/Admin approval before a session starts.

## User Management

### User Directory

View and manage all users.

**User List Features:**
- Search by email, name, company
- Filter by tier, status, signup date
- Sort by any column
- Bulk actions
- Export user list
- User details view

**User Information:**
```typescript
interface UserDirectory {
  id: string;
  email: string;
  name: string;
  businessName: string;
  tier: SubscriptionTier;
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  signupDate: Date;
  lastLoginDate: Date;
  storageUsed: number;
  galleryCount: number;
  clientCount: number;
  totalRevenue: number;
}
```

### User Details

View detailed user information.

**User Profile:**
- Email and contact info
- Business information
- Subscription details
- Storage usage
- Gallery count
- Client count
- Activity history
- Payment history
- Support tickets

**User Actions:**
- Suspend/unsuspend account
- Change subscription tier
- Reset password
- Send message
- View activity
- Export data
- Delete account

### User Suspension

Suspend user accounts for violations.

**Suspension Reasons:**
- Abuse/harassment
- Copyright violation
- Spam
- Payment fraud
- Terms violation
- Manual review

**Suspension Process:**
1. Select user
2. Choose reason
3. Add notes
4. Confirm suspension
5. Send notification
6. Log action

**Suspension Effects:**
- Cannot login
- Gallery access disabled
- Billing paused
- Data retained
- Can appeal

### User Deletion

Permanently delete user accounts.

**Deletion Process:**
1. Confirm user identity
2. Backup user data
3. Delete all data
4. Remove from system
5. Log deletion
6. Send confirmation

**Data Deletion:**
- All photos and videos
- Gallery configurations
- Client information
- Settings and preferences
- Payment history (anonymized)
- Audit logs (retained for compliance)

## Subscription Management

### Subscription Overview

View all active subscriptions.

**Subscription Metrics:**
```typescript
interface SubscriptionMetrics {
  totalSubscriptions: number;
  activeSubscriptions: number;
  canceledSubscriptions: number;
  
  // By tier
  byTier: Record<SubscriptionTier, number>;
  
  // By billing cycle
  monthlySubscriptions: number;
  annualSubscriptions: number;
  
  // Revenue
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  totalRevenue: number;
  
  // Churn
  churnRate: number;
  churnedThisMonth: number;
}
```

### Subscription Changes

Manage user subscription changes.

**Change Types:**
- Upgrade tier
- Downgrade tier
- Change billing cycle
- Apply discount
- Extend trial
- Cancel subscription

**Change Process:**
1. Select user
2. Choose new subscription
3. Set effective date
4. Apply proration
5. Send notification
6. Log change

### Billing Management

Manage billing and payments.

**Billing Features:**
- View invoices
- Resend invoices
- Apply credits
- Refund payments
- Update payment method
- Retry failed payments
- View payment history

**Invoice Management:**
```typescript
interface InvoiceManagement {
  invoiceId: string;
  userId: string;
  amount: number;
  status: 'paid' | 'unpaid' | 'refunded';
  issuedDate: Date;
  dueDate: Date;
  paidDate?: Date;
  pdfUrl: string;
}
```

### Churn Prevention

Monitor and prevent subscription cancellations.

**Churn Indicators:**
- Low activity
- Storage not used
- No galleries created
- No clients invited
- Support tickets
- Payment failures

**Retention Actions:**
- Send engagement email
- Offer discount
- Provide onboarding
- Assign support
- Offer upgrade

## System Monitoring

### System Health Dashboard

Monitor overall system health.

**Health Metrics:**
```typescript
interface SystemHealth {
  // Uptime
  uptime: number; // Percentage
  lastIncident: Date;
  
  // Performance
  avgResponseTime: number; // ms
  p95ResponseTime: number; // ms
  p99ResponseTime: number; // ms
  
  // Errors
  errorRate: number; // Percentage
  criticalErrors: number;
  warnings: number;
  
  // Resources
  cpuUsage: number; // Percentage
  memoryUsage: number; // Percentage
  diskUsage: number; // Percentage
  
  // Database
  dbConnections: number;
  dbQueryTime: number; // ms
  dbErrors: number;
}
```

### Performance Monitoring

Monitor application performance.

**Performance Metrics:**
- Page load times
- API response times
- Database query times
- Cache hit rates
- Error rates
- Concurrent users
- Request volume

**Performance Alerts:**
- High response time
- High error rate
- High resource usage
- Database issues
- Cache failures

### Error Tracking

Track and analyze errors.

**Error Information:**
```typescript
interface ErrorTracking {
  errorId: string;
  type: string;
  message: string;
  stackTrace: string;
  userId?: string;
  timestamp: Date;
  frequency: number;
  status: 'new' | 'acknowledged' | 'resolved';
}
```

**Error Analysis:**
- Error frequency
- Affected users
- Error trends
- Root cause analysis
- Resolution status

### Uptime Monitoring

Monitor service uptime.

**Uptime Metrics:**
- Current status (up/down)
- Uptime percentage
- Last incident
- Incident history
- Incident duration
- Incident impact

**Incident Management:**
- Log incidents
- Track resolution
- Notify users
- Post-mortem analysis
- Prevention measures

## Analytics Dashboard

### Usage Analytics

Analyze platform usage.

**Usage Metrics:**
```typescript
interface UsageAnalytics {
  // Users
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  
  // Engagement
  avgSessionDuration: number;
  avgSessionsPerUser: number;
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
  
  // Content
  totalPhotos: number;
  totalVideos: number;
  totalGalleries: number;
  avgPhotosPerGallery: number;
  
  // Clients
  totalClients: number;
  avgClientsPerPhotographer: number;
  clientEngagementRate: number;
}
```

### Revenue Analytics

Analyze revenue and financial metrics.

**Revenue Metrics:**
```typescript
interface RevenueAnalytics {
  // Revenue
  totalRevenue: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  
  // By tier
  revenueByTier: Record<SubscriptionTier, number>;
  
  // Growth
  monthlyGrowth: number; // Percentage
  yearlyGrowth: number; // Percentage
  
  // Churn
  churnRate: number;
  churnedRevenue: number;
  
  // Acquisition
  newCustomerRevenue: number;
  customerAcquisitionCost: number;
  lifetimeValue: number;
}
```

### Feature Usage Analytics

Analyze feature adoption.

**Feature Metrics:**
```typescript
interface FeatureUsageAnalytics {
  feature: string;
  usersUsing: number;
  usageFrequency: number;
  adoptionRate: number;
  averageUsagePerUser: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}
```

**Tracked Features:**
- Photo upload
- Gallery creation
- Client invitations
- AI analysis
- Face detection
- Album designer
- Sharing
- Downloads

### Custom Reports

Generate custom analytics reports.

**Report Types:**
- User growth
- Revenue trends
- Feature adoption
- Geographic distribution
- Device usage
- Browser usage
- Custom date ranges

## Content Moderation

### Content Review

Review user-generated content.

**Content Types:**
- Gallery descriptions
- Photo captions
- Comments
- User profiles
- Business descriptions

**Review Status:**
- Pending review
- Approved
- Rejected
- Flagged for manual review

### Moderation Actions

Take action on inappropriate content.

**Actions:**
- Approve content
- Reject content
- Remove content
- Warn user
- Suspend user
- Delete user account

**Moderation Reasons:**
- Spam
- Harassment
- Copyright violation
- Inappropriate content
- Misleading information
- Malware/phishing

### Automated Moderation

Use AI for content moderation.

**Automated Checks:**
- Spam detection
- Profanity filtering
- Copyright detection
- Malware scanning
- Phishing detection

**Confidence Scores:**
- High confidence: Auto-action
- Medium confidence: Flag for review
- Low confidence: Allow

## Audit Logging

### Audit Trail

Track all important actions.

**Logged Events:**
```typescript
interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  changes?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failure';
  errorMessage?: string;
}
```

**Logged Actions:**
- User login/logout
- Subscription changes
- User suspension
- Content deletion
- Admin actions
- System configuration changes
- Payment processing
- Data exports

### Audit Log Viewer

View and search audit logs.

**Features:**
- Search by user, action, resource
- Filter by date range
- Filter by status
- Export logs
- Real-time log streaming
- Retention policies

### Compliance Reports

Generate compliance reports.

**Report Types:**
- GDPR compliance
- CCPA compliance
- SOC 2 compliance
- Data access logs
- Data deletion logs
- User consent logs

## Feature Management

### Feature Flags

Control feature availability.

**Feature Flag Types:**
```typescript
interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Rollout
  rolloutPercentage: number; // 0-100
  targetUsers?: string[]; // Specific users
  targetTiers?: SubscriptionTier[]; // Specific tiers
  
  // Scheduling
  scheduledStart?: Date;
  scheduledEnd?: Date;
  
  // Monitoring
  errorThreshold?: number;
  autoRollback: boolean;
}
```

**Feature Flag Management:**
- Enable/disable features
- Gradual rollout (percentage)
- Target specific users/tiers
- Schedule rollout
- Monitor errors
- Auto-rollback on errors

### A/B Testing

Run A/B tests on features.

**A/B Test Setup:**
```typescript
interface ABTest {
  id: string;
  name: string;
  feature: string;
  
  // Variants
  controlVariant: string;
  testVariant: string;
  
  // Distribution
  controlPercentage: number;
  testPercentage: number;
  
  // Metrics
  primaryMetric: string;
  secondaryMetrics: string[];
  
  // Duration
  startDate: Date;
  endDate: Date;
  
  // Results
  controlResult: number;
  testResult: number;
  winner?: 'control' | 'test';
}
```

## Configuration Management

### Platform Settings

Configure platform-wide settings.

**Settings:**
- Email configuration
- Payment gateway settings
- Cloud storage settings
- AI service settings (multi-provider; Gemini default)
- Rate limiting
- Session timeout
- Password policies
- Two-factor authentication

### AI Configuration

Configure AI providers and model routing.

**Goals**
- Default to **Google Gemini** models for RawDrive-hosted deployments.
- Allow Platform Admin (global) and Workspace Admin (per workspace) to switch providers/models without redeploying.
- Support cloud providers and local/self-hosted endpoints.

**AI Settings (example)**

```typescript
type AIProviderType =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'azure_openai'
  | 'azure_ai_foundry'
  | 'openai_compatible'; // e.g., Ollama, LM Studio

type AICapability = 'text' | 'vision' | 'embeddings' | 'moderation';

interface ModelProfile {
  id: string;
  name: string; // e.g., 'default_text'
  capability: AICapability;
  provider: AIProviderType;

  // Provider/model selection
  model: string;
  endpoint?: string; // required for openai_compatible; optional for Azure resource endpoints
  apiVersion?: string; // Azure variants

  // Behavior
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;

  // Safety / governance
  safetyProfile?: 'standard' | 'strict' | 'off';
  dataRetention?: 'none' | 'provider_default';

  // Runtime controls
  enabled: boolean;
  fallbackProfileId?: string; // used by Model Router
}

interface AIConfiguration {
  enabled: boolean;

  // Which providers are allowed in this environment
  allowedProviders: AIProviderType[];

  // Default model profiles used by the Model Router
  defaultProfiles: Record<AICapability, string /* modelProfileId */>;

  // All available profiles (global catalog)
  modelProfiles: ModelProfile[];

  // Credential references are stored as secret refs, never plaintext
  providerSecrets: Record<AIProviderType, { secretRef: string }>;

  // Guardrails
  allowWorkspaceOverrides: boolean;
}
```

**Admin UI requirements**
- Show current provider/model per capability (text/vision/embeddings/moderation).
- Validate credentials/endpoints with a “Test connection” action.
- Support safe rollout: stage → percentage rollout → full rollout.
- Show AI usage metrics per workspace: requests, tokens, latency, error rate, cost estimate.

### Email Configuration

Configure email delivery.

**Email Settings:**
```typescript
interface EmailConfiguration {
  provider: 'sendgrid' | 'mailgun' | 'ses';
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  
  // Templates
  templates: EmailTemplate[];
  
  // Tracking
  trackOpens: boolean;
  trackClicks: boolean;
}
```

### Payment Configuration

Configure payment processing.

**Payment Settings:**
```typescript
interface PaymentConfiguration {
  provider: 'stripe' | 'razorpay';
  apiKey: string;
  webhookSecret: string;
  
  // Currencies
  supportedCurrencies: string[];
  defaultCurrency: string;
  
  // Fees
  platformFee: number; // Percentage
  processingFee: number; // Percentage
}
```

## Accessibility

### Admin UI Accessibility

Ensure admin features are accessible.

**Requirements:**
- Keyboard navigation for all controls
- Screen reader support for tables and charts
- High contrast for data displays
- Clear error messages
- Accessible data tables
- Keyboard shortcuts documented

## Related Files

- `frontend/src/components/admin/AdminDashboard.tsx` - Admin dashboard
- `frontend/src/components/admin/UserManagement.tsx` - User management
- `frontend/src/components/admin/SubscriptionManagement.tsx` - Subscription management
- `frontend/src/components/admin/AnalyticsDashboard.tsx` - Analytics
- `frontend/src/components/admin/SystemMonitoring.tsx` - System monitoring
- `frontend/src/components/admin/AuditLogViewer.tsx` - Audit logs
- `frontend/src/components/admin/ContentModeration.tsx` - Content moderation
- `frontend/src/components/admin/ApplicationSettings.tsx` - Settings
- `docs/RBAC_AND_USER_MANAGEMENT.md` - User roles and permissions

## Last Updated

2025-12-17
