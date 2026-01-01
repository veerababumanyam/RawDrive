# Feature Specification: Digital Invitations Microservice Production Readiness

**Feature Branch**: `018-invitations-production-readiness`
**Created**: 2026-01-01
**Status**: Draft
**Input**: User description: "Fix all identified issues in Digital Invitations Microservice for production readiness: security fixes (XSS, token leakage, PII logging), implement RSVP endpoints, analytics queries, bulk invite integration, add observability (structured logging, request tracing, metrics), and improve maintainability (workspace guard, email provider abstraction)"

## Overview

The Digital Invitations Microservice has been built and functionally tested but requires critical security fixes, complete implementation of placeholder endpoints, and production-grade observability before deployment. This specification addresses all identified gaps from the code review to achieve SOC2/GDPR compliance and production readiness.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure Guest Invitation Emails (Priority: P0)

Event organizers send personalized email invitations to guests. The system must prevent any security vulnerabilities when rendering guest names and invitation URLs in email templates, ensuring no malicious content can be injected.

**Why this priority**: Security vulnerabilities (XSS) could allow attackers to inject malicious scripts into emails, potentially compromising guest devices or phishing for credentials. This is a critical security risk that must be fixed before any production use.

**Independent Test**: Can be tested by sending an invitation email to a test address with a guest name containing HTML/script tags (e.g., `<script>alert('xss')</script>`) and verifying the email renders the content safely escaped.

**Acceptance Scenarios**:

1. **Given** a guest with name `<script>alert('xss')</script>John`, **When** an invitation email is sent, **Then** the email displays the name literally as text without executing any scripts
2. **Given** an invitation URL containing special characters, **When** the email is generated, **Then** the URL is properly encoded and remains functional
3. **Given** any user-provided content in email templates, **When** emails are sent, **Then** all content is HTML-escaped to prevent injection attacks

---

### User Story 2 - GDPR-Compliant Error Handling (Priority: P0)

System administrators and operators reviewing logs must not be able to see personally identifiable information (PII) such as email addresses, names, or phone numbers. Authentication errors must not reveal implementation details that could aid attackers.

**Why this priority**: GDPR Article 5(1)(f) requires appropriate security of personal data. Logging PII violates data protection principles and creates compliance risk. Error message leakage aids attackers in understanding system internals.

**Independent Test**: Can be tested by triggering authentication errors and verifying error responses contain only generic messages, and by checking log output to confirm no email addresses or personal names appear.

**Acceptance Scenarios**:

1. **Given** an invalid authentication token, **When** the user attempts to access a protected endpoint, **Then** the error message says "Authentication failed" without revealing token details
2. **Given** an expired token, **When** authentication fails, **Then** the response contains a generic error without exposing expiration details
3. **Given** any system operation involving guests, **When** events are logged, **Then** only anonymized identifiers (guest_id, workspace_id) appear in logs, never email addresses or names

---

### User Story 3 - Guest RSVP Submission (Priority: P1)

Wedding guests receive an invitation link and can submit their RSVP response indicating whether they will attend, how many plus-ones they're bringing, and any dietary restrictions.

**Why this priority**: RSVP functionality is the core value proposition of the invitations feature. Without working RSVP, the entire microservice serves no practical purpose.

**Independent Test**: Can be tested by accessing a public invitation URL and submitting an RSVP response, then verifying the response is persisted and visible to the event organizer.

**Acceptance Scenarios**:

1. **Given** a valid public invitation link, **When** a guest submits "Yes" with 2 plus-ones and dietary restriction "vegetarian", **Then** the RSVP is saved and the guest receives a confirmation with an edit token
2. **Given** an existing RSVP, **When** the guest uses their edit token to change from "Yes" to "No", **Then** the response is updated and the organizer sees the change
3. **Given** a guest without an edit token, **When** they attempt to modify an RSVP, **Then** they are denied access with a clear error message
4. **Given** 100 guests submitting RSVPs simultaneously, **When** all submissions complete, **Then** all responses are correctly saved without data loss

---

### User Story 4 - Invitation Analytics Dashboard (Priority: P1)

Event organizers view real-time analytics showing how many guests have viewed their invitation, RSVP response rates, device breakdown (mobile vs desktop), and trends over time.

**Why this priority**: Analytics help organizers understand guest engagement and plan accordingly. This completes the feature set for production use.

**Independent Test**: Can be tested by having multiple test guests view an invitation and submit RSVPs, then verifying the organizer dashboard shows accurate counts and breakdowns.

**Acceptance Scenarios**:

1. **Given** an invitation viewed by 50 unique visitors, **When** the organizer accesses analytics, **Then** they see "50 unique visitors" with accurate view counts
2. **Given** 30 RSVPs (20 yes, 8 no, 2 maybe), **When** viewing RSVP statistics, **Then** the dashboard shows correct counts and a 60% response rate
3. **Given** views from both mobile and desktop devices, **When** viewing device breakdown, **Then** accurate percentages are displayed for each device type
4. **Given** high traffic, **When** analytics are frequently accessed, **Then** cached data is returned within 1 second, refreshing every 10 minutes

---

### User Story 5 - Bulk Email Invitations (Priority: P1)

Event organizers send email invitations to hundreds of guests at once, with the system handling queuing, delivery, and failure tracking.

**Why this priority**: Manual invitation sending is tedious for large guest lists. Bulk operations enable practical use of the system for real events.

**Independent Test**: Can be tested by uploading a CSV with 50 test email addresses and triggering bulk invite, then verifying all emails are queued and delivery status is trackable.

**Acceptance Scenarios**:

1. **Given** 100 guests in a pending state, **When** the organizer triggers bulk invite, **Then** all 100 invitations are queued for delivery and status shows "sending"
2. **Given** 5 invalid email addresses in the bulk send, **When** sending completes, **Then** the result shows 95 sent, 5 failed, with specific error details
3. **Given** a temporary email service outage, **When** sends fail, **Then** the system automatically retries with exponential backoff up to 3 times
4. **Given** bulk send in progress, **When** the organizer views status, **Then** they see real-time progress (e.g., "75 of 100 sent")

---

### User Story 6 - Audit Trail for Compliance (Priority: P2)

Compliance officers and system administrators can review an immutable audit log of all sensitive operations including guest data access, modifications, deletions, and bulk operations.

**Why this priority**: SOC2 and GDPR require audit trails for data access and modifications. This is mandatory for enterprise customers with compliance requirements.

**Independent Test**: Can be tested by performing guest CRUD operations and CSV imports, then querying the audit log to verify all operations were recorded with timestamps and actor identities.

**Acceptance Scenarios**:

1. **Given** an organizer deletes a guest, **When** the audit log is queried, **Then** an entry exists showing who deleted what and when
2. **Given** a CSV import of 50 guests, **When** the operation completes, **Then** the audit log shows the import event with batch ID and count
3. **Given** multiple workspaces, **When** querying audit logs, **Then** each workspace sees only its own audit events

---

### User Story 7 - System Observability (Priority: P2)

Operations teams monitor system health through structured logs with correlation IDs, metrics dashboards, and distributed tracing to diagnose issues quickly.

**Why this priority**: Production systems require observability to diagnose issues, measure performance, and ensure reliability. Without this, incident response is severely hampered.

**Independent Test**: Can be tested by making API requests and verifying logs contain JSON format with correlation IDs, and that metrics endpoints expose request counts and latencies.

**Acceptance Scenarios**:

1. **Given** any API request, **When** processed, **Then** all log entries contain a correlation ID that can be used to trace the request end-to-end
2. **Given** a metrics endpoint, **When** scraped, **Then** it exposes request counts, error rates, and latency percentiles per endpoint
3. **Given** a failed request, **When** investigating, **Then** operators can find all related log entries using the correlation ID within 30 seconds

---

### User Story 8 - Resilient External Service Integration (Priority: P3)

The system gracefully handles failures of external dependencies (email service, database, cache) without crashing and recovers automatically when services return.

**Why this priority**: Production systems must be resilient to partial failures. However, basic functionality must work first.

**Independent Test**: Can be tested by simulating Redis downtime and verifying the system continues to serve requests (with degraded caching) without errors.

**Acceptance Scenarios**:

1. **Given** Redis is unavailable, **When** a guest list is requested, **Then** the system serves data directly from the database with a warning logged
2. **Given** the email service returns errors, **When** bulk sending, **Then** the circuit breaker opens after 5 consecutive failures and auto-recovers after 60 seconds
3. **Given** degraded mode, **When** viewing system status, **Then** the health endpoint reflects which components are degraded

---

### Edge Cases

- What happens when a guest submits an RSVP for an expired invitation? System should reject with clear "invitation closed" message.
- How does the system handle duplicate RSVP submissions from the same email? System should update existing RSVP rather than create duplicate.
- What happens when bulk invite is triggered with 0 eligible guests? System should return success with "0 invitations sent" message.
- How does analytics handle time zones? All timestamps should be stored in UTC and converted to user's timezone for display.
- What happens when Redis cache corruption occurs? System should fall back to database and log cache inconsistency warning.

## Requirements *(mandatory)*

### Functional Requirements

**Security (P0)**

- **FR-001**: System MUST HTML-escape all user-provided content before inserting into email templates
- **FR-002**: System MUST NOT expose internal error details (exception messages, stack traces, token contents) in HTTP responses to clients
- **FR-003**: System MUST NOT log personally identifiable information (email addresses, names, phone numbers) in application logs
- **FR-004**: System MUST use only anonymized identifiers (UUIDs) in log entries for user and guest references

**RSVP Functionality (P1)**

- **FR-005**: System MUST accept public RSVP submissions containing: response status (yes/no/maybe), plus-one count (0-10), dietary restrictions, and optional message
- **FR-006**: System MUST generate a unique edit token when an RSVP is created, allowing the guest to modify their response
- **FR-007**: System MUST validate edit tokens before allowing RSVP modifications
- **FR-008**: System MUST persist RSVP responses with timestamps and update guest status accordingly
- **FR-009**: System MUST rate-limit RSVP submissions to 10 per minute per IP address

**Analytics (P1)**

- **FR-010**: System MUST track invitation view events including: timestamp, visitor fingerprint (hashed), device type, browser
- **FR-011**: System MUST calculate and return RSVP statistics: total guests, responded count, attending/not-attending/maybe counts, response rate percentage
- **FR-012**: System MUST calculate and return view statistics: total views, unique visitors, views by time period (day/week/month)
- **FR-013**: System MUST cache analytics results for 10 minutes to reduce database load

**Bulk Operations (P1)**

- **FR-014**: System MUST integrate bulk invite endpoint with email worker queue
- **FR-015**: System MUST fetch guest email and name from database before queuing email task
- **FR-016**: System MUST track individual email send status (queued/sent/failed) per guest
- **FR-017**: System MUST return bulk operation results including: total queued, successful, failed, and error details

**Audit Logging (P2)**

- **FR-018**: System MUST log all data modification events (create, update, delete) to an audit trail
- **FR-019**: Audit log entries MUST include: timestamp, actor (user_id), action type, resource type, resource ID, workspace ID
- **FR-020**: Audit logs MUST be append-only and not modifiable by application code
- **FR-021**: System MUST log all bulk operations with batch identifiers

**Observability (P2)**

- **FR-022**: System MUST output logs in structured JSON format compatible with log aggregation systems
- **FR-023**: System MUST generate a unique correlation ID for each request and include it in all log entries
- **FR-024**: System MUST expose metrics endpoint with: request count, error count, latency histogram, active connections
- **FR-025**: System MUST propagate correlation IDs to background workers

**Maintainability (P3)**

- **FR-026**: System MUST implement a reusable authorization guard that validates workspace access
- **FR-027**: System MUST abstract email sending behind a provider interface supporting multiple implementations
- **FR-028**: System MUST optimize bulk invite to batch-fetch guest data rather than individual queries

**Resilience (P3)**

- **FR-029**: System MUST implement circuit breaker pattern for email service calls
- **FR-030**: System MUST continue serving requests when cache is unavailable, falling back to database
- **FR-031**: Health endpoint MUST report degraded status when optional components (cache) are unavailable

### Key Entities

- **RSVP Response**: Guest's attendance decision including status (yes/no/maybe), plus-one count, dietary notes, message, edit token, timestamps
- **Invitation View**: Record of a visit to public invitation page including hashed visitor ID, device type, browser, timestamp
- **Audit Event**: Immutable record of system action including actor, action type, resource, timestamp, workspace context
- **Email Send Status**: Tracking record for individual email including guest reference, status (queued/sent/failed), error details, retry count

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Security & Compliance**

- **SC-001**: Zero XSS vulnerabilities detectable by automated security scanners
- **SC-002**: Zero PII (emails, names, phones) appearing in application log output during normal operation
- **SC-003**: All error responses return generic messages with no internal implementation details exposed

**Functionality**

- **SC-004**: 99.9% of RSVP submissions complete successfully under normal load
- **SC-005**: RSVP response time is under 500ms at the 95th percentile
- **SC-006**: Analytics dashboard loads within 2 seconds with cached data
- **SC-007**: Bulk invite of 500 guests completes queuing within 30 seconds

**Observability**

- **SC-008**: 100% of requests have traceable correlation IDs in logs
- **SC-009**: Operators can find all log entries for a request using correlation ID within 30 seconds
- **SC-010**: Metrics endpoint responds with current statistics within 100ms

**Resilience**

- **SC-011**: System continues to serve RSVP submissions when cache is unavailable
- **SC-012**: Email circuit breaker prevents cascade failures during email service outages
- **SC-013**: System recovers automatically when failed dependencies become available

**Audit & Compliance**

- **SC-014**: All guest data modifications are recorded in audit log within 1 second of occurrence
- **SC-015**: Audit log retention meets compliance requirements (minimum 1 year)

## Assumptions

1. The existing database schema for `invitation_guests` and related tables is sufficient; no new tables are needed except for audit logs and view tracking
2. SendGrid will remain the primary email provider; the abstraction layer will support adding alternatives but only SendGrid needs implementation initially
3. Redis is available for rate limiting and caching; graceful degradation means serving without cache, not implementing alternative caching
4. The main RawDrive backend handles user authentication; this microservice trusts authenticated headers
5. JSON logging is sufficient for log aggregation; specific field mappings can be configured in the log shipper
6. Standard web application performance targets apply unless specified otherwise

## Dependencies

- SendGrid API for email delivery (existing)
- Redis for caching and rate limiting (existing)
- PostgreSQL for data persistence (existing)
- Main RawDrive backend for authentication headers (existing)

## Out of Scope

- Alternative email providers (SES, Mailgun) - abstraction will support them but only SendGrid implemented
- Real-time WebSocket updates for analytics
- Advanced analytics (funnel analysis, cohort analysis)
- GDPR data export/deletion automation (handled by main backend)
- Multi-language email templates
- SMS/WhatsApp invitation delivery
