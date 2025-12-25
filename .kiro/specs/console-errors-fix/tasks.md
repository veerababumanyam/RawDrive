# Implementation Plan: Console Errors Fix

## Overview

This implementation plan addresses multiple console errors by fixing i18n locale fallback, backend API error handling, and frontend component error states. The tasks are organized to fix the most impactful issues first.

## Tasks

- [ ] 1. Fix i18n locale fallback configuration
  - [ ] 1.1 Update i18next configuration to use `load: 'languageOnly'`
    - Add `load: 'languageOnly'` option to prevent loading regional variants
    - Add `supportedLngs` array with all supported base languages
    - Add `nonExplicitSupportedLngs: true` for graceful fallback
    - Reduce debug logging in production mode
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 1.2 Write unit test for i18n configuration
    - Verify `load` option is set to 'languageOnly'
    - Verify `fallbackLng` is set to 'en'
    - Verify all supported languages are listed
    - _Requirements: 1.3, 1.4_

- [ ] 2. Fix backend face groups API error handling
  - [ ] 2.1 Add database error handling to face groups endpoint
    - Import `UndefinedTableError` from asyncpg
    - Wrap database operations in try-catch
    - Return 503 with structured error for missing tables
    - Return 500 with structured error for other database errors
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [ ] 2.2 Add exception handler for database errors in FastAPI
    - Create exception handler for `UndefinedTableError`
    - Ensure error responses include proper JSON structure
    - Log errors with appropriate severity
    - _Requirements: 2.1, 2.5_

  - [ ] 2.3 Write property test for API error responses
    - **Property 2: API Error Responses Include CORS Headers**
    - **Validates: Requirements 2.1, 2.2**

- [ ] 3. Checkpoint - Verify backend error handling
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Improve frontend API client error handling
  - [ ] 4.1 Add specific error codes to API client
    - Add `CORS_ERROR` detection for CORS failures
    - Improve `NETWORK_ERROR` detection
    - Add `SERVICE_UNAVAILABLE` code for 503 responses
    - _Requirements: 3.1, 3.2_

  - [ ] 4.2 Reduce console logging in production
    - Wrap retry logging in development mode check
    - Remove excessive error logging for expected failures
    - Keep error logging for unexpected failures
    - _Requirements: 3.3, 3.4_

  - [ ] 4.3 Write unit tests for API client error handling
    - Test network error returns `NETWORK_ERROR` code
    - Test 503 response returns `SERVICE_UNAVAILABLE` code
    - Test retry logging is suppressed in production
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Add error state to PeoplePanel component
  - [ ] 5.1 Add error state and error UI to PeoplePanel
    - Add `error` and `errorCode` state variables
    - Create error state UI with descriptive message
    - Add retry button that calls `fetchGroups`
    - Show different messages for different error types
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 5.2 Distinguish between empty and error states
    - Update conditional rendering to check error state first
    - Show "No people detected" only when loading succeeded with empty results
    - Show error message when loading failed
    - _Requirements: 4.4_

  - [ ] 5.3 Write unit tests for PeoplePanel error states
    - Test error state renders error message
    - Test retry button is present in error state
    - Test empty state vs error state differentiation
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 6. Checkpoint - Verify frontend error handling
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Verify database migrations
  - [ ] 7.1 Verify face_groups table migration exists and is idempotent
    - Check migration file uses `IF NOT EXISTS` clauses
    - Verify migration can be run multiple times safely
    - _Requirements: 5.3_

  - [ ] 7.2 Write property test for migration idempotency
    - **Property 3: Migration Idempotency**
    - **Validates: Requirements 5.3**

- [ ] 8. Final checkpoint - End-to-end verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify console errors are resolved in browser

## Notes

- All tasks are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
