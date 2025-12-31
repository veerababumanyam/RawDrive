# Feature Specification: Save The Date - Digital Invitation System

**Feature Branch**: `016-save-the-date`
**Created**: December 30, 2025
**Status**: Draft
**Input**: User description: "architect, design, enhance digital invitation feature with template-based invitations, RSVP management, QR codes, calendar integration, and guest management for Indian cultural events"

---

## Overview

Save The Date is a comprehensive digital invitation system designed for Indian photographers and event organizers to create, share, and manage beautiful digital invitations for weddings, festivals, and cultural events. The system integrates with RawDrive's existing gallery infrastructure to leverage workspace-scoped assets, share links, and the centralized design system.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Photographer Creates Digital Invitation (Priority: P1)

As a photographer or event planner, I want to create a beautiful digital invitation using a culturally-appropriate template so that I can quickly share it with my client's guests.

**Why this priority**: The core value proposition - without invitation creation, there is no feature. This must work independently for the feature to have any value.

**Independent Test**: Can be tested by navigating to the invitation module, selecting a template, filling in event details, and previewing the invitation. Delivers a complete, shareable invitation.

**Acceptance Scenarios**:

1. **Given** a user is logged into their workspace, **When** they navigate to "Invitations" and click "Create New", **Then** they see a wizard with step-by-step guidance.
2. **Given** the user is on Step 1 (Event Details), **When** they enter event type, title, host names, date, time, and venue, **Then** the system validates and allows progression to Step 2.
3. **Given** the user is on Step 2 (Template Selection), **When** they browse the template gallery, **Then** they see culturally-appropriate templates categorized by event type (wedding, festival, birthday, etc.).
4. **Given** the user selects a template, **When** they customize colors, fonts, and layouts, **Then** they see real-time preview updates.
5. **Given** the user is on Step 3 (Media & Publishing), **When** they upload images (1-10 photos), **Then** the system processes and displays them with options for cover image selection.
6. **Given** all required fields are complete, **When** the user clicks "Publish", **Then** the invitation is published and a unique public URL is generated.

---

### User Story 2 - Guest Views Invitation and RSVPs (Priority: P1)

As a guest receiving an invitation link, I want to view the beautiful invitation and easily RSVP so that the host knows my attendance status.

**Why this priority**: Critical path - invitations only provide value when guests can view and respond. No account required for guests.

**Independent Test**: Can be tested by opening a published invitation URL, viewing content, and submitting an RSVP response without logging in.

**Acceptance Scenarios**:

1. **Given** a guest opens a valid invitation URL, **When** the page loads, **Then** they see the invitation with cover image, event details, countdown timer, and venue information.
2. **Given** the guest views the invitation, **When** they scroll to the RSVP section, **Then** they see a simple form to submit their response.
3. **Given** the guest fills out RSVP form (name, attendance status, guest count), **When** they submit, **Then** they see a confirmation message and receive confirmation via email/phone if provided.
4. **Given** a guest has already RSVPed, **When** they return to the invitation, **Then** they see their previous response with an option to update it.
5. **Given** the invitation has expired (past event date + retention period), **When** a guest opens the URL, **Then** they see a friendly "This event has ended" message.

---

### User Story 3 - Host Manages Guest List and RSVPs (Priority: P1)

As an event host, I want to see all RSVPs in a dashboard with analytics so that I can plan my event effectively.

**Why this priority**: Host visibility into guest responses is essential for event planning and the core value loop.

**Independent Test**: Can be tested by creating an invitation, collecting some RSVPs, and viewing the dashboard with accurate counts and guest details.

**Acceptance Scenarios**:

1. **Given** a host opens their invitation dashboard, **When** RSVPs exist, **Then** they see summary cards showing total responses, attending, not attending, and maybe counts.
2. **Given** the host views the RSVP list, **When** they click on a guest entry, **Then** they see full details (name, contact, status, guest count, message, response date).
3. **Given** multiple RSVPs exist, **When** the host filters by "Attending", **Then** only confirmed attendees are displayed.
4. **Given** the host needs to share the guest list, **When** they click "Export", **Then** they can download as CSV or PDF with all guest details.

---

### User Story 4 - QR Code Generation for Invitations (Priority: P2)

As an event host, I want to generate a QR code for my invitation so that I can include it on printed materials or share it easily.

**Why this priority**: QR codes enhance distribution flexibility but are not required for basic invitation sharing.

**Independent Test**: Can be tested by generating a QR code for a published invitation, downloading it, and scanning to verify it opens the correct invitation.

**Acceptance Scenarios**:

1. **Given** an invitation is published, **When** the host clicks "Generate QR Code", **Then** a QR code is generated that links to the public invitation URL.
2. **Given** the QR code is generated, **When** the host clicks download, **Then** they can choose format (PNG, SVG, PDF) and size.
3. **Given** a guest scans the QR code, **When** the QR reader detects it, **Then** the invitation page opens in their browser.
4. **Given** the host wants branded QR codes, **When** they upload a logo, **Then** the logo is embedded in the center of the QR code.

---

### User Story 5 - Calendar Integration (.ics) (Priority: P2)

As a guest, I want to add the event to my calendar with one click so that I don't forget the event details.

**Why this priority**: Calendar integration significantly improves guest engagement but the invitation remains useful without it.

**Independent Test**: Can be tested by clicking "Add to Calendar" on an invitation and verifying the event appears correctly in Google Calendar, Apple Calendar, or Outlook.

**Acceptance Scenarios**:

1. **Given** a guest views an invitation, **When** they click "Add to Calendar", **Then** a .ics file is downloaded with event details.
2. **Given** the .ics file is imported, **When** the guest opens it, **Then** their calendar shows correct event title, date, time, location, and a link back to the invitation.
3. **Given** the calendar event has a reminder, **When** the reminder triggers (1 day before), **Then** the guest is notified of the upcoming event.
4. **Given** the invitation has a venue with Google Maps link, **When** the .ics is generated, **Then** the location field includes the address and coordinates.

---

### User Story 6 - WhatsApp-Optimized Sharing (Priority: P2)

As an event host, I want my invitation to display beautifully when shared on WhatsApp so that guests are enticed to open it.

**Why this priority**: WhatsApp is the primary sharing channel in India; proper Open Graph optimization significantly increases engagement.

**Independent Test**: Can be tested by sharing an invitation URL on WhatsApp and verifying the preview shows cover image, title, and description correctly.

**Acceptance Scenarios**:

1. **Given** an invitation is published, **When** a host shares the URL on WhatsApp, **Then** WhatsApp displays the cover image, event title, and description as a rich preview.
2. **Given** the cover image exists, **When** WhatsApp fetches the preview, **Then** the image is optimized (1200x630px, <300KB) for fast loading.
3. **Given** the host clicks "Share", **When** they select WhatsApp, **Then** the app opens with pre-filled message including the invitation URL.

---

### User Story 7 - Multi-Language Support (Priority: P2)

As an event host, I want to create invitations in regional languages (Hindi, Tamil, Telugu, etc.) so that guests can read in their preferred language.

**Why this priority**: Regional language support is essential for the Indian market but invitations work in English as default.

**Independent Test**: Can be tested by creating an invitation in Hindi, verifying correct font rendering, and viewing the public page in the selected language.

**Acceptance Scenarios**:

1. **Given** the user is creating an invitation, **When** they select language, **Then** they can choose from supported languages (English, Hindi, Tamil, Telugu, Kannada, Malayalam).
2. **Given** a regional language is selected, **When** the user types event details, **Then** the appropriate regional font is applied automatically.
3. **Given** the invitation is in Hindi, **When** a guest views it, **Then** all UI text and content displays correctly in Hindi with proper Devanagari font rendering.

---

### User Story 8 - Save Draft and Auto-Save (Priority: P3)

As an event host, I want my invitation progress to be automatically saved so that I don't lose work if I navigate away or close the browser.

**Why this priority**: Quality-of-life improvement that prevents data loss but not critical for core functionality.

**Independent Test**: Can be tested by partially filling an invitation, closing the browser, returning, and verifying all data is preserved.

**Acceptance Scenarios**:

1. **Given** a user is creating an invitation, **When** they make changes, **Then** the system auto-saves every 30 seconds.
2. **Given** a user closes the browser mid-creation, **When** they return, **Then** they see their draft in the "Drafts" section.
3. **Given** a user wants to manually save, **When** they click "Save Draft", **Then** the current state is saved immediately with confirmation.
4. **Given** multiple drafts exist, **When** the user views the dashboard, **Then** they see all drafts with last modified date and can resume any.

---

### User Story 9 - Duplicate Invitation (Priority: P3)

As an event host, I want to duplicate an existing invitation so that I can quickly create similar invitations for related events.

**Why this priority**: Productivity enhancement for users with multiple events but not required for core workflow.

**Independent Test**: Can be tested by duplicating an existing invitation and verifying all content is copied except unique identifiers and URLs.

**Acceptance Scenarios**:

1. **Given** an invitation exists (published or draft), **When** the user clicks "Duplicate", **Then** a new draft is created with all content copied.
2. **Given** a duplicate is created, **When** the user views it, **Then** it has a new title suffix ("Copy of...") and no RSVP data.
3. **Given** the duplicate is edited, **When** changes are made, **Then** the original invitation is unaffected.

---

### User Story 10 - RSVP Notification Management (Priority: P3)

As an event host, I want to control how I receive RSVP notifications so that I'm not overwhelmed by individual notifications.

**Why this priority**: Notification preferences improve host experience but the feature works with default notification behavior.

**Independent Test**: Can be tested by configuring notification preferences, collecting RSVPs, and verifying notifications are received according to settings.

**Acceptance Scenarios**:

1. **Given** a host opens invitation settings, **When** they view notification options, **Then** they can choose: immediate email, daily digest, or disabled.
2. **Given** "daily digest" is selected, **When** multiple RSVPs arrive, **Then** the host receives one summary email per day.
3. **Given** "disabled" is selected, **When** RSVPs arrive, **Then** no notifications are sent but data is visible in dashboard.

---

### User Story 11 - Guest Check-In via QR (Priority: P3)

As an event staff member, I want to scan guest QR codes at the venue to track attendance so that I know who has arrived.

**Why this priority**: Event-day check-in extends functionality but the invitation system works fully without it.

**Independent Test**: Can be tested by generating guest QR codes, scanning at the "venue" (test device), and verifying check-in is recorded.

**Acceptance Scenarios**:

1. **Given** a guest has RSVPed "Attending", **When** the host views RSVP list, **Then** they can generate a unique check-in QR code for that guest.
2. **Given** a staff member has the check-in app/page open, **When** they scan a guest's QR code, **Then** the guest is marked as "Checked In" with timestamp.
3. **Given** a guest is scanned twice, **When** the second scan occurs, **Then** the system shows "Already Checked In" (idempotent).
4. **Given** check-ins are happening, **When** the host views the dashboard, **Then** they see real-time count of checked-in guests.

---

### Edge Cases

- What happens when a guest tries to RSVP after the event date?
  - The RSVP form is hidden and a message indicates the event has passed. Viewing remains available during the retention period.

- What happens when invitation URL is accessed after auto-deletion?
  - A friendly 404 page is shown indicating the invitation is no longer available.

- What happens when a guest submits RSVP with invalid data (e.g., guest count of 500)?
  - Validation limits guest count to a reasonable maximum (configurable, default: 20). Values exceeding this require confirmation.

- What happens when network fails during RSVP submission?
  - Error message is displayed with retry option. Partial data is not saved to prevent duplicate submissions.

- What happens when a host deletes an invitation with existing RSVPs?
  - Soft delete is performed. Host can export RSVPs before permanent deletion. RSVP data is retained according to GDPR/DPDP policy.

- What happens when the selected template uses fonts not available on guest's device?
  - Web fonts are loaded from CDN. System fonts are used as fallback. Regional fonts are preloaded for offline reliability.

- What happens when a guest views an invitation on a slow 3G/4G connection?
  - Images are lazy-loaded, thumbnails are served first, and critical content renders within 3 seconds.

---

## Requirements *(mandatory)*

### Functional Requirements

**Invitation Creation & Management:**
- **FR-001**: System MUST provide a step-by-step wizard for invitation creation with three steps: Event Details, Template Selection, and Media/Publishing.
- **FR-002**: System MUST support event types: Wedding, Birthday, Diwali, Holi, Pongal, Onam, Navratri, Anniversary, Baby Shower, and Custom.
- **FR-003**: System MUST require event title, host name(s), and event date/time as mandatory fields.
- **FR-004**: System MUST support venue name, address, and Google Maps integration as optional fields.
- **FR-005**: System MUST persist invitations as drafts until explicitly published.
- **FR-006**: System MUST generate unique, SEO-friendly public URLs upon publishing.
- **FR-007**: System MUST support invitation status: Draft, Published, Archived.

**Template System:**
- **FR-008**: System MUST provide at least 15 pre-built templates at launch categorized by event type and cultural region.
- **FR-009**: System MUST allow customization of colors, fonts, and layout styles.
- **FR-010**: System MUST provide real-time preview during customization.
- **FR-011**: System MUST support regional fonts for Hindi, Tamil, Telugu, Kannada, and Malayalam.
- **FR-012**: System MUST store template customizations per invitation (not modifying base templates).

**Image Management:**
- **FR-013**: System MUST allow upload of 1-10 images per invitation in JPEG, PNG, and WebP formats.
- **FR-014**: System MUST enforce maximum file size of 10MB per image.
- **FR-015**: System MUST generate optimized thumbnails and variants for display.
- **FR-016**: System MUST allow selection of cover image for social sharing previews.

**Public Invitation Page:**
- **FR-017**: System MUST render invitation pages without requiring user login.
- **FR-018**: System MUST include Open Graph meta tags for WhatsApp/social media previews.
- **FR-019**: System MUST display countdown timer to event date.
- **FR-020**: System MUST support optional password protection for private invitations.
- **FR-021**: System MUST load on 4G networks within 3 seconds (critical content visible).

**RSVP Management:**
- **FR-022**: System MUST display RSVP form on published invitation pages.
- **FR-023**: System MUST capture guest name (required) and attendance status (Attending, Not Attending, Maybe).
- **FR-024**: System MUST capture contact (email or phone) with at least one recommended.
- **FR-025**: System MUST allow specifying number of guests attending (default: 1, max: configurable).
- **FR-026**: System MUST allow optional message to host (max 500 characters).
- **FR-027**: System MUST prevent duplicate RSVPs from same identified guest (offer update instead).
- **FR-028**: System MUST send confirmation to guest via provided contact method.
- **FR-029**: System MUST provide host dashboard with summary statistics and detailed RSVP list.
- **FR-030**: System MUST allow filtering and searching RSVPs.
- **FR-031**: System MUST allow exporting RSVPs as CSV and PDF.

**QR Code & Calendar:**
- **FR-032**: System MUST generate QR codes linking to public invitation URL.
- **FR-033**: System MUST support QR code download in PNG, SVG, and PDF formats.
- **FR-034**: System MUST support logo overlay in QR codes with high error correction.
- **FR-035**: System MUST generate .ics calendar files with event details, location, and reminder.
- **FR-036**: System MUST ensure .ics compatibility with Google Calendar, Apple Calendar, and Microsoft Outlook.

**Notifications:**
- **FR-037**: System MUST send email notification to host for new RSVPs (configurable).
- **FR-038**: System MUST support notification options: immediate, daily digest, or disabled.
- **FR-039**: System MUST send 3-day and 1-day warnings before auto-deletion.

**Data Retention & Privacy:**
- **FR-040**: System MUST auto-delete invitations 7 days after event date (default, extendable on paid plans).
- **FR-041**: System MUST delete all associated images, QR codes, and RSVP data upon auto-deletion.
- **FR-042**: System MUST allow host to export data before deletion.
- **FR-043**: System MUST comply with GDPR and DPDP (India) data protection requirements.

**Multi-Language:**
- **FR-044**: System MUST support invitation creation and display in English, Hindi, Tamil, Telugu, Kannada, and Malayalam.
- **FR-045**: System MUST apply appropriate regional fonts based on selected language.
- **FR-046**: System MUST format dates and times according to locale conventions.

**Security & Access Control:**
- **FR-047**: System MUST enforce workspace isolation for all invitation data.
- **FR-048**: System MUST rate-limit public RSVP endpoints (100 views/hour per IP).
- **FR-049**: System MUST protect against XSS, CSRF, and injection attacks.
- **FR-050**: System MUST use Turnstile/CAPTCHA for bot protection on RSVP forms (optional per workspace).

**Accessibility:**
- **FR-051**: System MUST meet WCAG 2.1 AA standards for all invitation pages.
- **FR-052**: System MUST support keyboard navigation for all interactive elements.
- **FR-053**: System MUST provide proper ARIA labels and semantic HTML.
- **FR-054**: System MUST maintain color contrast ratios of 4.5:1 for text.

### Key Entities

- **Invitation**: Core entity representing a digital invitation. Contains event title, type, date/time, venue, host names, language, template reference, customization JSON, cover asset reference, status, public URL slug, and auto-delete date. Workspace-scoped.

- **InvitationTemplate**: Pre-built or custom template with design assets, color schemes, font configurations, layout structure, and supported event types. Can be system-provided (global) or workspace-specific.

- **InvitationImage**: Uploaded image associated with an invitation. Contains storage reference, processing status, order, and cover flag. Links to workspace asset storage.

- **InvitationGuest**: Known guest record for direct invites (optional). Contains name, contact info (email/phone), group assignment, and notes.

- **InvitationRSVP**: Guest response to invitation. Contains guest name, contact, attendance status, guest count, dietary preferences, message, submission timestamp, edit token, and optional link to InvitationGuest.

- **InvitationCheckIn**: Event-day attendance record. Contains guest reference, check-in timestamp, and staff user who performed check-in.

- **InvitationQRCode**: Generated QR code record with format, size, logo reference, and cached storage URL.

- **InvitationDraft**: Auto-saved draft state for in-progress invitation creation. Contains serialized wizard state and last modified timestamp.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete invitation creation (from start to publish) in under 5 minutes.
- **SC-002**: 80% of invitation recipients submit an RSVP response (for invitations with RSVP enabled).
- **SC-003**: RSVP submission completes in under 60 seconds for average guest.
- **SC-004**: Public invitation pages load within 3 seconds on 4G networks (LCP < 2.5s).
- **SC-005**: 75% of guests who view an invitation add the event to their calendar.
- **SC-006**: QR codes scan successfully on first attempt for 95% of users.
- **SC-007**: WhatsApp share preview displays correctly (image, title, description) for 100% of published invitations.
- **SC-008**: Host dashboard accurately reflects total guest count (sum of attending guests across all RSVPs).
- **SC-009**: Export generates correctly formatted files with 100% of data included.
- **SC-010**: Auto-deletion executes successfully for 99% of eligible invitations (< 1% errors).
- **SC-011**: System handles 10,000 concurrent invitation views without degradation.
- **SC-012**: User satisfaction rating of 4.5+ stars for invitation creation experience.

---

## Assumptions

- Invitations are workspace-scoped and leverage existing RawDrive authentication and workspace infrastructure.
- The existing `share_links_access` system will be extended to support invitation sharing (target_type: 'invitation').
- The existing `QRCodeService` will be used for QR code generation.
- The existing notification infrastructure will be used for RSVP notifications.
- Image storage follows existing workspace object key conventions using R2.
- Templates are stored as JSON schema with asset references, allowing runtime customization.
- Guest identification for duplicate detection is primarily by email address.
- Dietary preference options are predefined (vegetarian, vegan, allergies) for initial release.
- RSVP data is retained according to invitation retention policy.
- Hosts can manually add RSVPs for guests who respond offline.

---

## Out of Scope

- AI-powered theme generation (deferred to future release)
- AI-powered text suggestions (deferred to future release)
- Background music playback on invitations
- Animated invitation elements (beyond CSS transitions)
- Ticketing/payments for guests
- Full wedding website builder
- Cross-workspace invitation templates
- RSVP via SMS (only email/phone confirmation)
- Seating chart or table assignment
- Integration with external guest list management tools
- RSVP capacity limits with waitlist
- Multi-event RSVPs (separate response per sub-event within invitation)
- Automated reminder to guests who haven't RSVPed
- Plus-one management separate from guest count

---

## Dependencies

- **share_links_access**: For public URL generation and access control
- **notifications**: For RSVP notifications and host alerts
- **i18n_localization**: For multi-language support and regional formatting
- **magic_links_qr**: For QR code infrastructure
- **content_moderation_abuse**: For Turnstile/rate limiting on public endpoints
- **auth_rbac**: For workspace-scoped permissions
- **observability**: For metrics, logging, and alerting
- **galleries_client_portal**: For design system components and patterns

---

## Integration with Existing Systems

### Share Links Integration
Invitations will register as a `target_type` in the existing `share_links` system:
- `target_type: 'invitation'`
- Policy allows: `view`, `rsvp`
- Password protection uses existing `password_hash` mechanism
- Session tracking uses existing `share_link_sessions`

### Storage Integration
Invitation images follow existing workspace storage patterns:
- Object key: `workspaces/{workspace_id}/invitations/{invitation_id}/images/{filename}`
- Thumbnails generated by existing image processing pipeline
- Cover images optimized for OG preview (1200x630px)

### Notification Integration
RSVP notifications use the existing notification service:
- Topic: `invitation.rsvp`
- Channel: `email` (primary), `in_app` (optional)
- Templates stored in `notification_templates` table

### UI Component Integration
Frontend uses existing design system components:
- `AppButton`, `AppInput`, `AppCard` for forms
- `PhotoGrid` for image gallery
- `Toast` for confirmations
- `Modal` for dialogs
- Color tokens from `frontend/src/index.css`
