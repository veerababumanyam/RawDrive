# Implementation Plan: Face Detection and Identification Service

## Overview

This implementation plan breaks down the Face Detection and Identification service into discrete, incremental tasks. Each task builds on previous work and includes property-based tests to validate correctness. The implementation follows a modular architecture with proper error handling, user-friendly messages, and comprehensive inline documentation.

## Tasks

- [x] 1. Database Schema and Migrations
  - [x] 1.1 Create pgvector extension migration
    - Create migration `050_enable_pgvector.sql`
    - Enable pgvector extension for vector similarity search
    - _Requirements: 8.1_

  - [x] 1.2 Create faces table migration
    - Create migration `051_create_faces_table.sql`
    - Include all columns: id, workspace_id, photo_id, face_group_id, bounding_box, confidence, embedding, provider, detection_metadata, thumbnail_urls
    - Add indexes for workspace_id, photo_id, face_group_id
    - Add IVFFlat index for embedding similarity search
    - Add constraints for bounding_box JSON structure and confidence range
    - _Requirements: 1.4, 8.1, 8.3_

  - [x] 1.3 Create face_groups table migration
    - Create migration `052_create_face_groups_table.sql`
    - Include columns: id, workspace_id, name, representative_face_id, centroid, face_count
    - Add indexes for workspace_id and centroid
    - _Requirements: 2.1, 2.5_

  - [x] 1.4 Create ai_provider_settings table migration
    - Create migration `053_create_ai_provider_settings.sql`
    - Include columns for provider configuration, credentials (encrypted), rate limits, timeouts, health status
    - _Requirements: 3.1, 3.2, 3.7_

  - [x] 1.5 Create face_detection_jobs table migration
    - Create migration `054_create_face_detection_jobs.sql`
    - Include columns for job tracking: status, provider_used, faces_detected, error_message, retry_count, priority
    - Add indexes for status-based queries
    - _Requirements: 5.1, 5.6_

  - [x] 1.6 Create face_group_history table migration
    - Create migration `055_create_face_group_history.sql`
    - Support undo functionality with action history
    - Add expiration for automatic cleanup
    - _Requirements: 16.7_

- [x] 2. Core Type Definitions and Error Handling
  - [x] 2.1 Create face type definitions
    - Created `backend/src/app/api/face_schemas.py`
    - Define Pydantic models: Face, FaceGroup, BoundingBox, FaceDetectionResult, FaceAttributes
    - Define enums: FaceDetectionErrorCode, FaceDetectionJobStatus, ProviderHealthStatus
    - Include docstrings and field descriptions for all types
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 2.2 Create FaceDetectionError class
    - Created `backend/src/app/services/face_exceptions.py`
    - Implement typed error with code, http_status, user_message, details, correlation_id
    - Implement `to_api_response()` method for safe API responses
    - Add `get_default_user_message()` and `get_default_http_status()` helper functions
    - Created specific error classes: FaceNotFoundError, FaceGroupNotFoundError, ProviderUnavailableError, etc.
    - _Requirements: 10.1, 10.2_

  - [x] 2.3 Create error boundary middleware
    - Created `backend/src/app/middleware/face_error_handler.py`
    - Handle FaceDetectionError with appropriate logging and response
    - Handle unexpected errors with generic user message
    - Create `async_handler` decorator for route handlers
    - Create `FaceDetectionErrorMiddleware` class for middleware approach
    - Add `setup_face_detection_error_handlers()` helper function
    - _Requirements: 10.5_

  - [x] 2.4 Write property test for error serialization
    - Created `backend/tests/property/test_face_detection_properties.py`
    - **Property 18: Face Detection Result Round-Trip**
    - Test that FaceDetectionResult serializes and deserializes correctly
    - Additional tests for BoundingBox, FaceAttributes, error responses
    - Tests for all specific error types and their properties
    - **Validates: Requirements 9.3**

- [x] 3. Configuration and Settings Service
  - [x] 3.1 Create ConfigurationService
    - Created `backend/src/app/services/face_configuration_service.py`
    - Implement admin settings priority with env fallback
    - Implement `get_provider_credentials()` for Cloud Vision and Gemini
    - Implement `get_face_detection_setting()` with defaults
    - Add credential decryption for database-stored credentials
    - _Requirements: 3.6, 3.7_

  - [x] 3.2 Create AdminSettingsService
    - Created `backend/src/app/services/face_admin_settings_service.py`
    - Implement CRUD for provider configurations
    - Implement settings get/set with encryption for sensitive data
    - Implement provider health status updates
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.10_

  - [x] 3.3 Write property test for environment fallback
    - **Property 11: Environment Variable Fallback**
    - Test that missing admin settings fall back to env vars
    - Added to `backend/tests/property/test_face_detection_properties.py`
    - **Validates: Requirements 3.6**

  - [x] 3.4 Write property test for credential encryption
    - **Property 12: Credential Encryption**
    - Test that stored credentials are encrypted, not plaintext
    - Added to `backend/tests/property/test_face_detection_properties.py`
    - **Validates: Requirements 3.7**

- [x] 4. Circuit Breaker and Retry Strategy
  - [x] 4.1 Implement CircuitBreaker class
    - Created `backend/src/app/services/ai/circuit_breaker.py`
    - Implement states: closed, open, half-open
    - Implement failure tracking and automatic recovery
    - Add logging for state transitions
    - _Requirements: 10.3, 10.4_

  - [x] 4.2 Implement retry strategy with exponential backoff
    - Created `backend/src/app/services/ai/retry_strategy.py`
    - Implement `with_retry()` function with configurable backoff
    - Implement `is_transient_error()` for retry decision
    - Add jitter to prevent thundering herd
    - _Requirements: 5.3_

  - [x] 4.3 Write property test for circuit breaker behavior
    - **Property 19: Circuit Breaker Behavior**
    - Test that circuit opens after threshold failures
    - Test that unhealthy providers are excluded from selection
    - Added to `backend/tests/property/test_face_detection_properties.py`
    - **Validates: Requirements 10.3, 10.4**

- [x] 5. Checkpoint - Core Infrastructure
  - [x] Ensure all migrations run successfully (0024-0029 verified)
  - [x] Ensure all tests pass (37/37 property tests passing)
  - [x] Ask the user if questions arise

- [x] 6. AI Provider Implementations
  - [x] 6.1 Create BaseProvider abstract class
    - Created `backend/src/app/services/ai/providers/base_provider.py`
    - Implement image validation (format, size, corruption)
    - Implement bounding box normalization
    - Implement error wrapping with user-friendly messages
    - Add logging helpers for requests and responses
    - _Requirements: 1.7, 13.1, 13.2, 13.3_

  - [x] 6.2 Implement CloudVisionProvider
    - Created `backend/src/app/services/ai/providers/cloud_vision_provider.py`
    - Implement lazy client initialization with credentials
    - Implement `detect_faces()` with Vision API
    - Transform Vision API response to standard format
    - Implement `is_healthy()` health check
    - _Requirements: 1.2, 1.3, 1.5_

  - [x] 6.3 Implement GeminiProvider
    - Created `backend/src/app/services/ai/providers/gemini_provider.py`
    - Implement lazy client initialization with API key
    - Implement `detect_faces()` with structured prompt
    - Parse JSON response with error handling
    - Implement `is_healthy()` health check
    - _Requirements: 1.5_

  - [x] 6.4 Implement ProviderManager
    - Created `backend/src/app/services/ai/providers/provider_manager.py`
    - Implement `select_provider()` based on priority and health
    - Implement `execute_with_failover()` for automatic failover
    - Integrate circuit breakers for each provider
    - Load provider configs from admin settings with env fallback
    - _Requirements: 1.5, 10.1_

  - [x] 6.5 Write property test for provider failover
    - **Property 4: Provider Failover**
    - Test that primary failure triggers fallback provider
    - Added to `backend/tests/property/test_face_detection_properties.py`
    - **Validates: Requirements 1.5**

- [x] 7. Face Embedding Repository
  - [x] 7.1 Create FaceEmbeddingRepository
    - Create `backend/src/app/repositories/face_embedding_repository.py`
    - Implement `findSimilar()` using pgvector cosine distance
    - Implement `bulkInsertEmbeddings()` for batch processing
    - Implement `updateEmbedding()` for single updates
    - Add embedding dimension validation (512)
    - _Requirements: 8.1, 8.2, 8.4, 8.7_

  - [x] 7.2 Write property test for similarity search ordering
    - **Property 17: Similarity Search Ordering**
    - Test that results are ordered by descending similarity
    - **Validates: Requirements 8.4, 12.3**

  - [x] 7.3 Write property test for embedding normalization
    - **Property 2: Face Embedding Generation**
    - Test that all embeddings have L2 norm = 1
    - **Validates: Requirements 1.3, 13.7**

- [x] 8. Face and FaceGroup Repositories
  - [x] 8.1 Create FaceRepository
    - Create `backend/src/app/repositories/face_repository.py`
    - Implement CRUD operations with workspace scoping
    - Implement `findByPhotoId()` and `findByGroupId()`
    - Add cascade delete for photo deletion
    - _Requirements: 1.4, 6.1_

  - [x] 8.2 Create FaceGroupRepository
    - Create `backend/src/app/repositories/face_group_repository.py`
    - Implement CRUD operations with workspace scoping
    - Implement `updateCentroid()` and `incrementFaceCount()`
    - _Requirements: 2.5, 2.6_

  - [x] 8.3 Write property test for workspace isolation
    - **Property 15: Workspace Data Isolation**
    - Test that queries only return data from specified workspace
    - Test that similarity search never returns cross-workspace faces
    - **Validates: Requirements 6.1, 6.2, 14.7**

- [x] 9. Checkpoint - Data Layer Complete
  - [x] Ensure all repository tests pass
  - [x] Ensure workspace isolation is enforced
  - [x] Ask the user if questions arise

- [x] 10. Face Cluster Service
  - [x] 10.1 Create FaceClusterService
    - Create `backend/src/services/faceClusterService.ts`
    - Implement `assignToCluster()` with similarity matching
    - Implement `findSimilarFaces()` for discovery
    - Implement `recalculateCentroid()` for cluster updates
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

  - [x] 10.2 Implement cluster merge operation
    - Add `mergeGroups()` method
    - Reassign all faces from source to target
    - Delete source group after merge
    - Preserve target group metadata
    - _Requirements: 2.7, 16.5_

  - [x] 10.3 Implement cluster split operation
    - Add `splitGroup()` method
    - Create new group with specified faces
    - Update both group centroids
    - _Requirements: 2.8_

  - [x] 10.4 Write property test for cluster assignment
    - **Property 7: Cluster Assignment**
    - Test that faces above threshold join existing cluster
    - Test that faces below threshold create new cluster
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 10.5 Write property test for centroid maintenance
    - **Property 8: Centroid Maintenance**
    - Test that centroid is mean of member embeddings
    - Test that centroid updates after membership changes
    - **Validates: Requirements 2.5, 2.6**

  - [x] 10.6 Write property test for merge correctness
    - **Property 9: Cluster Merge Correctness**
    - Test that all faces move to target, source deleted
    - **Validates: Requirements 2.7, 16.5**

  - [x] 10.7 Write property test for split correctness
    - **Property 10: Cluster Split Correctness**
    - Test that specified faces move to new cluster
    - **Validates: Requirements 2.8**

- [x] 11. Face Detection Service
  - [x] 11.1 Create FaceDetectionService
    - Create `backend/src/services/faceDetectionService.ts`
    - Implement `detectFaces()` orchestration with provider manager
    - Implement `processPhoto()` for full detection pipeline
    - Implement `reprocessPhoto()` for manual re-detection
    - _Requirements: 1.1, 1.2, 1.6_

  - [x] 11.2 Implement low confidence handling
    - Filter faces below confidence threshold
    - Mark low-confidence faces for manual review
    - Exclude from automatic clustering
    - _Requirements: 1.8_

  - [x] 11.3 Write property test for multi-face independence
    - **Property 5: Multi-Face Independence**
    - Test that N faces create N independent records
    - **Validates: Requirements 1.6**

  - [x] 11.4 Write property test for low confidence exclusion
    - **Property 6: Low Confidence Exclusion**
    - Test that low-confidence faces are not auto-grouped
    - **Validates: Requirements 1.8**

  - [x] 11.5 Write property test for face data persistence
    - **Property 3: Face Data Persistence**
    - Test that completed detection stores all required fields
    - **Validates: Requirements 1.4**

- [x] 12. Face Thumbnail Service
  - [x] 12.1 Create FaceThumbnailService
    - Create `backend/src/services/faceThumbnailService.ts`
    - Implement `generateThumbnail()` with face cropping
    - Generate three sizes: 64px, 128px, 256px
    - Upload to configured storage provider
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

  - [x] 12.2 Write property test for thumbnail generation
    - **Property 20: Thumbnail Generation**
    - Test that all three sizes are generated with valid URLs
    - **Validates: Requirements 11.1, 11.3**

- [x] 13. Checkpoint - Core Services Complete
  - Ensure all service tests pass
  - Ensure detection pipeline works end-to-end
  - Ask the user if questions arise

- [x] 14. Background Job Worker
  - [x] 14.1 Create FaceDetectionWorker
    - Create `backend/src/workers/faceDetectionWorker.ts`
    - Implement job processing with BullMQ
    - Implement retry logic with exponential backoff
    - Implement batch processing for efficiency
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 14.2 Implement job status tracking
    - Update job status in database
    - Log failures with error details
    - Support priority queuing
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 14.3 Implement global processing toggle
    - Check workspace-level face detection setting
    - Skip processing when disabled
    - _Requirements: 5.8, 14.1, 14.2_

  - [x] 14.4 Write property test for job creation
    - **Property 1: Face Detection Job Creation**
    - Test that photo upload creates detection job
    - **Validates: Requirements 1.1**

  - [x] 14.5 Write property test for detection disabled behavior
    - **Property 21: Detection Disabled Behavior**
    - Test that disabled workspaces don't create jobs
    - **Validates: Requirements 14.2**

- [x] 15. API Routes and Controllers
  - [x] 15.1 Create face API routes
    - Create `backend/src/routes/v1/faces.ts`
    - Implement GET /galleries/{id}/faces
    - Implement GET /faces/{id}
    - Implement POST /faces/{id}/identify
    - Implement POST /photos/{id}/detect-faces
    - _Requirements: 7.1, 7.2, 7.3, 7.8_

  - [x] 15.2 Create face group API routes
    - Create `backend/src/routes/v1/faceGroups.ts`
    - Implement GET /workspaces/{id}/face-groups
    - Implement PUT /face-groups/{id}
    - Implement POST /face-groups/merge
    - Implement POST /face-groups/{id}/split
    - _Requirements: 7.4, 7.5, 7.6, 7.7_

  - [x] 15.3 Create admin AI provider routes
    - Create `backend/src/routes/v1/admin/aiProviders.ts`
    - Implement GET /admin/ai-providers
    - Implement PUT /admin/ai-providers/{id}
    - Implement POST /admin/ai-providers/{id}/test
    - _Requirements: 3.8_

  - [x] 15.4 Create FaceController
    - Create `backend/src/controllers/faceController.ts`
    - Implement request validation with Zod
    - Implement workspace authorization checks
    - Use asyncHandler for error boundary
    - _Requirements: 7.9_

  - [x] 15.5 Create FaceGroupController
    - Create `backend/src/controllers/faceGroupController.ts`
    - Implement request validation
    - Implement workspace authorization
    - _Requirements: 7.9_

- [x] 16. Face Group Filtering and Organization
  - [x] 16.1 Implement face group filtering in gallery
    - Add face group filter to gallery photo queries
    - Support AND/OR logic for multiple groups
    - _Requirements: 4.1, 4.2, 4.7_

  - [x] 16.2 Implement face group statistics
    - Add face count per gallery
    - Add photo count per face group
    - _Requirements: 4.6, 16.4_

  - [x] 16.3 Write property test for face group filtering
    - **Property 13: Face Group Filtering**
    - Test that filtered photos contain faces from selected group
    - **Validates: Requirements 4.2**

  - [x] 16.4 Write property test for multi-face photo inclusion
    - **Property 14: Multi-Face Photo Inclusion**
    - Test that photos with multiple faces appear in all relevant filters
    - **Validates: Requirements 4.5**

- [x] 17. Face Group Management Operations
  - [x] 17.1 Implement face group CRUD
    - Create empty groups with name
    - Delete groups (preserve faces as ungrouped)
    - Update group name and representative
    - _Requirements: 16.1, 16.2, 4.3, 4.4_

  - [x] 17.2 Implement face group history for undo
    - Record actions in face_group_history
    - Implement undo for recent changes
    - Auto-expire old history entries
    - _Requirements: 16.7_

  - [x] 17.3 Write property test for group deletion preservation
    - **Property 22: Face Group Deletion Preservation**
    - Test that deleted group's faces remain with null group_id
    - **Validates: Requirements 16.2**

- [x] 18. Checkpoint - API Layer Complete
  - Ensure all API endpoints work correctly
  - Ensure authorization is enforced
  - Ask the user if questions arise

- [x] 19. Cascade Delete and Data Integrity
  - [x] 19.1 Implement workspace cascade delete
    - Delete all faces when workspace deleted
    - Delete all face groups when workspace deleted
    - Delete all detection jobs when workspace deleted
    - _Requirements: 6.3_

  - [x] 19.2 Implement photo cascade delete
    - Delete associated faces when photo deleted
    - Delete face thumbnails from storage
    - Update face group counts
    - _Requirements: 11.6_

  - [x] 19.3 Implement photo move preservation
    - Preserve face associations when photo moves galleries
    - _Requirements: 17.7_

  - [x] 19.4 Write property test for workspace cascade delete
    - **Property 16: Workspace Cascade Delete**
    - Test that workspace deletion removes all face data
    - **Validates: Requirements 6.3**

  - [x] 19.5 Write property test for photo move preservation
    - **Property 23: Photo Move Face Preservation**
    - Test that face associations survive gallery moves
    - **Validates: Requirements 17.7**

- [x] 20. Integration with Gallery Features
  - [x] 20.1 Add face detection trigger on photo upload
    - Queue detection job when photo uploaded
    - Respect workspace face detection setting
    - _Requirements: 1.1, 14.1_

  - [x] 20.2 Add face tags to lightbox view
    - Display detected faces on photo
    - Show face group names
    - _Requirements: 17.4_

  - [x] 20.3 Add face group filter to download
    - Filter downloadable photos by face groups
    - _Requirements: 17.5_

- [x] 21. Final Checkpoint - Feature Complete
  - Ensure all tests pass
  - Ensure all property tests pass
  - Run integration tests
  - Ask the user if questions arise

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All code must include inline comments explaining business logic
- All errors must have user-friendly messages
