# Data Retention and Customer Removal

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive implements comprehensive data retention and customer removal policies to balance customer data protection with operational efficiency. These policies govern how long data is retained, when customers are removed, and how data is handled during the removal process.

## Purpose

Data retention and removal policies serve to:
- **Protect Customer Data**: Retain data for reasonable periods
- **Comply with Regulations**: Meet GDPR, CCPA, and other requirements
- **Manage Costs**: Remove inactive customer data efficiently
- **Enable Recovery**: Allow data restoration within retention periods
- **Ensure Compliance**: Maintain audit trails and legal holds
- **Respect Privacy**: Delete data when no longer needed
- **Prevent Abuse**: Remove non-paying customers

## Data Retention Policies

### Active Customer Data Retention

Data retention for active, paying customers.

**Retention Rules:**
```typescript
interface ActiveCustomerRetention {
  // Core data
  userAccount: 'indefinite', // Until account deletion
  photos: 'indefinite', // Until deletion
  videos: 'indefinite', // Until deletion
  galleries: 'indefinite', // Until deletion
  clientData: 'indefinite', // Until deletion
  
  // Operational data
  uploadHistory: '90 days',
  downloadHistory: '90 days',
  loginHistory: '90 days',
  apiLogs: '30 days',
  
  // Backups
  automaticBackups: '30 days',
  manualBackups: 'indefinite',
  
  // Metadata
  exifData: 'indefinite',
  tags: 'indefinite',
  descriptions: 'indefinite',
}
```

**Key Points:**
- Active customers retain all data indefinitely
- Backups kept for 30 days (automatic)
- Manual backups retained indefinitely
- Activity logs retained for 90 days
- API logs retained for 30 days

### Inactive Customer Data Retention

Data retention for inactive customers (no login for 12+ months).

**Retention Timeline:**
```typescript
interface InactiveCustomerRetention {
  // Phase 1: Months 0-3 (Inactive)
  status: 'inactive',
  dataRetention: 'full',
  notifications: [
    'Day 30: Inactivity warning email',
    'Day 60: Reminder email',
    'Day 90: Final warning email',
  ],
  
  // Phase 2: Months 3-6 (Extended Inactive)
  status: 'extended_inactive',
  dataRetention: 'full',
  notifications: [
    'Day 120: Account suspension notice',
  ],
  
  // Phase 3: Months 6-12 (Suspended)
  status: 'suspended',
  dataRetention: 'full',
  accountAccess: 'disabled',
  
  // Phase 4: Month 12+ (Eligible for Removal)
  status: 'eligible_for_removal',
  dataRetention: 'full',
  removalEligibleAt: '12 months',
}
```

**Inactive Definition:**
- No login for 12 consecutive months
- No API activity
- No subscription renewal
- No support tickets

### Trial Customer Data Retention

Data retention for trial customers.

**Trial Retention:**
```typescript
interface TrialCustomerRetention {
  // During trial
  trialPeriod: '30 days',
  dataRetention: 'full',
  
  // After trial expires (no conversion)
  // Account access is disabled immediately upon expiry, but data is retained.
  postTrialPeriod: '90 days',
  dataRetention: 'full',
  notifications: [
    'Day 0: Trial expired email (account disabled)',
    'Day 7: Re-engagement email',
    'Day 30: Re-engagement touch (optional)',
    'Day 90: Final deletion warning',
  ],
  
  // After 120 days
  removalEligible: true,
  dataRetention: 'full',
  removalDate: 'Day 120 after trial expiry',
}
```

**Trial Data Handling:**
- Full data retention during trial
- No access grace period after trial expiry (account disabled on expiry)
- Post-expiry retention window: 90 days to allow upgrade with data intact
- Deletion warning at Day 90; hard delete at Day 120 if no conversion
- Email notifications before deletion

### Deleted Account Data Retention

Data retention for deleted accounts.

**Deletion Timeline:**
```typescript
interface DeletedAccountRetention {
  // Soft delete (user-initiated)
  status: 'soft_deleted',
  dataRetention: 'full',
  gracePeriod: '30 days',
  recoveryAvailable: true,
  notifications: [
    'Day 0: Deletion confirmation',
    'Day 7: Recovery reminder',
    'Day 25: Final recovery warning',
  ],
  
  // Hard delete (after grace period)
  status: 'hard_deleted',
  dataRetention: 'anonymized_only',
  recoveryAvailable: false,
  
  // Permanent deletion
  permanentDeletionDate: 'Day 30',
  dataRetention: 'none',
}
```

**Deletion Process:**
1. User initiates account deletion
2. 30-day grace period begins
3. Account marked as soft-deleted
4. Data retained in backup
5. User can recover within 30 days
6. After 30 days, hard delete
7. Data permanently removed

### Suspended Account Data Retention

Data retention for suspended accounts.

**Suspension Retention:**
```typescript
interface SuspendedAccountRetention {
  // Suspension period
  status: 'suspended',
  reason: 'payment_failure' | 'abuse' | 'violation' | 'admin_action',
  dataRetention: 'full',
  accountAccess: 'disabled',
  
  // Retention duration
  retentionPeriod: '90 days',
  
  // After retention period
  removalEligible: true,
  notifications: [
    'Day 1: Suspension notice',
    'Day 30: Reminder',
    'Day 60: Final warning',
    'Day 85: Removal scheduled',
  ],
  
  // Permanent removal
  removalDate: 'Day 90',
}
```

**Suspension Reasons:**
- Payment failure (3+ failed attempts)
- Terms of service violation
- Abuse or harassment
- Copyright violation
- Admin action

## Non-Renewing Customer Removal

### Subscription Expiration

Handle expired subscriptions.

**Expiration Process:**
```typescript
interface SubscriptionExpiration {
  // Subscription active
  status: 'active',
  renewalDate: Date,
  
  // Renewal attempt
  renewalAttempt: {
    date: Date,
    status: 'success' | 'failed',
    retryCount: number,
  },
  
  // After expiration
  status: 'expired',
  expirationDate: Date,
  gracePeriod: '7 days',
  
  // Grace period actions
  notifications: [
    'Day 0: Expiration notice',
    'Day 3: Renewal reminder',
    'Day 5: Final renewal notice',
  ],
  
  // After grace period
  status: 'removal_eligible',
  removalDate: 'Day 7 after expiration',
}
```

### Payment Failure Handling

Handle failed payment attempts.

**Payment Failure Process:**
```typescript
interface PaymentFailureHandling {
  // First failure
  attempt: 1,
  status: 'failed',
  notification: 'Payment failed email',
  retryDate: 'Day 3',
  
  // Second failure
  attempt: 2,
  status: 'failed',
  notification: 'Payment failed reminder',
  retryDate: 'Day 6',
  
  // Third failure
  attempt: 3,
  status: 'failed',
  notification: 'Account suspension notice',
  action: 'suspend_account',
  
  // After suspension
  suspensionPeriod: '30 days',
  recoveryOption: 'manual_payment',
  
  // After suspension period
  status: 'removal_eligible',
  removalDate: 'Day 30 after suspension',
}
```

**Retry Schedule:**
- Attempt 1: Day 0 (initial charge)
- Attempt 2: Day 3 (first retry)
- Attempt 3: Day 6 (second retry)
- Attempt 4: Day 9 (third retry)
- After 3 failures: Suspend account

### Churn Prevention

Attempt to prevent customer churn.

**Churn Prevention Actions:**
```typescript
interface ChurnPrevention {
  // Identify at-risk customers
  indicators: [
    'Low activity (< 1 login/month)',
    'Storage not used',
    'No galleries created',
    'No clients invited',
    'Support tickets',
    'Payment failures',
  ],
  
  // Intervention actions
  actions: [
    'Send engagement email',
    'Offer discount (10-20%)',
    'Provide onboarding',
    'Assign support',
    'Offer upgrade',
    'Suggest features',
  ],
  
  // Timing
  daysSinceLastLogin: 30,
  interventionDelay: '7 days',
  followUpDelay: '14 days',
}
```

**Churn Metrics:**
- Identify at-risk customers
- Send targeted emails
- Offer incentives
- Provide support
- Track conversion

### Downgrade vs Removal

Allow downgrade before removal.

**Downgrade Option:**
```typescript
interface DowngradeOption {
  // Before removal
  status: 'removal_eligible',
  options: [
    'Renew current tier',
    'Downgrade to lower tier',
    'Update payment method / resume subscription',
    'Delete account',
  ],
  
  // Downgrade process
  downgradeAction: {
    fromTier: 'professional',
    toTier: 'starter',
    effectiveDate: Date,
    proration: 'credit_account',
  },
  
  // After downgrade
  status: 'active',
  tier: 'starter',
  renewalDate: Date,
}
```

**Downgrade Benefits:**
- Retain customer relationship
- Reduce churn
- Maintain data
- Potential future upgrade
- Preserve customer history

## Customer Removal Process

### Removal Eligibility

Determine when customers are eligible for removal.

**Removal Criteria:**
```typescript
interface RemovalEligibility {
  // Non-renewing customers
  subscriptionExpired: true,
  daysSinceExpiration: '>= 7',
  
  // Inactive customers
  lastLogin: '>= 12 months ago',
  
  // Trial customers
  trialExpired: true,
  daysSinceTrialExpiry: '>= 30',
  
  // Suspended customers
  suspensionReason: 'payment_failure' | 'abuse',
  daysSinceSuspension: '>= 30',
  
  // Deleted accounts
  softDeleteInitiated: true,
  daysSinceDeletion: '>= 30',
}
```

### Removal Notifications

Notify customers before removal.

**Notification Timeline:**
```typescript
interface RemovalNotifications {
  // Initial notification
  day0: {
    type: 'email',
    subject: 'Your account will be removed',
    content: 'Account removal scheduled for [date]',
    action: 'Renew subscription or delete manually',
  },
  
  // Reminder notification
  day3: {
    type: 'email',
    subject: 'Reminder: Account removal in 4 days',
    content: 'Your account will be removed on [date]',
    action: 'Renew now to keep your data',
  },
  
  // Final notification
  day5: {
    type: 'email',
    subject: 'Final notice: Account removal in 2 days',
    content: 'Last chance to renew your subscription',
    action: 'Renew immediately',
  },
  
  // Removal confirmation
  day7: {
    type: 'email',
    subject: 'Your account has been removed',
    content: 'Account and data have been permanently deleted',
    action: 'None',
  },
}
```

**Notification Content:**
- Clear removal date
- Reason for removal
- Action to prevent removal
- Data deletion warning
- Support contact information

### Removal Execution

Execute customer removal.

**Removal Steps:**
```typescript
const executeCustomerRemoval = async (userId: string) => {
  // 1. Verify removal eligibility
  const isEligible = await verifyRemovalEligibility(userId);
  if (!isEligible) {
    throw new Error('Customer not eligible for removal');
  }
  
  // 2. Create backup (for compliance)
  const backup = await createComplianceBackup(userId);
  
  // 3. Anonymize personal data
  await anonymizePersonalData(userId);
  
  // 4. Delete user data
  await deleteUserPhotos(userId);
  await deleteUserVideos(userId);
  await deleteUserGalleries(userId);
  await deleteUserClients(userId);
  await deleteUserSettings(userId);
  
  // 5. Delete account
  await deleteUserAccount(userId);
  
  // 6. Log removal
  await logRemovalEvent(userId, 'customer_removed');
  
  // 7. Send confirmation
  await sendRemovalConfirmation(userId);
  
  return { success: true, removedAt: new Date() };
};
```

**Removal Sequence:**
1. Verify eligibility
2. Create compliance backup
3. Anonymize personal data
4. Delete all user data
5. Delete account
6. Log removal
7. Send confirmation

### Data Deletion

Permanently delete customer data.

**Data to Delete:**
```typescript
interface DataDeletion {
  // User account
  userAccount: true,
  userProfile: true,
  userSettings: true,
  
  // Content
  photos: true,
  videos: true,
  galleries: true,
  subGalleries: true,
  
  // Relationships
  clients: true,
  teamMembers: true,
  invitations: true,
  
  // Metadata
  tags: true,
  descriptions: true,
  exifData: true,
  
  // Activity
  loginHistory: true,
  uploadHistory: true,
  downloadHistory: true,
  
  // Backups
  automaticBackups: true,
  manualBackups: true,
  
  // Billing
  invoices: 'anonymized',
  paymentMethods: true,
  subscriptionHistory: 'anonymized',
}
```

**Deletion Methods:**
- Soft delete (logical deletion)
- Hard delete (physical deletion)
- Cryptographic erasure (overwrite keys)
- Secure wipe (multiple overwrites)

### Data Anonymization

Anonymize data for compliance.

**Anonymization Process:**
```typescript
interface DataAnonymization {
  // Personal information
  email: 'anonymized_[hash]@example.com',
  firstName: 'Deleted',
  lastName: 'User',
  businessName: 'Deleted',
  
  // Contact information
  phone: null,
  address: null,
  
  // Identifiers
  userId: 'anonymized_[hash]',
  ipAddress: null,
  
  // Metadata
  createdAt: 'retained',
  deletedAt: 'retained',
  
  // Audit trail
  auditLogs: 'retained',
  complianceLogs: 'retained',
}
```

**Anonymization Rules:**
- Replace email with hash
- Remove personal names
- Remove contact information
- Remove IP addresses
- Retain timestamps for compliance
- Retain audit logs

## Compliance and Legal Holds

### GDPR Compliance

Comply with GDPR data retention requirements.

**GDPR Requirements:**
```typescript
interface GDPRCompliance {
  // Right to be forgotten
  dataSubjectRequest: {
    type: 'deletion_request',
    responseTime: '30 days',
    action: 'delete_all_personal_data',
  },
  
  // Data portability
  dataPortability: {
    type: 'export_request',
    responseTime: '30 days',
    format: 'machine_readable',
  },
  
  // Retention limits
  retentionLimit: '3 years',
  purposeLimitation: true,
  
  // Consent
  consentRequired: true,
  consentRecorded: true,
  
  // Breach notification
  breachNotification: '72 hours',
}
```

**GDPR Actions:**
- Honor deletion requests
- Provide data exports
- Limit retention periods
- Maintain consent records
- Notify on breaches

### CCPA Compliance

Comply with CCPA data retention requirements.

**CCPA Requirements:**
```typescript
interface CCPACompliance {
  // Consumer rights
  rightToKnow: {
    type: 'data_access_request',
    responseTime: '45 days',
  },
  
  rightToDelete: {
    type: 'deletion_request',
    responseTime: '45 days',
    exceptions: ['fraud_prevention', 'legal_obligation'],
  },
  
  rightToOptOut: {
    type: 'sale_opt_out',
    responseTime: '45 days',
  },
  
  // Retention
  retentionLimit: 'business_purpose',
  
  // Disclosure
  privacyNotice: true,
  optOutNotice: true,
}
```

**CCPA Actions:**
- Provide data access
- Honor deletion requests
- Allow opt-out
- Maintain privacy notices
- Track consumer requests

### Legal Holds

Preserve data for legal proceedings.

**Legal Hold Process:**
```typescript
interface LegalHold {
  // Hold initiation
  holdId: string,
  initiatedBy: string,
  initiatedAt: Date,
  reason: string,
  
  // Scope
  affectedUsers: string[],
  dataTypes: string[],
  
  // Duration
  holdUntil: Date,
  autoRelease: boolean,
  
  // Compliance
  preservationNotice: true,
  auditLogging: true,
  
  // Release
  releasedBy: string,
  releasedAt: Date,
  releaseReason: string,
}
```

**Legal Hold Actions:**
- Preserve all data
- Prevent deletion
- Maintain audit trail
- Notify relevant parties
- Release when appropriate

## Audit Logging

### Removal Audit Trail

Log all removal activities.

**Audit Log Entry:**
```typescript
interface RemovalAuditLog {
  id: string,
  timestamp: Date,
  userId: string,
  action: string, // 'removal_initiated', 'notification_sent', 'data_deleted', etc.
  
  // Details
  reason: string,
  eligibilityCriteria: Record<string, any>,
  dataDeleted: string[],
  
  // Compliance
  gdprCompliant: boolean,
  ccpaCompliant: boolean,
  legalHoldActive: boolean,
  
  // Verification
  verifiedBy: string,
  verificationMethod: string,
  
  // Status
  status: 'pending' | 'completed' | 'failed',
  errorMessage?: string,
}
```

**Logged Events:**
- Removal eligibility check
- Notification sent
- Removal executed
- Data deleted
- Backup created
- Anonymization completed
- Compliance verified

### Retention Audit Trail

Log data retention activities.

**Retention Log Entry:**
```typescript
interface RetentionAuditLog {
  id: string,
  timestamp: Date,
  userId: string,
  action: string, // 'retention_policy_applied', 'data_archived', etc.
  
  // Details
  retentionPolicy: string,
  retentionPeriod: number,
  expirationDate: Date,
  
  // Data
  dataType: string,
  dataSize: number,
  itemCount: number,
  
  // Status
  status: 'active' | 'archived' | 'deleted',
}
```

## Reporting and Analytics

### Removal Reports

Generate removal reports.

**Report Metrics:**
```typescript
interface RemovalReport {
  period: {
    startDate: Date,
    endDate: Date,
  },
  
  // Removal statistics
  totalRemoved: number,
  removalByReason: Record<string, number>,
  removalByTier: Record<string, number>,
  
  // Timing
  averageDaysToRemoval: number,
  removalsByMonth: Record<string, number>,
  
  // Compliance
  gdprCompliantRemovals: number,
  ccpaCompliantRemovals: number,
  legalHoldsActive: number,
  
  // Data
  totalDataDeleted: number, // Bytes
  averageDataPerUser: number,
}
```

### Retention Reports

Generate retention reports.

**Report Metrics:**
```typescript
interface RetentionReport {
  period: {
    startDate: Date,
    endDate: Date,
  },
  
  // Retention statistics
  totalDataRetained: number, // Bytes
  retentionByType: Record<string, number>,
  retentionByTier: Record<string, number>,
  
  // Compliance
  gdprCompliant: boolean,
  ccpaCompliant: boolean,
  
  // Costs
  storageUsed: number,
  estimatedCost: number,
}
```

## Automation

### Scheduled Removal Jobs

Automate removal process.

**Removal Job Schedule:**
```typescript
interface RemovalJobSchedule {
  // Job configuration
  jobId: string,
  name: 'daily_removal_check',
  schedule: 'daily',
  runTime: '02:00 AM UTC',
  
  // Scope
  removalCriteria: RemovalEligibility,
  
  // Execution
  maxRemovalsPerRun: 1000,
  batchSize: 100,
  
  // Notifications
  notifyBefore: true,
  notificationDays: 7,
  
  // Logging
  logResults: true,
  alertOnFailure: true,
}
```

**Job Execution:**
1. Identify eligible customers
2. Send notifications
3. Wait for response period
4. Execute removals
5. Log results
6. Alert on failures

### Scheduled Backup Jobs

Automate backup creation before removal.

**Backup Job Schedule:**
```typescript
interface BackupJobSchedule {
  // Job configuration
  jobId: string,
  name: 'pre_removal_backup',
  schedule: 'daily',
  runTime: '01:00 AM UTC',
  
  // Scope
  backupCriteria: RemovalEligibility,
  
  // Execution
  backupType: 'compliance_backup',
  retentionDays: 365,
  
  // Logging
  logResults: true,
  alertOnFailure: true,
}
```

## Customer Communication

### Removal Notification Templates

Email templates for removal notifications.

**Template 1: Initial Removal Notice**
```
Subject: Your RawDrive Account Will Be Removed

Dear [Name],

Your RawDrive subscription has expired and your account is eligible for removal.

Account Details:
- Email: [Email]
- Expiration Date: [Date]
- Removal Date: [Date]

Action Required:
To keep your account and data, please renew your subscription by [Date].

If you have questions, please contact support@rawdrive.com

Best regards,
RawDrive Team
```

**Template 2: Final Removal Warning**
```
Subject: Final Notice: Your Account Will Be Removed in 2 Days

Dear [Name],

This is your final notice before your RawDrive account is permanently removed.

Removal Details:
- Current Date: [Date]
- Removal Date: [Date]
- Days Remaining: 2

Action Required:
Renew your subscription immediately to prevent removal.

After removal, all your data will be permanently deleted and cannot be recovered.

Renew Now: [Link]

Best regards,
RawDrive Team
```

**Template 3: Removal Confirmation**
```
Subject: Your RawDrive Account Has Been Removed

Dear [Name],

Your RawDrive account has been permanently removed as of [Date].

Removal Details:
- Email: [Email]
- Removal Date: [Date]
- Reason: Subscription expired

Data Status:
All your data has been permanently deleted and cannot be recovered.

If you believe this was an error, please contact support@rawdrive.com

Best regards,
RawDrive Team
```

## Related Files

- `frontend/src/components/trial/TrialExpiryPage.tsx` - Trial expiry handling
- `frontend/src/components/subscription/UpgradePrompt.tsx` - Upgrade prompts
- `frontend/src/components/admin/SubscriptionManagement.tsx` - Subscription management
- `frontend/src/components/admin/UserManagement.tsx` - User management
- `frontend/src/components/RecycleBin.tsx` - Recycle bin
- `frontend/src/components/DeletionSchedules.tsx` - Deletion scheduling
- `docs/STORAGE_AND_BACKUP.md` - Storage and backup
- `docs/ADMIN_AND_PLATFORM_MANAGEMENT.md` - Admin features
- `docs/RBAC_AND_USER_MANAGEMENT.md` - User management

## Last Updated

2025-12-17
