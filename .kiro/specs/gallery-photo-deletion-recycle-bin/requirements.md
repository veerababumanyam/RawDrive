# Requirements Document

## Introduction

This document specifies the requirements for a safe, robust deletion system for galleries and photos in RawDrive. The system implements a two-stage deletion model: soft delete (Recycle Bin) for recovery, and permanent delete with complete cleanup from Cloudflare R2 storage and the database. This approach minimizes accidental data loss while ensuring complete removal when needed.

## Glossary

- **Gallery**: A collection of photos organized by a photographer, which can be a root gallery or sub-gallery
- **Photo**: An image file with associated metadata, thumbnails, and derived formats (WebP, resized versions)
- **Soft Delete**: Marking an entity as deleted without removing files from storage, making it recoverable
- **Hard Delete**: Permanent removal of all files from Cloudflare R2 and database records
- **Recycle Bin**: A per-photographer view showing soft-deleted galleries and photos that can be restored or permanently deleted
- **R2**: Cloudflare R2 object storage service where photo files, thumbnails, and derivatives are stored
- **Derived Asset**: Generated versions of a photo including thumbnails, WebP format, and resized variants
- **Workspace**: Multi-tenant isolation boundary; all operations are scoped to a workspace_id
- **Photographer**: The user who owns galleries and photos within their workspace

## Requirements

### Requirement 1

**User Story:** As a photographer, I want to delete galleries and photos with a confirmation step, so that I can remove unwanted content while avoiding accidental deletion.

#### Acceptance Criteria

1. WHEN a photographer initiates deletion of a gallery THEN the system SHALL display a confirmation dialog before proceeding
2. WHEN a photographer initiates deletion of an important or large gallery THEN the system SHALL require typing the gallery name to confirm deletion
3. WHEN a photographer initiates deletion of a photo THEN the system SHALL display a confirmation dialog before proceeding
4. WHEN a photographer confirms deletion THEN the system SHALL perform a soft delete operation
5. IF a photographer cancels the confirmation dialog THEN the system SHALL abort the deletion and maintain the current state

### Requirement 2

**User Story:** As a photographer, I want deleted galleries and photos to move to a Recycle Bin, so that I can recover them if I change my mind or deleted them by mistake.

#### Acceptance Criteria

1. WHEN a gallery is soft deleted THEN the system SHALL set a deleted_at timestamp and mark the gallery as deleted
2. WHEN a photo is soft deleted THEN the system SHALL set a deleted_at timestamp and mark the photo as deleted
3. WHEN a gallery is soft deleted THEN the system SHALL exclude it from all normal gallery lists and views
4. WHEN a photo is soft deleted THEN the system SHALL exclude it from all normal photo lists and views
5. WHEN a gallery or photo is soft deleted THEN the system SHALL NOT remove any files from Cloudflare R2
6. WHEN a gallery is soft deleted THEN the system SHALL also soft delete all its sub-galleries and photos
7. WHEN a photographer accesses the Recycle Bin THEN the system SHALL display all soft-deleted galleries and photos for that photographer's workspace

### Requirement 3

**User Story:** As a photographer, I want to restore galleries and photos from the Recycle Bin, so that I can recover accidentally deleted content.

#### Acceptance Criteria

1. WHEN a photographer restores a gallery from the Recycle Bin THEN the system SHALL validate that the original parent still exists
2. WHEN a photographer restores a gallery with a name conflict THEN the system SHALL require the photographer to choose a new name or automatically append a suffix
3. WHEN a photographer restores a gallery THEN the system SHALL clear all soft-delete flags and timestamps
4. WHEN a photographer restores a gallery THEN the system SHALL also restore all child sub-galleries and photos that were soft-deleted with it
5. WHEN a photographer restores a photo THEN the system SHALL validate that the parent gallery still exists
6. WHEN a photographer restores a photo THEN the system SHALL clear all soft-delete flags and timestamps
7. WHEN restoration completes THEN the system SHALL make the restored items visible in normal lists and views

### Requirement 4

**User Story:** As a photographer, I want to permanently delete galleries and photos from the Recycle Bin, so that I can free up storage space and ensure sensitive content is completely removed.

#### Acceptance Criteria

1. WHEN a photographer initiates permanent deletion from the Recycle Bin THEN the system SHALL display a confirmation dialog warning about irreversibility
2. WHEN a photographer confirms permanent deletion of a gallery THEN the system SHALL delete all associated files from Cloudflare R2 before removing database records
3. WHEN a photographer confirms permanent deletion of a photo THEN the system SHALL delete all associated files from Cloudflare R2 before removing database records
4. WHEN deleting gallery files from R2 THEN the system SHALL remove the original photos, all thumbnails, all WebP versions, all resized derivatives, and all associated folders
5. WHEN deleting photo files from R2 THEN the system SHALL remove the original file, all thumbnails, all WebP versions, and all resized derivatives
6. WHEN R2 deletion succeeds THEN the system SHALL remove all corresponding database records in a transaction
7. WHEN R2 deletion fails THEN the system SHALL mark the item as delete_failed and retry via a background worker
8. WHEN permanent deletion completes THEN the system SHALL ensure no orphaned files remain in R2 or orphaned records in the database

### Requirement 5

**User Story:** As a system administrator, I want an automated cleanup process for old Recycle Bin items, so that storage is not consumed indefinitely by soft-deleted content.

#### Acceptance Criteria

1. WHEN the automated cleanup process runs THEN the system SHALL identify all soft-deleted items older than the configured retention period
2. WHEN soft-deleted items exceed the retention period THEN the system SHALL permanently delete them using the same process as manual permanent deletion
3. WHEN the cleanup process runs THEN the system SHALL log all permanent deletions for audit purposes
4. WHEN the cleanup process encounters errors THEN the system SHALL mark items as delete_failed and continue processing remaining items
5. WHEN the cleanup process completes THEN the system SHALL report statistics on items processed, deleted, and failed

### Requirement 6

**User Story:** As a photographer, I want the deletion system to handle errors gracefully, so that partial failures don't leave my data in an inconsistent state.

#### Acceptance Criteria

1. WHEN permanent deletion is initiated THEN the system SHALL mark the item as permanent_deleting to prevent concurrent operations
2. WHEN R2 deletion operations are performed THEN the system SHALL implement retry logic with exponential backoff
3. WHEN an R2 object is already missing THEN the system SHALL log the condition but continue with remaining deletions
4. WHEN database operations fail during permanent deletion THEN the system SHALL rollback the transaction and mark the item as delete_failed
5. WHEN permanent deletion is re-run for the same item THEN the system SHALL handle it idempotently without errors
6. WHEN a delete_failed item exists THEN the system SHALL allow manual retry or investigation by administrators

### Requirement 7

**User Story:** As a photographer, I want to perform bulk operations in the Recycle Bin, so that I can efficiently manage multiple deleted items.

#### Acceptance Criteria

1. WHEN a photographer selects multiple items in the Recycle Bin THEN the system SHALL enable bulk restore action
2. WHEN a photographer selects multiple items in the Recycle Bin THEN the system SHALL enable bulk permanent delete action
3. WHEN bulk restore is initiated THEN the system SHALL validate and restore each item individually
4. WHEN bulk permanent delete is initiated THEN the system SHALL display a confirmation dialog with the count of items to be deleted
5. WHEN bulk operations complete THEN the system SHALL report success and failure counts for each item processed

### Requirement 8

**User Story:** As a system developer, I want comprehensive logging and audit trails for all deletion operations, so that we can troubleshoot issues and maintain compliance.

#### Acceptance Criteria

1. WHEN a soft delete occurs THEN the system SHALL log the action with user_id, workspace_id, entity_id, entity_type, and timestamp
2. WHEN a restore occurs THEN the system SHALL log the action with user_id, workspace_id, entity_id, entity_type, and timestamp
3. WHEN a permanent delete occurs THEN the system SHALL log the action with user_id, workspace_id, entity_id, entity_type, R2_keys_deleted, and timestamp
4. WHEN R2 deletion fails THEN the system SHALL log the error with full context including R2 keys, error message, and retry count
5. WHEN database operations fail THEN the system SHALL log the error with full context including SQL statement and error details
6. WHEN the automated cleanup process runs THEN the system SHALL log start time, end time, items processed, and summary statistics

### Requirement 9

**User Story:** As a photographer, I want the Recycle Bin interface to clearly distinguish between recoverable and permanent actions, so that I understand the consequences of my choices.

#### Acceptance Criteria

1. WHEN the Recycle Bin is displayed THEN the system SHALL show clear visual indicators that items are in a recoverable state
2. WHEN the Recycle Bin is displayed THEN the system SHALL show the deleted_at timestamp for each item
3. WHEN the Recycle Bin is displayed THEN the system SHALL show the remaining days before automatic permanent deletion
4. WHEN a photographer hovers over the Restore button THEN the system SHALL display a tooltip explaining the action
5. WHEN a photographer hovers over the Permanently Delete button THEN the system SHALL display a tooltip warning about irreversibility
6. WHEN the Recycle Bin is empty THEN the system SHALL display a message indicating no deleted items exist

### Requirement 10

**User Story:** As a photographer, I want deletion operations to respect workspace isolation, so that I can only delete and restore content within my own workspace.

#### Acceptance Criteria

1. WHEN a photographer initiates any deletion operation THEN the system SHALL validate the workspace_id matches the authenticated user's workspace
2. WHEN a photographer accesses the Recycle Bin THEN the system SHALL filter all items by the authenticated user's workspace_id
3. WHEN a photographer restores an item THEN the system SHALL validate the item belongs to the authenticated user's workspace
4. WHEN a photographer permanently deletes an item THEN the system SHALL validate the item belongs to the authenticated user's workspace
5. WHEN the automated cleanup process runs THEN the system SHALL process items for all workspaces while maintaining isolation
