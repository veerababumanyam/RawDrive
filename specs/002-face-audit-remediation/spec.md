# Feature Specification: Face Detection Audit Remediation

**Feature Branch**: `002-face-audit-remediation`
**Created**: 2026-01-21
**Status**: Draft
**Input**: Address security, compliance, and performance findings from FACEID_SERVICE_AUDIT_2026-01-21

## Overview

This specification addresses the open findings from the Face Detection System Security & Architecture Audit (AUDIT-FACE-2026-01-21). The audit rated the system 8.5/10 overall with specific gaps identified in rate limiting, biometric consent tracking, error message handling, data retention policy, and caching. This remediation work will close these gaps to achieve full production readiness and compliance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Biometric Consent Management (Priority: P1)

Workspace owners and their team members need explicit control over face detection processing to comply with GDPR Article 9 requirements for biometric data. Users must provide clear consent before any face detection occurs, and they must be able to revoke that consent at any time.

**Why this priority**: GDPR compliance is mandatory for EU operations. Biometric data processing without explicit consent exposes the platform to significant regulatory penalties (up to 4% annual revenue or 20M EUR). This is the highest business risk finding.

**Independent Test**: Can be fully tested by enabling/disabling face detection consent in workspace settings and verifying that detection operations are blocked when consent is not granted.

**Acceptance Scenarios**:

1. **Given** a workspace with face detection consent disabled, **When** a user attempts to trigger face detection on a gallery, **Then** the system blocks the operation and displays a message explaining consent is required.
2. **Given** a workspace owner viewing workspace settings, **When** they enable face detection consent, **Then** the system records consent timestamp, user who consented, and IP address.
3. **Given** a workspace with face detection enabled, **When** the workspace owner revokes consent, **Then** all existing face embeddings for that workspace are scheduled for deletion and new detections are blocked.
4. **Given** a user browsing a public gallery with face search, **When** they use the FaceDiscovery feature, **Then** they see a clear privacy notice before proceeding and must acknowledge it.

---

### User Story 2 - Rate Limiting for Face Operations (Priority: P2)

Platform operators need to protect system resources from abuse and control AI provider costs. Face detection operations are compute-intensive and expensive, requiring dedicated rate limits separate from general API limits.

**Why this priority**: Without dedicated rate limits, malicious or unintentional abuse can cause resource exhaustion and significant AI provider costs. This is a medium security risk (SEC-001) that impacts availability and cost.

**Independent Test**: Can be tested by sending requests at various rates to face endpoints and verifying throttling occurs at the specified limits.

**Acceptance Scenarios**:

1. **Given** a user making rapid face similarity search requests, **When** they exceed 20 requests per second, **Then** subsequent requests receive HTTP 429 responses with retry-after headers.
2. **Given** a user triggering bulk face detection, **When** they exceed the per-workspace detection quota (configurable, default 1000/day), **Then** the system rejects additional triggers until the quota resets.
3. **Given** multiple workspaces making face API requests, **When** system load is high, **Then** each workspace is throttled independently without affecting others.

---

### User Story 3 - Generic Error Messages (Priority: P3)

Security teams need to prevent information leakage through error messages. Currently, face IDs are exposed in error messages, which could allow attackers to enumerate face existence across workspaces.

**Why this priority**: This is a low-severity security finding (SEC-002) that prevents information disclosure but has limited attack surface due to workspace isolation already in place.

**Independent Test**: Can be tested by requesting non-existent or unauthorized face IDs and verifying error messages do not reveal the face ID.

**Acceptance Scenarios**:

1. **Given** a user requesting a face by ID that doesn't exist, **When** the API returns a 404 error, **Then** the error message says "Face not found" without including the face ID.
2. **Given** a user requesting a face from another workspace, **When** the API returns a 404 error, **Then** the error message is identical to the non-existent case (no workspace leak).
3. **Given** any face group operation that fails, **When** the error is returned to the client, **Then** internal identifiers are not exposed in the error detail.

---

### User Story 4 - Face Data Retention Policy (Priority: P4)

Compliance officers need a documented and enforced data retention policy for face embeddings to meet SOC2 and GDPR requirements. The policy must define how long embeddings are retained and when they are automatically purged.

**Why this priority**: This is a compliance documentation finding (COM-002) that addresses audit trail and data lifecycle requirements. Lower priority as it's primarily documentation with a background cleanup process.

**Independent Test**: Can be tested by configuring retention periods and verifying embeddings older than the retention period are automatically purged.

**Acceptance Scenarios**:

1. **Given** a workspace with a configured 2-year retention policy, **When** face embeddings exceed 2 years old, **Then** they are automatically deleted during the nightly cleanup job.
2. **Given** a workspace admin viewing data settings, **When** they access retention configuration, **Then** they see current retention period and can modify it within platform limits.
3. **Given** embeddings scheduled for retention deletion, **When** the cleanup job runs, **Then** an audit log entry records the deletion with count and reason.

---

### User Story 5 - Face Group Query Caching (Priority: P5)

Users viewing galleries with face tagging need fast, responsive load times. Popular galleries generate repeated identical queries for face groups that can be served from cache.

**Why this priority**: This is a performance optimization (PERF-001) that improves user experience but is not a functional blocker. The system works correctly without it.

**Independent Test**: Can be tested by querying face groups multiple times and measuring response time improvement and database query reduction.

**Acceptance Scenarios**:

1. **Given** a user loading a gallery with face groups, **When** the same query is made within 2 minutes, **Then** the response is served from cache without hitting the database.
2. **Given** a cached face group query, **When** a user modifies face groups (merge, split, rename), **Then** the cache is invalidated and the next query fetches fresh data.
3. **Given** a high-traffic gallery, **When** multiple users request face groups simultaneously, **Then** only the first request hits the database and others are served from cache.

---

### Edge Cases

- What happens when a workspace revokes consent mid-detection job? The job completes processing already-queued items but marks them for deletion, and no new items are processed.
- What happens when rate limits are hit during a bulk operation? The operation pauses and retries with exponential backoff, providing progress feedback to the user.
- What happens when cached face groups are requested for a deleted gallery? The cache returns a miss and the database query correctly returns empty/404.
- What happens when retention deletion encounters locked/in-use embeddings? The deletion is retried in the next cleanup cycle, logged as deferred.

## Requirements *(mandatory)*

### Functional Requirements

**Biometric Consent (COM-001)**
- **FR-001**: System MUST track explicit consent for face detection processing at the workspace level, recording timestamp, consenting user, and IP address.
- **FR-002**: System MUST block all face detection operations when workspace consent is not granted, returning a clear message.
- **FR-003**: System MUST provide workspace owners with the ability to revoke face detection consent at any time.
- **FR-004**: System MUST cascade delete all face embeddings within 72 hours when consent is revoked.
- **FR-005**: System MUST display a privacy notice to public gallery visitors before face search, requiring acknowledgment.

**Rate Limiting (SEC-001)**
- **FR-006**: System MUST enforce dedicated rate limits for face similarity search operations (default: 20 requests/second per workspace).
- **FR-007**: System MUST enforce daily detection quotas per workspace (configurable, default: 1000 detections/day).
- **FR-008**: System MUST return HTTP 429 responses with Retry-After headers when rate limits are exceeded.
- **FR-009**: System MUST track rate limit metrics for monitoring and alerting.

**Generic Error Messages (SEC-002)**
- **FR-010**: System MUST NOT expose internal identifiers (face IDs, group IDs) in error messages returned to clients.
- **FR-011**: System MUST return consistent error messages regardless of whether a resource doesn't exist or is unauthorized.

**Data Retention (COM-002)**
- **FR-012**: System MUST enforce a configurable retention period for face embeddings (default: platform maximum, 7 years).
- **FR-013**: System MUST automatically delete embeddings exceeding the retention period via scheduled cleanup.
- **FR-014**: System MUST log all retention-based deletions to the audit trail with count and workspace context.

**Caching (PERF-001)**
- **FR-015**: System MUST cache face group query results with a configurable TTL (default: 2 minutes).
- **FR-016**: System MUST invalidate relevant cache entries when face groups are modified.
- **FR-017**: System MUST serve cached responses for identical queries within the TTL.

### Key Entities

- **WorkspaceFaceConsent**: Tracks consent status, timestamp, consenting user, IP address, and revocation history for a workspace's face detection processing.
- **FaceRateLimitConfig**: Per-workspace rate limit settings including requests/second limits and daily quotas.
- **FaceRetentionPolicy**: Workspace-level configuration for embedding retention period with audit trail of changes.
- **FaceGroupCache**: Cached face group query results with workspace/gallery scope and TTL-based expiration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of face detection operations are blocked when workspace consent is not granted.
- **SC-002**: Consent grant/revoke operations complete within 3 seconds with full audit trail recorded.
- **SC-003**: Face embeddings are deleted within 72 hours of consent revocation (measurable via audit logs).
- **SC-004**: Rate-limited requests receive HTTP 429 within 100ms of limit breach detection.
- **SC-005**: Zero face IDs or internal identifiers appear in any client-facing error responses.
- **SC-006**: Face group queries for repeated requests show 90%+ cache hit rate in production.
- **SC-007**: Cached face group queries return within 50ms (vs 200-500ms uncached).
- **SC-008**: Retention cleanup job processes all eligible embeddings with zero failures per run.

## Assumptions

- The existing `face-worker` container and async job infrastructure will be used for consent revocation cascade deletion.
- Redis is available and configured for caching (already used for rate limiting elsewhere in the platform).
- Traefik middleware supports route-specific rate limit configuration.
- The audit service infrastructure supports the new event types for consent and retention logging.
- Workspace settings UI already exists and can accommodate new consent and retention configuration panels.

## Out of Scope

- Changes to the face detection algorithms or AI providers.
- Frontend FaceDiscovery component modifications (beyond privacy notice acknowledgment).
- Migration of face detection to a dedicated microservice (architecture remains as-is per audit finding that current setup is "Excellent").
- Changes to face embedding dimensions or vector search index configuration.
- User-level consent (consent is at workspace level per current architecture).
