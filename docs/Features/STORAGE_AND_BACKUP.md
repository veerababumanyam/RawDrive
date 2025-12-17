# Storage and Backup Management

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive provides comprehensive storage management and backup capabilities to help photographers securely store, organize, and protect their photo libraries. The system supports cloud storage integration, automatic backups, and disaster recovery.

## Purpose

Storage and backup features serve to:
- **Secure Storage**: Safely store photos in cloud infrastructure
- **Automatic Backups**: Protect against data loss
- **Cloud Integration**: Connect to external cloud providers
- **Storage Optimization**: Manage storage quotas efficiently
- **Disaster Recovery**: Recover from accidental deletion
- **Data Redundancy**: Multiple copies across regions

## Storage Management

### Storage Quotas

Each subscription tier includes storage limits.

**Storage by Tier:**
```typescript
const STORAGE_LIMITS = {
  starter: 10 * 1024 * 1024 * 1024, // 10 GB
  professional: 100 * 1024 * 1024 * 1024, // 100 GB
  business: 1 * 1024 * 1024 * 1024 * 1024, // 1 TB
  enterprise: Infinity, // Unlimited
  // Trial is an account state. During the 30-day trial, treat the workspace as Business-tier.
  trial: 1 * 1024 * 1024 * 1024 * 1024, // 1 TB
};
```

### Storage Usage Tracking

Monitor storage consumption.

**Metrics:**
```typescript
interface StorageUsage {
  totalUsed: number; // Bytes
  totalLimit: number; // Bytes
  usagePercentage: number; // 0-100
  
  // Breakdown
  photosSize: number;
  videosSize: number;
  backupsSize: number;
  
  // Trends
  dailyUsage: number[];
  weeklyUsage: number[];
  monthlyUsage: number[];
}
```

### Storage Widget

Display storage usage prominently.

**Features:**
- Usage gauge/progress bar
- Percentage display
- Remaining space
- Upgrade prompt when near limit
- Breakdown by file type
- Cleanup suggestions

**Accessibility:**
- ARIA labels for gauge
- Percentage announced
- Keyboard navigable
- High contrast display
- Clear text descriptions

### Storage Alerts

Alert photographers when approaching limits.

**Alert Thresholds:**
- 75% used: Warning notification
- 90% used: Urgent notification
- 100% used: Blocking notification (cannot upload)

**Alert Actions:**
- Upgrade subscription
- Delete old files
- Archive to external storage
- Contact support

## Cloud Storage Integration

### Connected Cloud Providers

Connect to external cloud storage.

**Supported Providers:**
- Google Drive
- Dropbox
- OneDrive
- AWS S3
- Custom S3-compatible storage

**RawDrive-hosted default (Managed Storage):**
- Cloudflare R2 for object storage (assets + derivatives)
- Cloudflare CDN for global delivery (signed URLs + cache rules)

### Cloud Connection Setup

Connect cloud storage accounts.

**Setup Process:**
1. Select cloud provider
2. Authorize RawDrive
3. Grant permissions
4. Verify connection
5. Configure sync settings

**Connection Status:**
```typescript
interface CloudConnection {
  id: string;
  provider: 'google_drive' | 'dropbox' | 'onedrive' | 's3';
  status: 'connected' | 'disconnected' | 'error';
  accountEmail?: string;
  connectedAt: Date;
  lastSyncAt?: Date;
  syncStatus: 'idle' | 'syncing' | 'error';
}
```

### Sync Settings

Configure cloud synchronization.

**Sync Options:**
```typescript
interface SyncSettings {
  // Sync direction
  direction: 'upload' | 'download' | 'bidirectional';
  
  // Sync scope
  syncAllPhotos: boolean;
  syncGalleries: string[]; // Specific galleries
  
  // Sync frequency
  autoSync: boolean;
  syncInterval: number; // Minutes
  
  // Conflict resolution
  conflictResolution: 'keep_local' | 'keep_remote' | 'keep_both';
  
  // Bandwidth
  bandwidthLimit?: number; // Mbps
  syncOnMobileData: boolean;
}
```

### Sync Job Monitoring

Monitor cloud synchronization jobs.

**Job Status:**
```typescript
interface SyncJob {
  id: string;
  provider: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  
  // Progress
  totalItems: number;
  syncedItems: number;
  failedItems: number;
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
  estimatedTimeRemaining?: number;
  
  // Details
  errors: SyncError[];
}

interface SyncError {
  itemId: string;
  itemName: string;
  error: string;
  retryable: boolean;
}
```

## Backup System

### Automatic Backups

Automatically backup photos and metadata.

**Backup Schedule:**
```typescript
interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  timezone: string;
  
  // Retention
  retentionDays: number;
  maxBackups: number;
}
```

**Default Schedule:**
- Daily backups at 2 AM (user timezone)
- Keep last 30 days of backups
- Maximum 30 backup versions

### Backup Storage

Store backups securely.

**Backup Locations:**
- Primary: RawDrive-managed storage (Cloudflare R2)
- Secondary: Geo-redundant backup (Enterprise)
- Tertiary: Customer's cloud provider (if connected)

**Hosted Kubernetes deployments (Hostinger + kubeadm) include:**
- Cluster backups to R2 (e.g., Velero with S3-compatible backend)
- Postgres backups to R2 with PITR capability (e.g., WAL archiving)

**Backup Contents:**
- All photos and videos
- Metadata (EXIF, tags, descriptions)
- Gallery configurations
- Client information
- Settings and preferences

### Backup Encryption

Encrypt backups for security.

**Encryption:**
- AES-256 encryption at rest
- TLS 1.3 encryption in transit
- Customer-managed keys (Enterprise)
- Encryption key rotation

### Backup Verification

Verify backup integrity.

**Verification Process:**
1. Calculate checksums
2. Store checksums separately
3. Verify on restore
4. Alert on mismatch
5. Retry backup if failed

**Verification Metrics:**
```typescript
interface BackupVerification {
  backupId: string;
  verificationDate: Date;
  status: 'verified' | 'failed' | 'pending';
  itemsVerified: number;
  itemsFailed: number;
  checksumMismatches: number;
}
```

### Backup Management

Manage backup versions.

**Features:**
- View backup history
- Restore from specific backup
- Delete old backups
- Download backup
- Schedule backups
- Manual backup trigger

**Backup History:**
```typescript
interface BackupHistory {
  id: string;
  createdAt: Date;
  size: number;
  itemCount: number;
  status: 'completed' | 'failed' | 'partial';
  type: 'automatic' | 'manual';
  retentionUntil: Date;
}
```

## Disaster Recovery

### Restore from Backup

Restore photos from backup.

**Restore Options:**
1. **Full Restore**: Restore entire backup
2. **Selective Restore**: Choose specific items
3. **Point-in-Time Restore**: Restore to specific date
4. **Merge Restore**: Merge with existing data

**Restore Process:**
1. Select backup version
2. Choose restore scope
3. Verify restore details
4. Confirm restore
5. Monitor progress
6. Verify restored data

**Restore Progress:**
```typescript
interface RestoreProgress {
  backupId: string;
  status: 'pending' | 'restoring' | 'completed' | 'failed';
  totalItems: number;
  restoredItems: number;
  failedItems: number;
  estimatedTimeRemaining?: number;
  errors: RestoreError[];
}
```

### Deleted Items Recovery

Recover accidentally deleted items.

**Recycle Bin:**
- Soft delete (items moved to recycle bin)
- 30-day retention period
- Permanent deletion after 30 days
- Restore with one click
- Permanent delete option

**Recycle Bin Features:**
```typescript
interface RecycleBin {
  items: DeletedItem[];
  totalSize: number;
  oldestItem: Date;
  newestItem: Date;
}

interface DeletedItem {
  id: string;
  name: string;
  type: 'photo' | 'video' | 'gallery';
  deletedAt: Date;
  expiresAt: Date;
  size: number;
  deletedBy: string;
}
```

### Deletion Schedules

Schedule permanent deletion of items.

**Features:**
- Schedule deletion for future date
- Cancel scheduled deletion
- Automatic deletion after retention period
- Notification before deletion
- Audit logging

**Deletion Schedule:**
```typescript
interface DeletionSchedule {
  id: string;
  itemIds: string[];
  scheduledFor: Date;
  reason?: string;
  createdBy: string;
  status: 'scheduled' | 'completed' | 'canceled';
}
```

## Storage Optimization

### Cleanup Suggestions

Suggest ways to free up storage.

**Suggestions:**
- Delete duplicate photos
- Remove blurry photos
- Archive old galleries
- Compress videos
- Delete temporary files
- Remove old backups

**Cleanup Analysis:**
```typescript
interface CleanupAnalysis {
  duplicatePhotos: {
    count: number;
    potentialSavings: number;
  };
  blurryPhotos: {
    count: number;
    potentialSavings: number;
  };
  oldGalleries: {
    count: number;
    potentialSavings: number;
  };
  totalPotentialSavings: number;
}
```

### Compression

Compress photos to save space.

**Compression Options:**
```typescript
interface CompressionSettings {
  enabled: boolean;
  quality: 'high' | 'medium' | 'low'; // 90%, 75%, 60%
  format: 'jpeg' | 'webp'; // WebP saves ~25% more
  autoCompress: boolean;
  compressThreshold: number; // File size in MB
}
```

**Compression Results:**
- High quality: ~10-15% savings
- Medium quality: ~25-35% savings
- Low quality: ~40-50% savings
- WebP format: Additional ~25% savings

### Archive to External Storage

Archive old photos to external storage.

**Archive Features:**
- Select photos to archive
- Choose destination (cloud provider)
- Automatic archival schedule
- Restore from archive
- Delete local copy after archival
- Audit logging

## Storage Analytics

### Usage Analytics

Analyze storage usage patterns.

**Analytics:**
```typescript
interface StorageAnalytics {
  // Current usage
  totalUsed: number;
  totalLimit: number;
  usagePercentage: number;
  
  // Breakdown
  byFileType: Record<string, number>;
  byGallery: Record<string, number>;
  byDate: Record<string, number>;
  
  // Trends
  dailyGrowth: number[];
  weeklyGrowth: number[];
  monthlyGrowth: number[];
  
  // Projections
  projectedFullDate: Date;
  recommendedUpgradeDate: Date;
}
```

### Storage Reports

Generate storage reports.

**Report Types:**
- Daily usage report
- Weekly summary
- Monthly analysis
- Annual review
- Custom date range

**Report Contents:**
- Usage breakdown
- Growth trends
- Largest galleries
- Oldest photos
- Recommendations

## Purge Policies

### Automatic Purge Policies

Automatically delete old data.

**Policy Types:**
```typescript
interface PurgePolicy {
  id: string;
  name: string;
  enabled: boolean;
  
  // Scope
  scope: 'all' | 'galleries' | 'backups';
  targetGalleries?: string[];
  
  // Retention
  retentionDays: number;
  retentionCount?: number;
  
  // Conditions
  minFileSize?: number;
  maxFileSize?: number;
  fileTypes?: string[];
  
  // Schedule
  runDaily: boolean;
  runTime: string; // HH:MM
  
  // Notifications
  notifyBefore: boolean;
  notificationDays: number;
}
```

**Common Policies:**
- Delete backups older than 30 days
- Delete recycle bin items after 30 days
- Archive photos older than 1 year
- Delete temporary files daily

## Compliance & Regulations

### Data Residency

Store data in compliant regions.

**Regions:**
- US (default)
- EU (GDPR)
- Asia-Pacific
- Custom (Enterprise)

**Data Residency:**
```typescript
interface DataResidency {
  region: string;
  country: string;
  complianceFrameworks: string[]; // GDPR, CCPA, etc.
  dataCenter: string;
  backupRegion: string;
}
```

### Data Retention

Comply with data retention requirements.

**Retention Policies:**
- Active data: Indefinite (until deleted)
- Deleted data: 30 days (recycle bin)
- Backups: 30 days (default)
- Logs: 90 days
- Audit logs: 1 year

### Data Deletion

Securely delete data.

**Deletion Methods:**
- Soft delete (logical deletion)
- Hard delete (physical deletion)
- Cryptographic erasure (overwrite encryption keys)
- Secure wipe (multiple overwrite passes)

## Accessibility

### Storage UI Accessibility

Ensure storage features are accessible.

**Requirements:**
- Keyboard navigation for all controls
- Screen reader support for usage gauges
- High contrast for storage displays
- Clear error messages
- Accessible file upload
- Progress announcements

## Related Files

- `frontend/src/components/storage/StorageSettingsView.tsx` - Storage settings
- `frontend/src/components/storage/StorageWidget.tsx` - Storage display
- `frontend/src/components/storage/CloudConnectionCard.tsx` - Cloud integration
- `frontend/src/components/storage/SyncSettingsCard.tsx` - Sync configuration
- `frontend/src/components/storage/BackupJobCard.tsx` - Backup management
- `frontend/src/components/storage/PurgePolicySettings.tsx` - Purge policies
- `frontend/src/components/RecycleBin.tsx` - Recycle bin interface
- `frontend/src/components/DeletionSchedules.tsx` - Deletion scheduling

## Last Updated

2025-12-17
