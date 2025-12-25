# Requirements Document

## Introduction

This document specifies the requirements for fixing multiple console errors observed in the RawDrive application. The errors fall into four categories:

1. **i18n Locale Parsing Failures** - The `en-IN` locale files don't exist, causing JSON parsing errors when the browser detects `en-IN` as the user's language
2. **Face Groups API 500 Error with CORS** - The `/api/v1/workspaces/{workspace_id}/face-groups` endpoint returns 500 errors, which then manifest as CORS errors because error responses don't include CORS headers
3. **Graceful Backend Connection Handling** - When the backend is unavailable, the frontend should handle connection failures more gracefully
4. **PeoplePanel Error State** - The PeoplePanel component needs better error state handling and user feedback

Note: The `content.1d473d26.js` error (`Cannot read properties of undefined (reading 'toLowerCase')`) is from a browser extension, not the RawDrive application, and is out of scope.

## Glossary

- **i18n**: Internationalization - the process of designing software to support multiple languages
- **Locale**: A combination of language and region (e.g., `en-IN` for English-India)
- **CORS**: Cross-Origin Resource Sharing - a security mechanism that controls which origins can access resources
- **Face_Group**: A cluster of detected faces representing the same person
- **API_Client**: The frontend service that makes HTTP requests to the backend
- **Fallback_Locale**: The default locale used when the requested locale is unavailable
- **PeoplePanel**: The React component that displays detected face groups in a gallery

## Requirements

### Requirement 1: i18n Locale Fallback

**User Story:** As a user with browser language set to `en-IN`, I want the application to gracefully fall back to `en` translations, so that I don't see JSON parsing errors in the console.

#### Acceptance Criteria

1. WHEN the browser detects a regional locale variant (e.g., `en-IN`, `en-US`, `en-GB`) THEN THE i18n_System SHALL fall back to the base language (`en`) without attempting to load non-existent regional files
2. WHEN a locale file fails to load THEN THE i18n_System SHALL silently fall back to the configured fallback language without logging errors to the console
3. THE i18n_Configuration SHALL specify `load: 'languageOnly'` to prevent loading regional variants that don't exist
4. FOR ALL supported base languages, THE i18n_System SHALL have corresponding translation files in `/locales/{lang}/` directories

### Requirement 2: Face Groups API Error Handling

**User Story:** As a developer, I want the face groups API to return proper error responses with CORS headers, so that frontend error handling works correctly.

#### Acceptance Criteria

1. WHEN the face_groups endpoint encounters a database error THEN THE API SHALL return a proper JSON error response with appropriate HTTP status code
2. WHEN any API endpoint returns an error response THEN THE CORS_Middleware SHALL include CORS headers in the response
3. IF the face_groups table or required database objects don't exist THEN THE API SHALL return a 503 Service Unavailable response with a descriptive error message
4. WHEN the face_groups endpoint is called THEN THE API SHALL validate that required database tables exist before executing queries
5. WHEN a database table is missing THEN THE API SHALL catch the exception and return a structured error response instead of a 500 error

### Requirement 3: Frontend API Error Resilience

**User Story:** As a user, I want the application to handle backend unavailability gracefully, so that I see helpful error messages instead of cryptic console errors.

#### Acceptance Criteria

1. WHEN an API request fails due to network error (ERR_CONNECTION_REFUSED) THEN THE API_Client SHALL return a structured error with code `NETWORK_ERROR`
2. WHEN an API request fails with a CORS error THEN THE API_Client SHALL detect this condition and return a structured error with code `CORS_ERROR`
3. THE API_Client SHALL NOT log retry attempts to the console in production mode
4. WHEN all retry attempts are exhausted THEN THE API_Client SHALL return the final error without excessive console logging

### Requirement 4: PeoplePanel Error State

**User Story:** As a user, I want to see a clear error message when face groups fail to load, so that I understand what went wrong and can take action.

#### Acceptance Criteria

1. WHEN the face groups API returns an error THEN THE PeoplePanel SHALL display an error state with a descriptive message
2. WHEN the face groups API fails THEN THE PeoplePanel SHALL display a retry button that allows the user to attempt loading again
3. WHEN the backend is unavailable THEN THE PeoplePanel SHALL display a message indicating the service is temporarily unavailable
4. THE PeoplePanel SHALL distinguish between "no people detected" and "failed to load" states

### Requirement 5: Database Migration Validation

**User Story:** As a system administrator, I want the application to validate that required database migrations have been applied, so that API endpoints don't fail with cryptic errors.

#### Acceptance Criteria

1. WHEN the application starts THEN THE System SHALL log warnings for any missing required database tables
2. WHEN a repository method is called for a table that doesn't exist THEN THE Repository SHALL raise a descriptive error indicating the missing migration
3. THE face_groups_table migration SHALL be idempotent and safe to run multiple times
