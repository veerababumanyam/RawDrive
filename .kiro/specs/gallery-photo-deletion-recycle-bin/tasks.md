# Implementation Plan

- [ ] 1. Database schema and migration setup
  - Create migration file for deletion columns on galleries and assets tables
  - Add `deleted`, `deleted_at`, and `delete_status` columns
  - Create indexes for efficient recycle bin queries
  - Create `deletion_audit_log` table with all required fields
  - Test migration on development database
  - _Requirements: 2.1, 2.2, 8.1, 8.2, 8.3_

- [ ] 2. Core deletion service implementation
- [ ] 2.1 Implement DeletionService class with soft delete methods
  - Create `softDeleteGallery()` method that sets deletion flags and cascades to children
  - Create `softDeletePhoto()` method that sets deletion flags
  - Implement workspace validation for all operations
  - Add audit logging for soft delete operations
  - _Requirements: 2.1, 2.2, 2.6, 8.1, 10.1_

- [ ] 2.2 Write property test for soft delete preserving R2 files
  - **Property 1: Soft delete preserves R2 files**
  - **Validates: Requirements 2.5**

- [ ] 2.3 Write property test for soft delete cascading
  - **Property 4: Soft delete cascades to children**
  - **Validates: Requirements 2.6**

- [ ] 2.4 Write property test for soft delete markers
  - **Property 2: Soft delete sets deletion markers**
  - **Validates: Requirements 2.1, 2.2**

- [ ] 3. Recycle bin service implementation
- [ ] 3.1 Implement RecycleBinService class
  - Create `listRecycleBinItems()` method with workspace filtering
  - Create `restoreGallery()` method with parent validation and name conflict handling
  - Create `restorePhoto()` method with parent validation
  - Implement `calculateDaysUntilPermanentDelete()` helper
  - Add audit logging for restore operations
  - _Requirements: 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.2, 10.2_

- [ ] 3.2 Write property test for recycle bin filtering
  - **Property 5: Recycle bin shows exactly soft-deleted items**
  - **Validates: Requirements 2.7**

- [ ] 3.3 Write property test for restore validation
  - **Property 6: Restore validates parent existence**
  - **Validates: Requirements 3.1, 3.5**

- [ ] 3.4 Write property test for restore name conflicts
  - **Property 7: Restore handles name conflicts**
  - **Validates: Requirements 3.2**

- [ ] 3.5 Write property test for restore clearing markers
  - **Property 8: Restore clears deletion markers**
  - **Validates: Requirements 3.3, 3.6**

- [ ] 3.6 Write property test for restore cascading
  - **Property 9: Restore cascades to children**
  - **Validates: Requirements 3.4**

- [ ] 4. R2 cleanup service implementation
- [ ] 4.1 Implement R2CleanupService class
  - Create `listGalleryKeys()` method to enumerate all R2 objects for a gallery
  - Create `listPhotoKeys()` method to enumerate all R2 objects for a photo
  - Create `deleteWithRetry()` private method with exponential backoff
  - Implement idempotent deletion handling for missing objects
  - Create `deleteGalleryFiles()` method using batch deletion
  - Create `deletePhotoFiles()` method using batch deletion
  - _Requirements: 4.4, 4.5, 6.2, 6.3_

- [ ] 4.2 Write property test for R2 cleanup completeness
  - **Property 12: Permanent delete removes all R2 objects**
  - **Validates: Requirements 4.4, 4.5**

- [ ] 4.3 Write property test for retry logic
  - **Property 29: Retry logic uses exponential backoff**
  - **Validates: Requirements 6.2**

- [ ] 4.4 Write property test for missing object handling
  - **Property 17: Missing R2 objects don't fail deletion**
  - **Validates: Requirements 6.3**

- [ ] 5. Permanent deletion implementation
- [ ] 5.1 Implement permanent delete methods in DeletionService
  - Create `permanentDeleteGallery()` method with R2-then-DB sequence
  - Create `permanentDeletePhoto()` method with R2-then-DB sequence
  - Implement locking mechanism using `delete_status = 'permanent_deleting'`
  - Add error handling for R2 failures (mark as `delete_failed`)
  - Add error handling for DB failures (mark as `delete_failed`)
  - Add comprehensive audit logging with R2 keys and storage freed
  - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7, 6.1, 6.4, 8.3_

- [ ] 5.2 Write property test for R2 before DB deletion
  - **Property 11: Permanent delete removes R2 before database**
  - **Validates: Requirements 4.2, 4.3**

- [ ] 5.3 Write property test for permanent delete completeness
  - **Property 13: Permanent delete is complete**
  - **Validates: Requirements 4.8**

- [ ] 5.4 Write property test for failed R2 deletion handling
  - **Property 14: Failed R2 deletion marks for retry**
  - **Validates: Requirements 4.7**

- [ ] 5.5 Write property test for idempotent permanent delete
  - **Property 16: Permanent delete is idempotent**
  - **Validates: Requirements 6.5**

- [ ] 5.6 Write property test for concurrent operation prevention
  - **Property 28: Permanent delete prevents concurrent operations**
  - **Validates: Requirements 6.1**

- [ ] 6. API endpoints implementation
- [ ] 6.1 Implement soft delete endpoints
  - Create `DELETE /api/v1/galleries/:id` endpoint for soft delete
  - Create `DELETE /api/v1/photos/:id` endpoint for soft delete
  - Add workspace validation middleware
  - Add RBAC permission checks
  - Return appropriate success responses
  - _Requirements: 1.4, 10.1_

- [ ] 6.2 Implement recycle bin endpoints
  - Create `GET /api/v1/recycle-bin` endpoint with filtering
  - Create `POST /api/v1/recycle-bin/restore` endpoint
  - Create `DELETE /api/v1/recycle-bin/permanent` endpoint
  - Add workspace validation for all endpoints
  - Add RBAC permission checks
  - _Requirements: 2.7, 3.1, 4.1, 10.2, 10.3, 10.4_

- [ ] 6.3 Implement bulk operation endpoints
  - Create `POST /api/v1/recycle-bin/bulk-restore` endpoint
  - Create `POST /api/v1/recycle-bin/bulk-permanent-delete` endpoint
  - Process items individually and collect results
  - Return accurate success/failure counts
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 6.4 Write property test for workspace isolation
  - **Property 26: Operations respect workspace isolation**
  - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

- [ ] 6.5 Write property test for bulk operation accuracy
  - **Property 31: Bulk results are accurate**
  - **Validates: Requirements 7.5**

- [ ] 7. Frontend confirmation dialogs
- [ ] 7.1 Create DeleteConfirmationDialog component
  - Implement basic confirmation dialog for galleries and photos
  - Add conditional name-typing requirement for large galleries (>100 photos)
  - Add cancel and confirm buttons with proper state management
  - Display entity name, type, and size information
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [ ] 7.2 Create PermanentDeleteConfirmationDialog component
  - Implement warning dialog for permanent deletion
  - Display irreversibility warning message
  - Show count of items for bulk operations
  - Add cancel and confirm buttons
  - _Requirements: 4.1, 7.4_

- [ ] 8. Frontend recycle bin view
- [ ] 8.1 Create RecycleBinView component
  - Implement list view for soft-deleted items
  - Display item type, name, deleted_at timestamp
  - Calculate and display days until permanent deletion
  - Show thumbnail for photos
  - Implement empty state message
  - Add workspace filtering
  - _Requirements: 2.7, 9.1, 9.2, 9.3, 9.6_

- [ ] 8.2 Add restore and permanent delete actions to RecycleBinView
  - Add Restore button with tooltip
  - Add Permanently Delete button with tooltip
  - Wire up confirmation dialogs
  - Handle API calls and error states
  - Show success/error notifications
  - _Requirements: 3.1, 4.1, 9.4, 9.5_

- [ ] 8.3 Implement bulk operations toolbar
  - Add checkbox selection for items
  - Create BulkOperationsToolbar component
  - Add Bulk Restore button
  - Add Bulk Permanently Delete button
  - Show selected item count
  - Display results after bulk operations
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 8.4 Write property test for countdown calculation
  - **Property 32: Recycle bin displays countdown**
  - **Validates: Requirements 9.3**

- [ ] 9. Automated cleanup worker
- [ ] 9.1 Implement AutoCleanupWorker class
  - Create `runCleanup()` method with configurable retention period
  - Implement `cleanupWorkspace()` private method
  - Query for items where `deleted_at < (now - retention_period)`
  - Use permanent delete logic for each expired item
  - Implement error isolation (continue on individual failures)
  - Generate cleanup report with statistics
  - Add comprehensive logging
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.6_

- [ ] 9.2 Set up scheduled job for cleanup worker
  - Configure BullMQ job queue for cleanup
  - Set up cron schedule (default: daily at 2 AM)
  - Add job monitoring and alerting
  - Configure retention period from environment variable
  - _Requirements: 5.1, 5.2_

- [ ] 9.3 Write property test for cleanup item identification
  - **Property 18: Cleanup identifies expired items**
  - **Validates: Requirements 5.1**

- [ ] 9.4 Write property test for cleanup error isolation
  - **Property 20: Cleanup errors are isolated**
  - **Validates: Requirements 5.4**

- [ ] 9.5 Write property test for cleanup statistics
  - **Property 21: Cleanup reports accurate statistics**
  - **Validates: Requirements 5.5**

- [ ] 9.6 Write property test for cleanup workspace isolation
  - **Property 27: Cleanup maintains workspace isolation**
  - **Validates: Requirements 10.5**

- [ ] 10. Audit logging implementation
- [ ] 10.1 Implement AuditLogService class
  - Create `logSoftDelete()` method
  - Create `logRestore()` method
  - Create `logPermanentDelete()` method with R2 keys
  - Create `logError()` method with full context
  - Create `logCleanupRun()` method with statistics
  - Ensure all logs include workspace_id, user_id, timestamps
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 10.2 Write property test for audit log completeness
  - **Property 22: All deletion operations are logged**
  - **Validates: Requirements 8.1, 8.2, 8.3**

- [ ] 10.3 Write property test for permanent delete logging
  - **Property 23: Permanent delete logs R2 keys**
  - **Validates: Requirements 8.3**

- [ ] 10.4 Write property test for error logging
  - **Property 24: Errors are logged with context**
  - **Validates: Requirements 8.4, 8.5**

- [ ] 11. Update existing gallery and photo queries
- [ ] 11.1 Add deleted filter to all active queries
  - Update gallery list queries to filter `WHERE deleted = FALSE`
  - Update photo list queries to filter `WHERE deleted = FALSE`
  - Update gallery detail queries to check deleted status
  - Update photo detail queries to check deleted status
  - Ensure public share links exclude deleted items
  - _Requirements: 2.3, 2.4_

- [ ] 11.2 Write property test for deleted item exclusion
  - **Property 3: Soft deleted items are excluded from normal queries**
  - **Validates: Requirements 2.3, 2.4**

- [ ] 11.3 Write property test for restored item inclusion
  - **Property 10: Restored items appear in normal queries**
  - **Validates: Requirements 3.7**

- [ ] 12. Configuration and environment setup
- [ ] 12.1 Add deletion configuration
  - Create `config/deletion.ts` with all configuration options
  - Add environment variables for retention period
  - Add environment variables for cleanup schedule
  - Add environment variables for R2 batch size and retry settings
  - Add environment variables for name confirmation threshold
  - Document all configuration options
  - _Requirements: 5.1, 6.2_

- [ ] 12.2 Set up monitoring and alerts
  - Add Prometheus metrics for deletion operations
  - Create Grafana dashboard for deletion metrics
  - Configure alerts for high failure rates
  - Configure alerts for cleanup worker issues
  - Add logging for all deletion operations
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 13. Integration and end-to-end testing
- [ ] 13.1 Write integration test for complete deletion workflow
  - Test: create gallery → soft delete → verify in recycle bin → restore → verify active → soft delete → permanent delete → verify removed
  - _Requirements: All_

- [ ] 13.2 Write integration test for automated cleanup
  - Test: create old deleted items → run cleanup → verify permanent deletion → verify audit logs
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 13.3 Write integration test for error recovery
  - Test: mock R2 failures → attempt permanent delete → verify delete_failed status → retry → verify success
  - _Requirements: 4.7, 6.4_

- [ ] 13.4 Write integration test for bulk operations
  - Test: create multiple galleries → soft delete all → bulk restore with failures → verify results
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 14. Documentation and deployment
- [ ] 14.1 Update API documentation
  - Document all new endpoints in OpenAPI/Swagger
  - Add request/response examples
  - Document error codes and messages
  - Add authentication and authorization requirements
  - _Requirements: All_

- [ ] 14.2 Create user documentation
  - Write guide for using Recycle Bin
  - Document retention period and auto-cleanup
  - Explain difference between soft and permanent delete
  - Add screenshots and examples
  - _Requirements: All_

- [ ] 14.3 Prepare deployment checklist
  - Verify database migration is ready
  - Verify environment variables are configured
  - Verify cleanup worker schedule is set
  - Verify monitoring and alerts are configured
  - Plan rollout strategy (feature flag if needed)
  - _Requirements: All_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
