# Design Document: Gallery and Photo Deletion with Recycle Bin

## Overview

This design implements a two-stage deletion system for galleries and photos in RawDrive. The system provides:

1. **Soft Delete (Recycle Bin)**: Marks entities as deleted without removing files, allowing recovery
2. **Permanent Delete**: Complete removal of all files from Cloudflare R2 and database records
3. **Automated Cleanup**: Background process to permanently delete old soft-deleted items
4. **Bulk Operations**: Efficient management of multiple deleted items
5. **Comprehensive Audit Logging**: Full traceability of all deletion operations

The design prioritizes data safety, consistency, and workspace isolation while ensuring complete cleanup when permanent deletion occurs.

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Action                               │
│  (Delete Gallery/Photo, Restore, Permanent Delete)          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Confirmation Dialog                             │
│  (Simple confirm or type-to-confirm for important items)    │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
┌───────▼──────┐ ┌──▼────────┐ ┌─▼──────────────┐
│ Soft Delete  │ │  Restore  │ │ Permanent Delete│
│              │ │           │ │                 │
│ - Set flags  │ │ - Validate│ │ - Delete R2     │
│ - Timestamp  │ │ - Clear   │ │ - Delete DB     │
│ - No R2 ops  │ │   flags   │ │ - Audit log     │
└──────────────┘ └───────────┘ └─────────────────┘
                                        │
                                        │
                                ┌───────▼────────┐
                                │ Background     │
                                │ Cleanup Worker │
                                │ (30 days)   │
                                └────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                           │
│  - DeleteConfirmationDialog                                  │
│  - RecycleBinView                                            │
│  - BulkOperationsToolbar                                     │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST
┌────────────────────▼────────────────────────────────────────┐
│                   API Controllers                            │
│  - DELETE /api/v1/galleries/:id (soft delete)               │
│  - DELETE /api/v1/photos/:id (soft delete)                  │
│  - POST /api/v1/recycle-bin/restore                         │
│  - DELETE /api/v1/recycle-bin/permanent                     │
│  - GET /api/v1/recycle-bin                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Service Layer                               │
│  - DeletionService                                           │
│  - RecycleBinService                                         │
│  - R2CleanupService                                          │
│  - AuditLogService                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
┌───────▼──────┐ ┌──▼────────┐ ┌─▼──────────────┐
│ PostgreSQL   │ │ Redis     │ │ Cloudflare R2  │
│ (metadata)   │ │ (locks)   │ │ (files)        │
└──────────────┘ └───────────┘ └────────────────┘
```

## Components and Interfaces

### 1. Frontend Components

#### DeleteConfirmationDialog

```typescript
interface DeleteConfirmationDialogProps {
  entityType: 'gallery' | 'photo';
  entityName: string;
  entitySize?: number; // Number of photos for galleries
  requireNameConfirmation: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}
```

**Behavior:**
- Shows entity type, name, and size (for galleries)
- For large/important galleries (>100 photos or marked important), requires typing the exact name
- Displays warning about moving to Recycle Bin
- Disables confirm button until validation passes

#### RecycleBinView

```typescript
interface RecycleBinViewProps {
  workspaceId: string;
}

interface RecycleBinItem {
  id: string;
  type: 'gallery' | 'photo';
  name: string;
  deletedAt: Date;
  daysUntilPermanentDelete: number;
  size?: number; // For galleries
  thumbnailUrl?: string; // For photos
}
```

**Features:**
- Lists all soft-deleted items for the workspace
- Shows deleted_at timestamp and countdown to auto-deletion
- Supports selection for bulk operations
- Provides Restore and Permanently Delete actions
- Empty state message when no items exist

#### BulkOperationsToolbar

```typescript
interface BulkOperationsToolbarProps {
  selectedItems: RecycleBinItem[];
  onBulkRestore: (items: RecycleBinItem[]) => Promise<void>;
  onBulkPermanentDelete: (items: RecycleBinItem[]) => Promise<void>;
}
```

### 2. Backend API Endpoints

#### Soft Delete Gallery

```
DELETE /api/v1/galleries/:galleryId
Authorization: Bearer <token>

Response 200:
{
  "success": true,
  "message": "Gallery moved to Recycle Bin",
  "deletedAt": "2025-12-19T10:30:00Z"
}
```

#### Soft Delete Photo

```
DELETE /api/v1/photos/:photoId
Authorization: Bearer <token>

Response 200:
{
  "success": true,
  "message": "Photo moved to Recycle Bin",
  "deletedAt": "2025-12-19T10:30:00Z"
}
```

#### List Recycle Bin

```
GET /api/v1/recycle-bin?type=all|gallery|photo
Authorization: Bearer <token>

Response 200:
{
  "items": [
    {
      "id": "uuid",
      "type": "gallery",
      "name": "Wedding 2024",
      "deletedAt": "2025-12-19T10:30:00Z",
      "daysUntilPermanentDelete": 25,
      "photoCount": 150
    }
  ],
  "total": 1
}
```

#### Restore Item

```
POST /api/v1/recycle-bin/restore
Authorization: Bearer <token>
Content-Type: application/json

{
  "itemId": "uuid",
  "itemType": "gallery",
  "newName": "Wedding 2024 (Restored)" // Optional, for name conflicts
}

Response 200:
{
  "success": true,
  "message": "Gallery restored successfully",
  "restoredItem": { ... }
}
```

#### Permanent Delete

```
DELETE /api/v1/recycle-bin/permanent
Authorization: Bearer <token>
Content-Type: application/json

{
  "itemId": "uuid",
  "itemType": "gallery"
}

Response 200:
{
  "success": true,
  "message": "Gallery permanently deleted",
  "filesDeleted": 450,
  "storageFreed": 2147483648 // bytes
}
```

#### Bulk Operations

```
POST /api/v1/recycle-bin/bulk-restore
POST /api/v1/recycle-bin/bulk-permanent-delete

{
  "items": [
    { "itemId": "uuid1", "itemType": "gallery" },
    { "itemId": "uuid2", "itemType": "photo" }
  ]
}

Response 200:
{
  "success": true,
  "results": [
    { "itemId": "uuid1", "success": true },
    { "itemId": "uuid2", "success": false, "error": "Parent gallery not found" }
  ],
  "successCount": 1,
  "failureCount": 1
}
```

### 3. Service Layer

#### DeletionService

```typescript
class DeletionService {
  /**
   * Soft delete a gallery and all its children
   */
  async softDeleteGallery(
    galleryId: string,
    workspaceId: string,
    userId: string
  ): Promise<void>;

  /**
   * Soft delete a photo
   */
  async softDeletePhoto(
    photoId: string,
    workspaceId: string,
    userId: string
  ): Promise<void>;

  /**
   * Permanently delete a gallery with full R2 cleanup
   */
  async permanentDeleteGallery(
    galleryId: string,
    workspaceId: string,
    userId: string
  ): Promise<PermanentDeleteResult>;

  /**
   * Permanently delete a photo with full R2 cleanup
   */
  async permanentDeletePhoto(
    photoId: string,
    workspaceId: string,
    userId: string
  ): Promise<PermanentDeleteResult>;
}

interface PermanentDeleteResult {
  success: boolean;
  filesDeleted: number;
  storageFreed: number;
  errors?: string[];
}
```

#### RecycleBinService

```typescript
class RecycleBinService {
  /**
   * List all soft-deleted items for a workspace
   */
  async listRecycleBinItems(
    workspaceId: string,
    filter?: 'gallery' | 'photo'
  ): Promise<RecycleBinItem[]>;

  /**
   * Restore a gallery from recycle bin
   */
  async restoreGallery(
    galleryId: string,
    workspaceId: string,
    newName?: string
  ): Promise<void>;

  /**
   * Restore a photo from recycle bin
   */
  async restorePhoto(
    photoId: string,
    workspaceId: string
  ): Promise<void>;

  /**
   * Calculate days until automatic permanent deletion
   */
  calculateDaysUntilPermanentDelete(deletedAt: Date): number;
}
```

#### R2CleanupService

```typescript
class R2CleanupService {
  /**
   * Delete all R2 objects for a gallery
   */
  async deleteGalleryFiles(
    galleryId: string,
    workspaceId: string
  ): Promise<R2CleanupResult>;

  /**
   * Delete all R2 objects for a photo
   */
  async deletePhotoFiles(
    photoId: string,
    workspaceId: string
  ): Promise<R2CleanupResult>;

  /**
   * List all R2 keys for a gallery (for verification)
   */
  async listGalleryKeys(
    galleryId: string,
    workspaceId: string
  ): Promise<string[]>;

  /**
   * List all R2 keys for a photo (for verification)
   */
  async listPhotoKeys(
    photoId: string,
    workspaceId: string
  ): Promise<string[]>;

  /**
   * Delete R2 objects with retry logic
   */
  private async deleteWithRetry(
    keys: string[],
    maxRetries: number
  ): Promise<R2CleanupResult>;
}

interface R2CleanupResult {
  success: boolean;
  keysDeleted: string[];
  keysFailed: string[];
  totalSize: number;
  errors?: string[];
}
```

#### AutoCleanupWorker

```typescript
class AutoCleanupWorker {
  /**
   * Run automated cleanup for items past retention period
   */
  async runCleanup(retentionDays: number): Promise<CleanupReport>;

  /**
   * Process a single workspace's expired items
   */
  private async cleanupWorkspace(
    workspaceId: string,
    retentionDays: number
  ): Promise<WorkspaceCleanupResult>;
}

interface CleanupReport {
  startTime: Date;
  endTime: Date;
  workspacesProcessed: number;
  itemsProcessed: number;
  itemsDeleted: number;
  itemsFailed: number;
  storageFreed: number;
  errors: string[];
}
```

## Data Models

### Database Schema Changes

#### galleries table

```sql
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS delete_status VARCHAR(50);
-- delete_status: null | 'permanent_deleting' | 'delete_failed'

CREATE INDEX idx_galleries_deleted ON galleries(workspace_id, deleted, deleted_at)
  WHERE deleted = TRUE;
```

#### photos table (or assets table)

```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS delete_status VARCHAR(50);

CREATE INDEX idx_assets_deleted ON assets(workspace_id, deleted, deleted_at)
  WHERE deleted = TRUE;
```

#### deletion_audit_log table

```sql
CREATE TABLE deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID REFERENCES users(id),
  entity_id UUID NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'gallery' | 'photo'
  action VARCHAR(50) NOT NULL, -- 'soft_delete' | 'restore' | 'permanent_delete'
  r2_keys_deleted TEXT[], -- Array of R2 keys deleted (for permanent delete)
  storage_freed BIGINT, -- Bytes freed (for permanent delete)
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deletion_audit_workspace ON deletion_audit_log(workspace_id, created_at);
CREATE INDEX idx_deletion_audit_entity ON deletion_audit_log(entity_id, entity_type);
```

### R2 Object Key Structure

For a photo with ID `photo-123` in gallery `gallery-456` in workspace `workspace-789`:

```
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/original.jpg
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/thumbnail-small.jpg
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/thumbnail-medium.jpg
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/thumbnail-large.jpg
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/webp/original.webp
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/webp/thumbnail-small.webp
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/webp/thumbnail-medium.webp
workspaces/workspace-789/galleries/gallery-456/photos/photo-123/webp/thumbnail-large.webp
```

When deleting a photo, all keys matching the prefix `workspaces/workspace-789/galleries/gallery-456/photos/photo-123/` must be deleted.

When deleting a gallery, all keys matching the prefix `workspaces/workspace-789/galleries/gallery-456/` must be deleted.

