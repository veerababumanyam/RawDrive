# Requirements Document

## Introduction

This specification defines the complete authentication, authorization, and infrastructure foundation for RawDrive - a multi-tenant SaaS platform for photographers. The system provides secure identity management, workspace-scoped RBAC, Google OAuth integration, local email/password authentication, and comprehensive platform administration capabilities. The infrastructure includes PostgreSQL with pgvector for AI embeddings, Redis for caching/sessions, and a FastAPI backend with proper multi-tenant isolation.

This foundation supports all subscription tiers (Free, Starter, Professional, Business, Enterprise) with static test users for development and testing purposes.

## Glossary

- **Workspace**: A tenant in the multi-tenant system; all customer data is scoped to a workspace_id
- **Platform Admin**: Administrative users with global platform access (super_admin, support_admin, billing_admin, etc.)
- **Workspace Member**: A user with membership in a specific workspace with assigned roles
- **RBAC**: Role-Based Access Control - permission system based on roles assigned to users
- **JWT**: JSON Web Token - stateless authentication token
- **Refresh Token**: Long-lived token used to obtain new access tokens
- **BYOS**: Bring Your Own Storage - customer-provided cloud storage
- **pgvector**: PostgreSQL extension for vector similarity search (AI embeddings)
- **FastAPI**: Python web framework for building APIs
- **FastMCP**: Model Context Protocol server framework for AI tool integrations
- **MCP**: Model Context Protocol - standard for AI model tool/resource access
- **Argon2id**: Password hashing algorithm (OWASP recommended)

## Requirements

### Requirement 1: Database Infrastructure

**User Story:** As a platform operator, I want a properly configured PostgreSQL database with pgvector extension, so that the system can store user data, workspace data, and AI embeddings efficiently.

#### Acceptance Criteria

1. WHEN the database is initialized THEN the System SHALL create all required tables with proper indexes, foreign keys, and constraints as defined in the data model
2. WHEN a table stores customer data THEN the System SHALL include a workspace_id column with a foreign key constraint to the workspaces table
3. WHEN pgvector extension is enabled THEN the System SHALL support vector similarity search for AI embeddings with proper indexing
4. WHEN database migrations run THEN the System SHALL apply changes in order without data loss and support rollback
5. WHEN the seed script executes THEN the System SHALL create static test users with deterministic UUIDs and the password "Test@123" for all users

### Requirement 2: Redis Infrastructure

**User Story:** As a platform operator, I want Redis configured for session management, caching, and rate limiting, so that the system performs efficiently and securely.

#### Acceptance Criteria

1. WHEN Redis is initialized THEN the System SHALL support session storage with configurable TTL
2. WHEN rate limiting is enabled THEN the System SHALL track request counts per IP and per user with sliding window algorithm
3. WHEN caching is configured THEN the System SHALL cache role/permission lookups with automatic invalidation on updates
4. WHEN a user logs out THEN the System SHALL invalidate all associated tokens in Redis immediately

### Requirement 3: User Authentication - Local Email/Password

**User Story:** As a photographer, I want to sign up and sign in with email and password, so that I can access my workspace without requiring third-party accounts.

#### Acceptance Criteria

1. WHEN a user submits valid signup data THEN the System SHALL create a user account with Argon2id-hashed password and send email verification
2. WHEN a user attempts to sign in with valid credentials THEN the System SHALL issue a JWT access token (15-minute expiry) and refresh token (7-day expiry)
3. WHEN a user attempts to sign in with invalid credentials THEN the System SHALL return an authentication error without revealing whether email or password was incorrect
4. WHEN a user requests password reset THEN the System SHALL send a one-time reset link valid for 24 hours
5. WHEN password validation occurs THEN the System SHALL enforce minimum 10 characters with complexity requirements per security policy

### Requirement 4: User Authentication - Google OAuth

**User Story:** As a photographer, I want to sign in with my Google account, so that I can access RawDrive without creating a separate password.

#### Acceptance Criteria

1. WHEN a user initiates Google OAuth THEN the System SHALL redirect to Google with proper scopes (email, profile) and state parameter
2. WHEN Google callback returns with valid code THEN the System SHALL exchange for tokens, verify email, and create or link user account
3. WHEN a Google user signs in for the first time THEN the System SHALL create a new user and workspace with trial subscription
4. WHEN a Google user has an existing account THEN the System SHALL link the Google identity and allow sign-in via either method
5. WHEN Google OAuth fails THEN the System SHALL return appropriate error without exposing internal details

### Requirement 5: JWT Token Management

**User Story:** As a developer, I want secure JWT token management, so that user sessions are protected and can be properly validated.

#### Acceptance Criteria

1. WHEN an access token is issued THEN the System SHALL include user_id, workspace_id, and permissions in the payload with RS256 signature
2. WHEN an access token expires THEN the System SHALL require refresh token to obtain new access token
3. WHEN a refresh token is used THEN the System SHALL rotate the refresh token and invalidate the old one
4. WHEN a user changes password THEN the System SHALL invalidate all existing refresh tokens for that user
5. WHEN token validation fails THEN the System SHALL return 401 Unauthorized without revealing specific failure reason

### Requirement 6: Workspace Management

**User Story:** As a photographer, I want to create and manage my workspace, so that I can organize my photography business with proper isolation from other users.

#### Acceptance Criteria

1. WHEN a new user signs up THEN the System SHALL create a default workspace with the user as workspace_owner
2. WHEN workspace data is queried THEN the System SHALL filter all results by workspace_id from the authenticated user's token
3. WHEN a workspace is created THEN the System SHALL assign a 30-day trial subscription with Free tier limits
4. WHEN workspace settings are updated THEN the System SHALL verify the user has workspace:write permission
5. WHEN a workspace is disabled THEN the System SHALL prevent all member access while preserving data

### Requirement 7: Role-Based Access Control (RBAC)

**User Story:** As a workspace owner, I want to assign roles to team members, so that I can control what actions they can perform in my workspace.

#### Acceptance Criteria

1. WHEN a workspace is created THEN the System SHALL create default roles (owner, admin, editor, viewer) with predefined permissions
2. WHEN a user makes an API request THEN the System SHALL verify the user has required permission for that endpoint
3. WHEN permissions are checked THEN the System SHALL compute effective permissions from all assigned roles (union)
4. WHEN a role is updated THEN the System SHALL invalidate cached permissions for all members with that role
5. WHEN a custom role is created THEN the System SHALL validate all permissions exist in the allowed permission set

### Requirement 8: Platform Administration

**User Story:** As a super admin, I want to manage platform administrators and their roles, so that I can operate the SaaS platform securely.

#### Acceptance Criteria

1. WHEN a super admin grants a platform role THEN the System SHALL record the action with reason in the audit log
2. WHEN a platform admin accesses workspace data THEN the System SHALL require an active support access session with time limit
3. WHEN a support session is created THEN the System SHALL enforce maximum duration and log all actions performed
4. WHEN a platform admin is disabled THEN the System SHALL immediately revoke all access tokens and sessions
5. WHEN platform admin endpoints are accessed THEN the System SHALL require MFA-backed authentication

### Requirement 9: Subscription Tiers and Limits

**User Story:** As a platform operator, I want to enforce subscription tier limits, so that users are properly restricted based on their plan.

#### Acceptance Criteria

1. WHEN a workspace exceeds storage limit THEN the System SHALL prevent new uploads and notify the workspace owner
2. WHEN a workspace exceeds gallery limit THEN the System SHALL prevent new gallery creation
3. WHEN AI credits are exhausted THEN the System SHALL prevent AI feature usage until next billing cycle or upgrade
4. WHEN checking tier limits THEN the System SHALL use the locked tier specifications (Free: 1GB/3 galleries, Starter: 10GB/10 galleries, Professional: 100GB/50 galleries, Business: 1TB/200 galleries, Enterprise: unlimited)
5. WHEN a trial expires THEN the System SHALL downgrade workspace to read-only mode until subscription is activated

### Requirement 10: Test User Seeding

**User Story:** As a developer, I want static test users for each tier and admin role, so that I can consistently test the system without creating new users each time.

#### Acceptance Criteria

1. WHEN the seed script runs THEN the System SHALL create users with deterministic UUIDs that remain constant across runs
2. WHEN test users are created THEN the System SHALL use the password "Test@123" for all test accounts
3. WHEN tier test users are created THEN the System SHALL create one user per tier (free@test.rawdrive.in, starter@test.rawdrive.in, professional@test.rawdrive.in, business@test.rawdrive.in, enterprise@test.rawdrive.in)
4. WHEN admin test users are created THEN the System SHALL create users for each platform role (superadmin@test.rawdrive.in, platformadmin@test.rawdrive.in, supportadmin@test.rawdrive.in, billingadmin@test.rawdrive.in, contentmod@test.rawdrive.in, securityadmin@test.rawdrive.in, observabilityadmin@test.rawdrive.in, auditor@test.rawdrive.in, productadmin@test.rawdrive.in)
5. WHEN workspace admin test users are created THEN the System SHALL create users for workspace roles (workspaceowner@test.rawdrive.in, workspaceadmin@test.rawdrive.in, staffuser@test.rawdrive.in)

### Requirement 11: Audit Logging

**User Story:** As a security administrator, I want comprehensive audit logging, so that I can track all security-sensitive actions for compliance and investigation.

#### Acceptance Criteria

1. WHEN a user authenticates THEN the System SHALL log the event with user_id, IP address, user agent, and result
2. WHEN a permission-sensitive action occurs THEN the System SHALL log the action with actor, target, and metadata
3. WHEN audit logs are queried THEN the System SHALL filter by workspace_id for workspace-scoped logs
4. WHEN platform admin actions occur THEN the System SHALL log to a separate platform audit log with before/after states
5. WHEN audit logs are stored THEN the System SHALL retain them according to workspace retention policy (minimum 1 year)

### Requirement 12: API Security

**User Story:** As a developer, I want secure API endpoints, so that the system is protected against common attacks.

#### Acceptance Criteria

1. WHEN an API request is received THEN the System SHALL validate the JWT signature and expiry before processing
2. WHEN rate limits are exceeded THEN the System SHALL return 429 Too Many Requests with Retry-After header
3. WHEN input validation fails THEN the System SHALL return 400 Bad Request with field-specific error messages
4. WHEN CORS is configured THEN the System SHALL only allow requests from whitelisted origins
5. WHEN sensitive data is logged THEN the System SHALL mask passwords, tokens, and PII

### Requirement 13: Frontend Authentication Integration

**User Story:** As a frontend developer, I want authentication context and protected routes, so that the React application properly handles user sessions.

#### Acceptance Criteria

1. WHEN a user is not authenticated THEN the System SHALL redirect workspace routes to the sign-in page
2. WHEN authentication state changes THEN the System SHALL update the React context and re-render affected components
3. WHEN an API call returns 401 THEN the System SHALL attempt token refresh before redirecting to sign-in
4. WHEN tokens are stored THEN the System SHALL use httpOnly cookies for refresh tokens and memory for access tokens
5. WHEN the user signs out THEN the System SHALL clear all tokens and redirect to the landing page

### Requirement 14: Multi-Tenant Data Isolation

**User Story:** As a workspace owner, I want my data completely isolated from other workspaces, so that my client photos and business data remain private.

#### Acceptance Criteria

1. WHEN any database query executes THEN the System SHALL include workspace_id filter from the authenticated user's token
2. WHEN a user attempts to access another workspace's resource THEN the System SHALL return 403 Forbidden
3. WHEN object storage keys are generated THEN the System SHALL include workspace_id prefix in the path
4. WHEN cache keys are generated THEN the System SHALL include workspace_id to prevent cross-tenant cache pollution
5. WHEN API responses are generated THEN the System SHALL never include data from other workspaces

### Requirement 15: Health Checks and Monitoring

**User Story:** As a platform operator, I want health check endpoints and monitoring, so that I can ensure the system is running properly.

#### Acceptance Criteria

1. WHEN the health endpoint is called THEN the System SHALL verify database connectivity and return status
2. WHEN the readiness endpoint is called THEN the System SHALL verify all dependencies (PostgreSQL, Redis) are available
3. WHEN metrics are collected THEN the System SHALL expose Prometheus-compatible metrics for auth events
4. WHEN errors occur THEN the System SHALL log structured error information with correlation IDs
5. WHEN performance degrades THEN the System SHALL emit alerts based on configured thresholds

### Requirement 16: Service Port Configuration

**User Story:** As a platform operator, I want non-overlapping port assignments for all services, so that services can run concurrently without conflicts.

#### Acceptance Criteria

1. WHEN services are configured THEN the System SHALL use the following port assignments: PostgreSQL (5432), Redis (6379), FastAPI Backend (8000), Frontend Dev Server (5173), Vite Preview (4173)
2. WHEN Docker containers are started THEN the System SHALL map container ports to host ports without conflicts
3. WHEN environment variables are loaded THEN the System SHALL read port configuration from .env file with sensible defaults
4. WHEN a port conflict is detected THEN the System SHALL log a clear error message indicating which service is conflicting
5. WHEN multiple environments run THEN the System SHALL support port offset configuration for parallel development/testing


### Requirement 17: FastAPI Backend Architecture

**User Story:** As a developer, I want a well-structured FastAPI backend, so that the API is performant, type-safe, and easy to maintain.

#### Acceptance Criteria

1. WHEN the FastAPI application starts THEN the System SHALL initialize with proper dependency injection for database, Redis, and services
2. WHEN API routes are defined THEN the System SHALL use Pydantic models for request/response validation with automatic OpenAPI documentation
3. WHEN async operations are performed THEN the System SHALL use asyncpg for PostgreSQL and aioredis for Redis connections
4. WHEN middleware is configured THEN the System SHALL include CORS, authentication, rate limiting, and request logging middleware
5. WHEN errors occur THEN the System SHALL return consistent error responses with proper HTTP status codes and error schemas

### Requirement 18: FastMCP Integration

**User Story:** As a developer, I want FastMCP server integration, so that AI models can securely access RawDrive tools and resources via the Model Context Protocol.

#### Acceptance Criteria

1. WHEN FastMCP server is initialized THEN the System SHALL expose tools for gallery management, photo operations, and workspace queries
2. WHEN an MCP tool is invoked THEN the System SHALL validate the caller's authentication and workspace permissions before execution
3. WHEN MCP resources are requested THEN the System SHALL return workspace-scoped data respecting multi-tenant isolation
4. WHEN FastMCP tools are defined THEN the System SHALL include proper JSON schemas for input validation and documentation
5. WHEN MCP server runs THEN the System SHALL use a separate port (8001) to avoid conflicts with the main FastAPI server

### Requirement 19: Database Connection Pooling

**User Story:** As a platform operator, I want efficient database connection management, so that the system handles concurrent requests without exhausting connections.

#### Acceptance Criteria

1. WHEN the application starts THEN the System SHALL create an async connection pool with configurable min/max connections
2. WHEN a database operation is performed THEN the System SHALL acquire a connection from the pool and release it after completion
3. WHEN connection pool is exhausted THEN the System SHALL queue requests with timeout rather than failing immediately
4. WHEN a connection becomes stale THEN the System SHALL automatically recycle it based on max_lifetime configuration
5. WHEN the application shuts down THEN the System SHALL gracefully close all pool connections

### Requirement 20: Background Task Processing

**User Story:** As a developer, I want background task processing, so that long-running operations don't block API responses.

#### Acceptance Criteria

1. WHEN a long-running task is triggered THEN the System SHALL enqueue it for background processing and return immediately
2. WHEN background tasks are processed THEN the System SHALL use Redis-backed task queue with retry logic
3. WHEN a task fails THEN the System SHALL retry with exponential backoff up to configured max retries
4. WHEN task status is queried THEN the System SHALL return current state (pending, running, completed, failed)
5. WHEN the worker process starts THEN the System SHALL process tasks from the queue with configurable concurrency


### Requirement 21: Trial Lifecycle Management

**User Story:** As a workspace owner, I want a 30-day trial with clear status and reminders, so that I can evaluate RawDrive before committing to a paid plan.

#### Acceptance Criteria

1. WHEN a new workspace is created THEN the System SHALL start a 30-day trial with Business-equivalent features
2. WHEN trial status is queried THEN the System SHALL return days_remaining, effective_plan, and current limits
3. WHEN trial milestones are reached (day 7, 14, 23, 27, 29) THEN the System SHALL send reminder notifications
4. WHEN trial expires without upgrade THEN the System SHALL transition workspace to read-only mode with grace period
5. WHEN a user upgrades during trial THEN the System SHALL immediately activate the subscription and update entitlements

### Requirement 22: Email Verification

**User Story:** As a platform operator, I want email verification for new accounts, so that users confirm ownership of their email addresses.

#### Acceptance Criteria

1. WHEN a user signs up with email/password THEN the System SHALL send a verification email with a one-time token
2. WHEN the verification link is clicked THEN the System SHALL mark the email as verified and allow full access
3. WHEN an unverified user attempts to access protected features THEN the System SHALL prompt for email verification
4. WHEN verification token expires (24 hours) THEN the System SHALL allow requesting a new verification email
5. WHEN email is changed THEN the System SHALL require re-verification of the new email address

### Requirement 23: Session Management

**User Story:** As a user, I want to manage my active sessions, so that I can secure my account by logging out from other devices.

#### Acceptance Criteria

1. WHEN a user logs in THEN the System SHALL create a session record with device info, IP, and timestamp
2. WHEN a user views active sessions THEN the System SHALL list all sessions with device, location, and last activity
3. WHEN a user terminates a session THEN the System SHALL immediately invalidate that session's tokens
4. WHEN maximum concurrent sessions (5) is exceeded THEN the System SHALL terminate the oldest session
5. WHEN suspicious activity is detected (new location/device) THEN the System SHALL notify the user via email

### Requirement 24: API Versioning

**User Story:** As a developer, I want versioned API endpoints, so that breaking changes don't affect existing integrations.

#### Acceptance Criteria

1. WHEN API routes are defined THEN the System SHALL prefix all routes with /api/v1/
2. WHEN a new API version is released THEN the System SHALL maintain backward compatibility for previous versions
3. WHEN deprecated endpoints are called THEN the System SHALL include deprecation warnings in response headers
4. WHEN API documentation is generated THEN the System SHALL include version information and changelog

### Requirement 25: Environment Configuration

**User Story:** As a developer, I want centralized environment configuration, so that secrets and settings are managed consistently across environments.

#### Acceptance Criteria

1. WHEN the application starts THEN the System SHALL load configuration from environment variables with validation
2. WHEN required configuration is missing THEN the System SHALL fail fast with clear error message
3. WHEN secrets are configured THEN the System SHALL support loading from .env file (development) or environment variables (production)
4. WHEN configuration is accessed THEN the System SHALL use Pydantic Settings for type-safe configuration with defaults
5. WHEN sensitive values are logged THEN the System SHALL mask them in all log output

### Requirement 26: Docker Development Environment

**User Story:** As a developer, I want a Docker Compose setup, so that I can run the full stack locally with one command.

#### Acceptance Criteria

1. WHEN docker-compose up is executed THEN the System SHALL start PostgreSQL, Redis, FastAPI backend, and FastMCP server
2. WHEN containers start THEN the System SHALL wait for dependencies (PostgreSQL, Redis) before starting application services
3. WHEN database container starts THEN the System SHALL run migrations and seed data automatically
4. WHEN code changes are made THEN the System SHALL hot-reload the FastAPI application without container restart
5. WHEN docker-compose down is executed THEN the System SHALL gracefully stop all services and preserve data volumes

### Requirement 27: Error Handling and Validation

**User Story:** As a developer, I want consistent error handling, so that API consumers receive predictable error responses.

#### Acceptance Criteria

1. WHEN validation fails THEN the System SHALL return 422 Unprocessable Entity with field-specific error details
2. WHEN authentication fails THEN the System SHALL return 401 Unauthorized with error code
3. WHEN authorization fails THEN the System SHALL return 403 Forbidden with required permission info
4. WHEN resource is not found THEN the System SHALL return 404 Not Found with resource type
5. WHEN internal error occurs THEN the System SHALL return 500 Internal Server Error with correlation ID (no stack trace in production)

### Requirement 28: Workspace Invitation System

**User Story:** As a workspace owner, I want to invite team members, so that they can collaborate in my workspace with appropriate permissions.

#### Acceptance Criteria

1. WHEN an invitation is sent THEN the System SHALL create a pending membership with assigned roles and send email
2. WHEN invitation link is clicked THEN the System SHALL verify token and prompt for account creation or login
3. WHEN invitation is accepted THEN the System SHALL activate membership and grant assigned permissions
4. WHEN invitation expires (7 days) THEN the System SHALL mark it as expired and require re-invitation
5. WHEN invitation is revoked THEN the System SHALL invalidate the token and prevent acceptance
