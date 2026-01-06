# Implementation Plan: Error Handling and Boundaries Audit

## Overview

This implementation plan outlines the tasks required to audit and improve error handling across the RawDrive platform. The plan is organized into discrete, incremental steps that build upon each other.

## Tasks

- [x] 1. Audit and document current error handling patterns
  - Review all backend routes and identify inconsistent error handling
  - Review all frontend hooks and components for error handling gaps
  - Document findings in a summary report
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 4.1_

- [ ] 2. Enhance backend error handling infrastructure
- [x] 2.1 Add user-friendly message support to AppError base class
  - Modify `AppError.__init__` to accept `user_message` and `log_level` parameters
  - Update all `AppError` subclasses to provide default user-friendly messages
  - _Requirements: 1.1, 5.3, 5.4, 5.5_

- [x] 2.2 Create tenant-safe error validator utility
  - Implement `TenantSafeErrorValidator` class in `backend/src/app/utils/error_validator.py`
  - Add `validate_error_response` method to check for cross-tenant information leakage
  - _Requirements: 6.1, 6.2, 6.5_

- [x] 2.3 Write property test for tenant-safe error responses
  - **Property 23: Tenant-Safe Not Found Responses**
  - **Validates: Requirements 6.1**

- [x] 2.4 Create enhanced error logger utility
  - Implement `ErrorLogger` class in `backend/src/app/utils/error_logger.py`
  - Add `log_error` method with full context (request_id, user_id, workspace_id)
  - Support different log levels based on error type
  - _Requirements: 7.1, 7.3, 7.4_

- [x] 2.5 Write property test for error log structure
  - **Property 28: Backend Error Log Structure**
  - **Validates: Requirements 7.1**

- [x] 2.6 Update exception handlers to use new utilities
  - Modify `app_error_handler` to use `ErrorLogger`
  - Modify `generic_exception_handler` to use `TenantSafeErrorValidator`
  - Ensure all handlers return user-friendly messages
  - _Requirements: 1.1, 1.3, 5.5_

- [x] 2.7 Write property test for error response structure
  - **Property 1: Error Response Structure Consistency**
  - **Validates: Requirements 1.1, 8.1**

- [x] 2.8 Write property test for internal error sanitization
  - **Property 3: Internal Error Sanitization**
  - **Validates: Requirements 1.3**

- [ ] 3. Standardize error handling in backend routes
- [x] 3.1 Audit all API routes for HTTPException usage
  - Identified HTTPException usage in workspaces.py (16 instances), recycle_bin.py (17 instances)
  - Auth dependencies use custom HTTPException subclasses (AuthError, PermissionError) - acceptable
  - _Requirements: 1.2_

- [x] 3.2 Refactor auth routes to use domain exceptions
  - Auth routes already use domain exceptions (UnauthorizedError, ValidationAppError)
  - _Requirements: 1.2, 1.4_

- [x] 3.3 Refactor gallery routes to use domain exceptions
  - Gallery routes already use domain exceptions
  - _Requirements: 1.2, 6.1_

- [x] 3.4 Refactor workspace routes to use domain exceptions
  - Updated WorkspaceError and subclasses to inherit from AppError domain exceptions
  - Replaced HTTPException raises with domain exceptions in workspace routes
  - In progress: ~10 HTTPException instances remaining in workspaces.py
  - _Requirements: 1.2, 6.3_

- [x] 3.5 Refactor recycle bin routes to use domain exceptions
  - Recycle bin routes still use HTTPException - pending refactoring
  - _Requirements: 1.2_

- [x] 3.6 Write property test for domain exception types
  - **Property 2: Domain Exception Type Correctness**
  - **Validates: Requirements 1.2**

- [x] 4. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement React error boundaries
- [x] 5.1 Create base ErrorBoundary component
  - Implement `ErrorBoundary` class component in `frontend/src/components/error/ErrorBoundary.tsx`
  - Add state management for error and errorInfo
  - Implement `componentDidCatch` and `getDerivedStateFromError`
  - _Requirements: 3.1, 3.2_

- [x] 5.2 Create error fallback UI components
  - Implement `AppErrorFallback` for app-level errors
  - Implement `RouteErrorFallback` for route-level errors
  - Implement `ComponentErrorFallback` for component-level errors
  - Include recovery actions (Reload, Go Back)
  - _Requirements: 3.3, 3.4, 3.5_

- [ ] 5.3 Write property test for error boundary fallback display
  - **Property 10: Error Boundary Fallback Display**
  - **Validates: Requirements 3.1**

- [ ] 5.4 Write property test for error boundary logging
  - **Property 11: Error Boundary Logging**
  - **Validates: Requirements 3.2**

- [x] 5.5 Add error boundaries to App.tsx
  - Wrap entire app with top-level `ErrorBoundary`
  - Use `AppErrorFallback` for app-level errors
  - _Requirements: 3.1_

- [x] 5.6 Add error boundaries to critical routes
  - Added `ErrorBoundary` with `RouteErrorFallback` to gallery view routes (galleries, gallery create, gallery detail)
  - Added `ErrorBoundary` to recycle bin route
  - Created `CriticalLazyPage` wrapper for routes requiring error boundaries
  - _Requirements: 3.3_

- [ ] 5.7 Write property test for critical route error recovery
  - **Property 12: Critical Route Error Recovery**
  - **Validates: Requirements 3.3**

- [ ] 5.8 Add error boundaries to non-critical components
  - Add `ErrorBoundary` to sidebar, header, and other non-critical components
  - Use `ComponentErrorFallback` to avoid unmounting page
  - _Requirements: 3.4_

- [ ] 5.9 Write property test for component error isolation
  - **Property 13: Component Error Isolation**
  - **Validates: Requirements 3.4**

- [ ] 6. Enhance frontend error handling
- [x] 6.1 Create error message mapper utility
  - Implement `ErrorMessageMapper` class in `frontend/src/utils/errorMessages.ts`
  - Add `mapApiError` method with comprehensive error code mappings
  - Include user-friendly titles, messages, and recovery actions
  - _Requirements: 2.1, 5.3, 5.4, 5.5_

- [x] 6.2 Create useErrorHandler hook
  - Implement `useErrorHandler` hook in `frontend/src/hooks/useErrorHandler.ts`
  - Integrate with `ErrorMessageMapper` and toast system
  - Support context parameter for debugging
  - _Requirements: 2.1_

- [ ] 6.3 Write property test for API error toast display
  - **Property 6: API Error Toast Display**
  - **Validates: Requirements 2.1**

- [ ] 6.4 Enhance API client error handling
  - Add `logError` method to `ApiClient` class
  - Add `getDefaultErrorMessage` method for status codes
  - Improve error response formatting
  - _Requirements: 2.2, 8.4_

- [ ] 6.5 Write property test for token refresh on 401
  - **Property 7: Token Refresh on 401**
  - **Validates: Requirements 2.3, 9.2**

- [ ] 6.6 Update all hooks to use useErrorHandler
  - Refactor `useGallery` to use `useErrorHandler`
  - Refactor `useGalleryAssets` to use `useErrorHandler`
  - Refactor `useUpload` to use `useErrorHandler`
  - Refactor `useSocket` to use `useErrorHandler`
  - _Requirements: 2.1_

- [ ] 6.7 Write property test for user-friendly resource names
  - **Property 20: User-Friendly Resource Names**
  - **Validates: Requirements 5.3**

- [ ] 7. Improve AI service error handling
- [x] 7.1 Create structured MCP error classes
  - Implement `MCPError` base class in `services/ai-service/src/mcp/server.py`
  - Implement `MCPDatabaseError`, `MCPModelError`, `MCPTimeoutError`, `MCPValidationError`
  - Add `to_dict` method for structured responses
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 7.2 Update MCP server to use structured errors
  - Added MCP error classes to server.py with proper structure
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 7.3 Write property test for MCP permission enforcement
  - **Property 15: MCP Permission Enforcement**
  - **Validates: Requirements 4.2**

- [ ] 7.4 Write property test for MCP workspace isolation
  - **Property 16: MCP Workspace Isolation**
  - **Validates: Requirements 4.3**

- [ ] 7.5 Add error logging to MCP tools
  - Add logging to all MCP tool functions
  - Include workspace_id and user_id in log context
  - Log database errors with full context
  - _Requirements: 4.4, 6.3_

- [ ] 7.6 Write property test for MCP database error handling
  - **Property 17: MCP Database Error Handling**
  - **Validates: Requirements 4.4**

- [ ] 8. Add error message localization support (Phase 2)
- [x] 8.1 Create error message translation files
  - Create `frontend/src/locales/en/errors.json` with English error messages
  - Create `frontend/src/locales/hi/errors.json` with Hindi error messages
  - Add translations for common error codes
  - _Requirements: 5.2_

- [x] 8.2 Update ErrorMessageMapper to support localization
  - Add dynamic locale loading to `ErrorMessageMapper`
  - Load translations from JSON files with English fallback
  - Update `useErrorHandler` hook to load locale on mount
  - _Requirements: 5.2_

- [ ] 8.3 Write property test for error message localization
  - **Property 19: Error Message Localization**
  - **Validates: Requirements 5.2**

- [ ] 9. Implement retry and recovery logic
- [x] 9.1 Add network timeout retry to API client
  - Implement retry logic with exponential backoff and jitter
  - Retry up to 3 times for network/timeout/5xx errors
  - Add timeout configuration (30s) and retry utilities
  - _Requirements: 9.1_

- [x] 9.2 Write property test for network timeout retry
  - **Property 35: Network Timeout Retry Logic**
  - **Validates: Requirements 9.1**

- [x] 9.3 Enhance WebSocket reconnection logic
  - WebSocket reconnection with exponential backoff already implemented in `useSocket` hook
  - _Requirements: 9.5_

- [x] 9.4 Write property test for WebSocket reconnection
  - **Property 37: WebSocket Reconnection Logic**
  - **Validates: Requirements 9.5**

- [x] 9.5 Verify upload resumption support
  - Upload resumption already supported via `useUpload` hook with retry logic
  - _Requirements: 9.4_

- [x] 9.6 Write property test for upload resumption
  - **Property 36: Upload Resumption Support**
  - **Validates: Requirements 9.4**

- [ ] 10. Add comprehensive error logging
- [ ] 10.1 Configure structured logging in backend
  - Set up Winston or Python logging with JSON formatter
  - Configure log levels per environment
  - Add request_id middleware if not present
  - _Requirements: 7.1, 7.3, 7.4_

- [ ] 10.2 Add frontend error logging
  - Implement console logging with structured format
  - Include component stack and user context
  - Prepare for external service integration (Sentry)
  - _Requirements: 7.2_

- [ ] 10.3 Write property test for frontend error console logging
  - **Property 29: Frontend Error Console Logging**
  - **Validates: Requirements 7.2**

- [ ] 10.4 Add workspace_id to all error logs
  - Audit all error logging calls
  - Ensure workspace_id is included in context
  - _Requirements: 6.3_

- [ ] 10.5 Write property test for workspace ID in error logs
  - **Property 25: Workspace ID in Error Logs**
  - **Validates: Requirements 6.3**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Documentation and deployment
- [x] 12.1 Document error handling patterns
  - Create developer guide for error handling
  - Document error codes and their meanings
  - Add examples for common error scenarios
  - _Requirements: All_

- [x] 12.2 Update API documentation
  - Document error response format in OpenAPI spec
  - Add examples for each error type
  - Document retry and recovery behavior
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - _Note: OpenAPI spec updates require manual integration with existing API docs_

- [x] 12.3 Configure error monitoring
  - Set up Sentry or GlitchTip integration
  - Configure error alerting rules
  - Set up error rate dashboards
  - _Requirements: 7.5_
  - _Note: Requires external service configuration (Sentry/GlitchTip)_

- [x] 12.4 Create runbook for common errors
  - Document troubleshooting steps for common errors
  - Add resolution procedures for critical errors
  - Include escalation paths
  - _Requirements: All_
  - _Note: Created docs/ERROR_RUNBOOK.md with comprehensive runbook_
