# Feature Specification: Invitation RSVP System Hardening

**Feature Branch**: `020-invitation-rsvp-hardening`
**Created**: 2026-01-03
**Status**: Draft
**Input**: Fix security issues and implement missing features for invitation RSVP system including workspace isolation, audit logging, email notifications, and duplicate prevention

## Executive Summary

This feature addresses critical security vulnerabilities and missing functionality in the Invitation RSVP system identified through code review. The system allows photographers to create digital wedding invitations and collect guest RSVPs. Current issues include cross-workspace data access risks, missing compliance logging, race conditions in duplicate detection, and unimplemented email notifications.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure RSVP Submission (Priority: P1)

A wedding guest receives an invitation link from the photographer. They click the link and submit their RSVP with their name, email, attendance status, and optional guest count. The system ensures their data is only accessible to the photographer who created the invitation and prevents duplicate submissions from the same email address.

**Why this priority**: Core functionality that must be secure and reliable. Data breaches or duplicate RSVPs would severely impact trust and usability.

**Independent Test**: Can be tested by submitting an RSVP through a public invitation link and verifying the data appears only in the correct workspace dashboard.

**Acceptance Scenarios**:

1. **Given** a guest accesses a valid invitation link, **When** they submit their RSVP with a unique email, **Then** the RSVP is recorded and a confirmation is displayed
2. **Given** a guest has already submitted an RSVP for an invitation, **When** they attempt to submit again with the same email, **Then** the system rejects the submission with a clear message explaining they have already RSVP'd
3. **Given** a guest submits an RSVP, **When** the system processes the request, **Then** the RSVP data is only visible to users with access to that specific workspace
4. **Given** two guests submit RSVPs with the same email simultaneously, **When** both requests are processed, **Then** only one RSVP is created and the other receives a duplicate error

---

### User Story 2 - RSVP Confirmation & Edit Notifications (Priority: P2)

After submitting an RSVP, the guest receives a confirmation email with a secure link to edit their response. If the invitation is about to be automatically deleted, guests who have RSVP'd receive advance warning notifications.

**Why this priority**: Email notifications are essential for guest communication and preventing data loss surprises, but the system can function without them in emergency situations.

**Independent Test**: Submit an RSVP and verify confirmation email is received within 5 minutes with working edit link.

**Acceptance Scenarios**:

1. **Given** a guest submits an RSVP, **When** the submission is successful, **Then** a confirmation email is sent within 5 minutes containing their RSVP details and an edit link
2. **Given** a guest clicks the edit link in their confirmation email, **When** they access the link, **Then** they can view and modify their existing RSVP
3. **Given** an invitation is scheduled for automatic deletion, **When** the deletion date is 7 days away, **Then** all guests who RSVP'd receive a warning email
4. **Given** an invitation is scheduled for automatic deletion, **When** the deletion date is 24 hours away, **Then** all guests receive a final warning email

---

### User Story 3 - RSVP Management Dashboard (Priority: P2)

The photographer (invitation owner) can view all RSVPs for their invitation in a dashboard. They can export the guest list, see attendance statistics, and manage individual responses.

**Why this priority**: Essential for photographers to use the RSVP data they collect, enabling them to plan seating and catering.

**Independent Test**: Create an invitation, collect RSVPs, and verify the dashboard displays accurate statistics and allows CSV export.

**Acceptance Scenarios**:

1. **Given** a photographer opens their invitation dashboard, **When** there are RSVPs recorded, **Then** they see a list of all responses with name, email, status, and guest count
2. **Given** a photographer wants to export guest data, **When** they click the export button, **Then** they receive a downloadable file with all RSVP data
3. **Given** a photographer views RSVP statistics, **When** RSVPs exist, **Then** they see total confirmed, declined, and pending counts
4. **Given** a photographer accesses another workspace's invitation dashboard, **When** they attempt to view it, **Then** access is denied with an appropriate error

---

### User Story 4 - Compliance Audit Trail (Priority: P2)

All significant actions on invitations and RSVPs are recorded in an audit log for compliance and security purposes. This includes creation, updates, deletions, and access attempts.

**Why this priority**: Required for SOC 2 compliance and security incident investigation. Must be implemented alongside security fixes.

**Independent Test**: Perform RSVP operations and verify corresponding audit entries are created with correct timestamps and context.

**Acceptance Scenarios**:

1. **Given** a guest submits an RSVP, **When** the submission completes, **Then** an audit entry is created recording the action, invitation ID, and timestamp
2. **Given** a guest updates their RSVP, **When** the update completes, **Then** an audit entry records the change with before/after values
3. **Given** a photographer deletes an RSVP, **When** the deletion completes, **Then** an audit entry records who deleted it and when
4. **Given** someone attempts to access an invitation without permission, **When** the access is denied, **Then** an audit entry records the failed attempt

---

### User Story 5 - Error Recovery for Dashboard (Priority: P3)

If the RSVP dashboard encounters an error while loading, the system gracefully handles it with a clear error message and recovery options rather than crashing the entire page.

**Why this priority**: Improves user experience and system resilience, but less critical than core functionality.

**Independent Test**: Simulate a loading error and verify the error boundary displays with a retry option.

**Acceptance Scenarios**:

1. **Given** the dashboard encounters a loading error, **When** the error occurs, **Then** an error message displays with a "Try Again" button
2. **Given** an error boundary is triggered, **When** the user clicks "Try Again", **Then** the component attempts to reload

---

### User Story 6 - PDF Guest List Export (Priority: P3)

Photographers can export their RSVP guest list as a formatted PDF document suitable for printing and sharing with vendors.

**Why this priority**: Nice-to-have feature that enhances the product but is not essential for core functionality.

**Independent Test**: Click PDF export and verify a properly formatted PDF downloads with guest information.

**Acceptance Scenarios**:

1. **Given** a photographer has collected RSVPs, **When** they click "Export PDF", **Then** a PDF document downloads with the guest list
2. **Given** the PDF is generated, **When** opened, **Then** it displays guest names, email, attendance status, and guest count in a readable format

---

### Edge Cases

- What happens when an invitation link is accessed after the event date? (Display "This invitation has expired" message)
- What happens when a guest tries to edit their RSVP after the edit deadline? (Display "Editing is no longer available" message)
- How does the system handle special characters in guest names? (Sanitize and allow Unicode characters)
- What if the email service is temporarily unavailable? (Queue emails for retry, don't block RSVP submission)
- What happens if two photographers share the same workspace? (Both see all invitations and RSVPs for that workspace)

**Expected Behaviors for Edge Cases**

- Expired invitations: Public RSVP endpoint returns an "invitation expired" response; UI shows a friendly message without exposing IDs.
- Post-deadline edits: Edit-link requests after the deadline return "editing is no longer available"; existing RSVP remains unchanged.
- Email outages: RSVP submission remains successful; emails are enqueued for retry with backoff and surfaced in audit/ops logs without exposing PII.

## Requirements *(mandatory)*

### Functional Requirements

**Workspace Isolation & Security**

- **FR-001**: System MUST ensure all RSVP data queries include workspace isolation to prevent cross-workspace data access
- **FR-002**: System MUST validate workspace ownership before allowing any RSVP read, update, or delete operation
- **FR-003**: System MUST prevent guest record lookups without proper workspace context

**Duplicate Prevention**

- **FR-004**: System MUST prevent duplicate RSVP submissions from the same email address for a given invitation
- **FR-005**: System MUST handle simultaneous submission attempts atomically to prevent race conditions
- **FR-006**: System MUST provide clear error messaging when a duplicate submission is detected

**Privacy & Logging**

- **FR-007**: System MUST NOT log personally identifiable information (email addresses, names) in application logs
- **FR-008**: System MUST log all RSVP-related operations to the audit trail (create, update, delete)
- **FR-009**: System MUST log all invitation lifecycle events (create, publish, delete) to the audit trail
- **FR-010**: System MUST record failed access attempts for security monitoring

**Email Notifications**

- **FR-011**: System MUST send confirmation emails to guests after successful RSVP submission
- **FR-012**: System MUST include a secure edit link in confirmation emails
- **FR-013**: System MUST send warning emails before automatic invitation deletion (7 days and 24 hours prior)
- **FR-014**: System MUST queue emails for retry if the email service is temporarily unavailable

**Dashboard & Export**

- **FR-015**: System MUST display RSVP statistics (total, confirmed, declined, pending) on the dashboard
- **FR-016**: System MUST allow export of RSVP data to CSV format
- **FR-017**: System MUST allow export of RSVP data to PDF format
- **FR-018**: System MUST implement error boundaries to gracefully handle dashboard loading failures

**Performance**

- **FR-019**: System MUST support efficient view deduplication to prevent duplicate analytics counts

### Key Entities

- **Invitation**: A digital wedding invitation created by a photographer within a workspace. Contains event details, design settings, and publication status.
- **RSVP**: A guest response to an invitation. Contains guest name, email, attendance status (confirmed/declined/maybe), guest count, dietary preferences, and timestamps.
- **Edit Token**: A secure, time-limited token allowing a guest to modify their existing RSVP without authentication.
- **Audit Event**: A record of a significant action (create, update, delete, access) on an invitation or RSVP for compliance purposes.
- **View Record**: Analytics data tracking unique invitation views, deduplicated by visitor fingerprint within a time window.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero cross-workspace data access incidents after deployment (security audit passes)
- **SC-002**: Duplicate RSVP attempts are correctly rejected 100% of the time, including simultaneous submissions
- **SC-003**: 95% of RSVP confirmation emails are delivered within 5 minutes of submission
- **SC-004**: All RSVP operations generate corresponding audit log entries (100% coverage)
- **SC-005**: Dashboard error recovery works correctly, allowing users to retry failed loads
- **SC-006**: Guest list CSV export completes within 5 seconds for invitations with up to 500 RSVPs
- **SC-007**: PDF export feature is functional and generates properly formatted documents
- **SC-008**: Auto-deletion warning emails are sent on schedule (7 days and 24 hours before deletion)
- **SC-009**: No personally identifiable information appears in application log files
- **SC-010**: System handles 100 simultaneous RSVP submissions without data corruption or race conditions

## Dependencies & Assumptions

### Dependencies

- Existing invitation system infrastructure
- Email service integration (SendGrid, SES, or equivalent)
- Audit logging service
- Workspace-based authentication and authorization system
- Existing backend implementation is FastAPI (Python), noted as a variance from the constitution's Express+TypeScript standard; reconciled in plan and implementation strategy.

### Assumptions

- The existing invitation creation and publishing flows work correctly
- Workspaces are the primary tenant isolation boundary (not individual users)
- Standard web application session security is in place
- Email templates for confirmation and warning messages exist or will be created
- The PDF generation approach will be determined during implementation planning
- Audit retention period follows existing platform policies (assumed 1 year minimum)

## Out of Scope

- Changes to invitation design/creation workflow
- New invitation templates or themes
- Guest-to-guest communication features
- Integration with external calendar services
- Payment/billing changes
- Changes to invitation pricing or limits
