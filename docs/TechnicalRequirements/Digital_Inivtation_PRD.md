# RawDrive Digital Invitations PRD
## Product Requirements Document for India-First Digital Invitation Creation and Sharing

> Status: Updated draft
> Last updated: 2026-04-06
> Version: 2.0
> Owners: Product, Growth, Platform Engineering

---

## 1. Product Overview

RawDrive Digital Invitations is a digital invitation platform for Indian weddings, festivals, birthdays, and event-driven businesses. It lets creators build personalized invitations in under 2 minutes, apply culturally relevant templates, upload and enhance photos, generate QR codes and calendar files, publish WhatsApp-friendly public links, track RSVPs, and manage analytics without relying on printed cards.

The product is designed for Indian sharing behavior first:

- mobile-first interaction
- WhatsApp-friendly previews and URLs
- multilingual invitation content
- 4G-conscious performance
- privacy-safe RSVP collection
- automatic post-event deletion for DPDP and GDPR alignment

### 1.1 Business Objective

The business goal is to replace expensive, slow, print-heavy invitations with fast, premium, shareable digital experiences that:

- increase creator adoption through a free basic tier
- drive premium upgrades through advanced templates, AI media tools, branding, and analytics
- strengthen RawDrive's photo and media ecosystem
- improve RSVP completion through simple QR and calendar flows
- create a reusable invitation surface for weddings, festivals, birthdays, and studio-led event workflows

### 1.2 Success Metrics

| Metric | Target | Notes |
| --- | --- | --- |
| Invitation creation time | Under 2 minutes median | From first input to publish |
| Public invitation load time | Under 3 seconds on typical Indian 4G | Public page only |
| RSVP completion rate | 80% for published invites with RSVP enabled | Measured per invitation |
| Calendar add rate | 50% of unique QR or calendar CTA users | Phase 1 realistic target |
| Monthly invitation volume | 100,000 invitations per month | Platform-level scale target |
| Auto-deletion success rate | 99% successful purge jobs | Includes media and RSVP PII |
| Premium conversion | 8% of active invitation creators | Driven by templates, AI, branding |

---

## 2. What Already Exists

RawDrive already has a meaningful invitation foundation in the current workspace.

### 2.1 Existing Codebase Baseline

- Backend invitation domain exists in `backend/internal/domain/invitation/` with create, list, get, publish, cancel, and RSVP support.
- Backend route registration exists in `backend/internal/server/router.go` for authenticated invitation CRUD and unauthenticated RSVP submission.
- Database tables already exist in `backend/migrations/012_m3_revenue_expansion.sql` as `digital_invitations` and `invitation_rsvps`.
- Frontend invitation workspace and public pages already exist in `frontend/src/pages/workspace/InvitationsPage.tsx` and `frontend/src/pages/public/PublicInvitationPage.tsx`.
- Frontend service and type contracts in `frontend/src/services/invitationService.ts` and `frontend/src/types/invitations.ts` already model a broader invitation system including templates, media, slug-based access, password or PIN protection, ICS downloads, and analytics.
- Basic E2E smoke coverage already exists in `e2e/bookings-invitations-team.spec.ts` and `e2e/public-gallery-sharing.spec.ts`.

### 2.2 Current Gaps

The current backend implementation is behind the richer frontend contract. The following capabilities are still incomplete or not clearly wired end to end:

- slug-based public invitation retrieval
- password and PIN protected invitation access
- template management APIs
- invitation image upload and AI processing pipelines
- QR asset generation and scan analytics
- downloadable ICS calendar files
- invitation-specific analytics aggregation
- reminder notifications
- scheduled export and auto-deletion workflow
- admin moderation and template governance

### 2.3 Implementation Alignment Note

This PRD is intentionally capability-focused, not framework-locked. Earlier notes referenced Laravel 11 and Next.js, but the current RawDrive workspace is grounded in Go on the backend and React plus Vite on the frontend. The product requirements below should be implemented using existing RawDrive architecture and conventions unless platform leadership intentionally changes that stack.

---

## 3. Scope

### 3.1 In Scope for First Release

- 3-step invitation creation wizard
- regional and event-specific template catalog
- multilingual invitation content and regional typography support
- image upload with validation, optimization, and queued AI enhancements
- public invitation pages with WhatsApp-friendly metadata
- QR code and ICS calendar asset generation
- RSVP capture, edit flow, creator dashboard, and CSV export
- view, scan, and RSVP analytics
- creator reminder notifications
- password protection and expiry controls
- auto-deletion with export-before-purge flow
- admin template and moderation capabilities

### 3.2 Out of Scope for First Release

- full video invitation editing and delivery
- UPI gifting, shagun, or payment collection
- live guest chat or messaging inside invite pages
- ticketing, seating, or access control systems
- deep marketplace workflows beyond template upsell
- two-way Google Calendar sync

### 3.3 User Roles

**Creator**
Builds invitations, customizes themes, uploads images, publishes links, monitors RSVPs, exports responses, and receives reminders.

**Guest**
Views the public invitation, scans QR codes, downloads calendar files, submits or edits RSVP, and browses invitation photos.

**Admin**
Reviews flagged invitations, manages template inventory, controls premium template availability, and monitors usage and deletion compliance.

---

## 4. Core User Journeys

### Journey 1: Creator creates and publishes an invitation

1. Creator selects event type and template.
2. Creator enters event details and host information.
3. Creator uploads images and optionally enables AI enhancements.
4. Creator previews the invitation on mobile and desktop breakpoints.
5. Creator publishes the invitation and receives a public URL, QR code, and calendar asset.

### Journey 2: Guest views and responds

1. Guest receives a WhatsApp or email link.
2. Guest opens the public invitation page or scans the QR code.
3. Guest views event details, photos, and countdown.
4. Guest adds the event to a calendar and submits RSVP.
5. Guest optionally reopens the edit link to change response before the deadline.

### Journey 3: Creator monitors attendance

1. Creator opens the invitation dashboard.
2. Creator reviews view count, QR scans, RSVP breakdown, and recent responses.
3. Creator filters responses, exports CSV, and sends or schedules reminders.

### Journey 4: Admin governs templates and safety

1. Admin reviews template inventory and usage.
2. Admin disables abusive or low-quality content.
3. Admin reviews moderation and deletion compliance dashboards.

### Journey 5: System deletes expired invitation data

1. System warns creator 3 days and 1 day before purge.
2. Creator exports RSVP and analytics if needed.
3. System deletes invitation media and personal response data after expiry.
4. System retains only non-identifiable aggregate analytics for reporting.

---

## 5. Functional Requirements

### FR-INV-001: 3-Step Invitation Creation Wizard

**As a** Creator
**I want** a guided invitation creation flow
**So that** I can build and publish an invitation quickly without using design software

**Depends on:** None

**Acceptance Criteria:**

- Given an authenticated creator, when they start a new invitation, then the product must present exactly three primary steps: Event details, Template customization, and Media plus publish.
- Given a creator chooses an event type, then launch options must include wedding, festival, birthday, corporate, and custom.
- Given a creator leaves a required field blank, when they try to continue, then the wizard must block progression and show field-level validation.
- Given a creator loses connectivity during editing, when they return on the same device within 24 hours, then the most recent draft must be recoverable.
- Given a creator completes the minimum required fields, when they publish, then the invitation must be persisted with a unique ID and public slug.

### FR-INV-002: Template Catalog and Visual Customization

**As a** Creator
**I want** culturally relevant templates and simple customization controls
**So that** the invitation feels premium and locally appropriate

**Depends on:** FR-INV-001

**Acceptance Criteria:**

- Given a creator opens template selection, then the catalog must include at least 15 launch templates across weddings, festivals, birthdays, and corporate events.
- Given a creator chooses a regional wedding template, then the system must support at minimum Telugu, Tamil, and North Indian wedding styles at launch.
- Given a creator chooses a festival template, then the system must support at minimum Diwali, Holi, Pongal, and Onam themed variants at launch.
- Given a creator edits a template, then they must be able to adjust colors, typography, layout density, background treatment, and basic entrance animation settings.
- Given a free-tier creator selects a premium-only template, then the system must show the premium lock state before publish and offer a non-blocking upgrade path.

### FR-INV-003: Multilingual Content and Typography

**As a** Creator
**I want** multilingual invitation support
**So that** I can invite guests in the languages they actually use

**Depends on:** FR-INV-001, FR-INV-002

**Acceptance Criteria:**

- Given a creator configures language settings, then the invitation must support English, Hindi, Tamil, Telugu, Kannada, and Malayalam at launch.
- Given a creator enters bilingual content, then the public invitation must render both languages without broken glyphs or layout overlap.
- Given a language uses a regional script, then only compatible fonts may be shown in the font picker for that script.
- Given no secondary language is configured, then the invitation must gracefully fall back to the primary language only.

### FR-INV-004: Invitation Media Upload and AI Enhancement

**As a** Creator
**I want** to upload and improve invitation images
**So that** the invitation looks polished on mobile sharing surfaces

**Depends on:** FR-INV-001

**Acceptance Criteria:**

- Given a creator uploads files, then the system must accept 1 to 10 images in JPEG, PNG, or WebP format up to 10 MB each.
- Given an image fails validation, then the UI must explain the failure before upload completes.
- Given images are accepted, then the system must generate optimized variants suitable for hero, gallery, thumbnail, and social preview use.
- Given AI enhancement options are enabled, then processing must run asynchronously and expose a visible status of pending, processing, completed, or failed.
- Given a guest opens the public invitation on mobile, then gallery images must lazy load and open in a lightbox without blocking the initial event details render.

### FR-INV-005: Publishing, Access Control, and Shareable Public URLs

**As a** Creator
**I want** a secure public invitation link with optional protection
**So that** I can share widely without losing control over access

**Depends on:** FR-INV-001, FR-INV-002, FR-INV-003

**Acceptance Criteria:**

- Given a creator publishes an invitation, then the system must generate a public URL in the form `/i/{slug}` or equivalent RawDrive route.
- Given a creator enables password protection, then guests must be challenged before invitation content is revealed.
- Given a creator sets an expiry, then public access must stop after expiry and show an expired state instead of the live invitation.
- Given a public invitation is shared on WhatsApp or similar platforms, then the generated metadata must include title, description, and preview image suitable for social cards.

### FR-INV-006: Public Invitation Experience

**As a** Guest
**I want** a mobile-friendly invitation page
**So that** I can quickly understand the event and respond

**Depends on:** FR-INV-004, FR-INV-005

**Acceptance Criteria:**

- Given a guest opens a valid invitation link, then the page must show event hero media, title, hosts, date, venue, and RSVP action without requiring sign-in.
- Given the invitation has future timing, then the public page must show a countdown or equivalent upcoming-event signal.
- Given the invitation includes a gallery, then guests must be able to browse images without breaking the core RSVP flow.
- Given scripts or advanced enhancements fail, then guests must still be able to read core event details and access the RSVP entry point.

### FR-INV-007: QR Code and Calendar Asset Generation

**As a** Creator
**I want** branded QR codes and calendar files
**So that** guests can scan once and save the event quickly

**Depends on:** FR-INV-005

**Acceptance Criteria:**

- Given an invitation is published, then the system must generate at least one QR code for the public invitation and one calendar asset for the event.
- Given the creator downloads a QR asset, then the system must provide print-safe PNG and SVG outputs.
- Given a guest downloads or opens the ICS file, then it must contain event title, start date, timezone, venue, reminder, and public invitation URL.
- Given an Indian event is created without a custom timezone, then the default event timezone must be `Asia/Kolkata`.
- Given a guest scans a QR code on a supported mobile device, then the system must route them to the most appropriate invitation or calendar action and provide a web fallback when direct calendar handling is not available.
- Given guests scan QR assets, then the system must record scan counts for analytics without storing precise guest location data.

### FR-INV-008: RSVP Capture and Guest Self-Service

**As a** Guest
**I want** a simple RSVP form and edit link
**So that** I can respond quickly and update my status later if needed

**Depends on:** FR-INV-006, FR-INV-007

**Acceptance Criteria:**

- Given RSVP is enabled, then the public invitation must collect at minimum guest name, response status, guest count, and one contact method if required by the creator.
- Given a guest submits a valid RSVP, then the system must return a success state and generate a unique edit link or token.
- Given a creator defines an RSVP deadline, then submissions after that deadline must be rejected with a clear message.
- Given consent text is required, then the RSVP form must not submit until the guest acknowledges the privacy notice.
- Given automated abuse is detected or suspected, then the RSVP endpoint must apply bot and spam protections before storing the response.

### FR-INV-009: Creator RSVP Dashboard, Analytics, and Export

**As a** Creator
**I want** an actionable dashboard for invitation performance
**So that** I can track attendance and plan reminders

**Depends on:** FR-INV-005, FR-INV-007, FR-INV-008

**Acceptance Criteria:**

- Given a creator opens invitation analytics, then the dashboard must show total views, unique views, QR scans, RSVP totals, and response breakdown by status.
- Given RSVPs exist, then the creator must be able to search, filter, and export response data to CSV before deletion.
- Given location analytics are shown, then they must be aggregated to city-level or coarser and must not expose precise geolocation.
- Given new view or RSVP events occur, then dashboard metrics must update within 60 seconds or the product must explicitly label the data as delayed.

### FR-INV-010: Notifications and Reminders

**As a** Creator
**I want** timely invitation alerts
**So that** I do not miss responses or deletion deadlines

**Depends on:** FR-INV-008, FR-INV-009

**Acceptance Criteria:**

- Given a new RSVP is submitted, then the creator must be able to receive an email or in-app alert based on notification preference.
- Given an invitation is approaching deletion, then the creator must be notified 3 days and 1 day before the scheduled purge.
- Given reminder sending is enabled for guests, then the creator must be able to trigger a reminder to pending or non-responded contacts using approved communication channels.
- Given a notification fails, then the failure must be recorded and retriable without duplicating successful deliveries.

### FR-INV-011: Admin Governance, Template Operations, and Moderation

**As an** Admin
**I want** operational controls over templates and abusive content
**So that** the platform stays safe, compliant, and commercially manageable

**Depends on:** FR-INV-002, FR-INV-005

**Acceptance Criteria:**

- Given an admin opens template management, then they must be able to create, edit, deactivate, or feature templates.
- Given a template is marked premium, then the pricing state must propagate to the creator experience.
- Given an invitation or asset is reported, then an admin must be able to review and disable public access without deleting platform audit history.
- Given an admin reviews invitation activity, then they must be able to inspect high-level usage metrics without direct access to unrelated workspace data.

### FR-INV-012: Data Export, Retention, and Auto-Deletion

**As a** Creator
**I want** invitation data to expire automatically after the event
**So that** the platform stays privacy-safe without manual cleanup

**Depends on:** FR-INV-005, FR-INV-008, FR-INV-009, FR-INV-010

**Acceptance Criteria:**

- Given an invitation is published, then the system must assign a scheduled deletion date that defaults to event date plus 7 days unless the creator selects a shorter allowed retention window.
- Given the creator requests export before purge, then the platform must generate downloadable RSVP and invitation data before deletion executes.
- Given the purge job runs, then invitation media, access credentials, and RSVP personal data must be deleted or irreversibly anonymized.
- Given deletion completes, then the system may retain only aggregated non-PII analytics needed for product reporting.
- Given purge fails for any asset class, then the system must surface an operational alert for retry and audit.

---

## 6. Non-Functional Requirements

### NFR-INV-001: Performance and 4G Optimization

**Acceptance Criteria:**

- Public invitation pages must achieve meaningful content render in under 3 seconds on a typical Indian 4G connection for the median published invitation.
- Initial public page payload must be aggressively optimized through image compression, deferred media loading, and caching.
- Heavy media, analytics, and enhancement scripts must not block event details and RSVP entry.

### NFR-INV-002: Availability and Scale

**Acceptance Criteria:**

- Invitation services must target 99.9% monthly availability excluding planned maintenance.
- The product must support at least 100,000 published invitations per month and peak seasonal spikes during Indian wedding and festival periods.
- Analytics and RSVP submission paths must degrade gracefully if non-critical subsystems fail.

### NFR-INV-003: Security and Tenant Isolation

**Acceptance Criteria:**

- Authenticated creator actions must reuse RawDrive authentication and workspace isolation patterns.
- Public invitation endpoints must enforce rate limiting, payload validation, and anti-abuse controls.
- Access secrets such as passwords, PINs, and edit tokens must be stored as secure hashes, never plaintext.
- A creator must never be able to read or export another workspace's invitation or RSVP data.

### NFR-INV-004: Accessibility

**Acceptance Criteria:**

- Invitation creation and public invitation flows must meet WCAG AA color contrast and keyboard accessibility expectations.
- RSVP forms must expose semantic labels, validation messaging, and screen-reader-friendly success or error states.
- Motion-heavy themes must provide reduced-motion fallbacks.

### NFR-INV-005: Privacy, Residency, and Compliance

**Acceptance Criteria:**

- Invitation PII and RSVP data must be hosted in India-aligned infrastructure according to RawDrive compliance policy.
- RSVP flows must provide clear consent notice describing retention and deletion behavior.
- Export and deletion events must be auditable for compliance review.
- Default retention must be privacy-preserving and must not rely on manual admin cleanup.

### NFR-INV-006: Reliability and Background Processing

**Acceptance Criteria:**

- Media optimization, AI enhancements, QR generation, and notification delivery must be asynchronous where required and retriable on failure.
- Background jobs must be idempotent so repeated execution does not duplicate assets or notifications.
- Any background failure affecting publish readiness must be visible to creators in product status messaging.

### NFR-INV-007: Observability and Analytics Integrity

**Acceptance Criteria:**

- Invitation create, publish, view, scan, RSVP, export, and delete events must be logged with traceable IDs.
- Product metrics must distinguish between total events and unique events where relevant.
- Bot or duplicate traffic filtering rules must be applied consistently so creators are not shown inflated engagement metrics.

### NFR-INV-008: Shareability and SEO Metadata

**Acceptance Criteria:**

- Each public invitation must generate stable canonical metadata for title, description, preview image, and URL.
- Shared links must produce recognizable previews in WhatsApp and other major messaging surfaces for supported publish states.
- Expired or disabled invitations must stop advertising stale event previews as active content.

---

## 7. Inter-Requirement Dependencies

| Requirement | Depends on | Why |
| --- | --- | --- |
| FR-INV-002 | FR-INV-001 | Templates live inside the wizard |
| FR-INV-003 | FR-INV-001, FR-INV-002 | Language and typography are template-driven |
| FR-INV-004 | FR-INV-001 | Media attaches to an invitation draft |
| FR-INV-005 | FR-INV-001, FR-INV-002, FR-INV-003 | Publishing needs event content and presentation data |
| FR-INV-006 | FR-INV-004, FR-INV-005 | Public view depends on media and publish state |
| FR-INV-007 | FR-INV-005 | QR and ICS assets are derived from a published invitation |
| FR-INV-008 | FR-INV-006, FR-INV-007 | RSVP is guest-facing and paired with calendar and public views |
| FR-INV-009 | FR-INV-005, FR-INV-007, FR-INV-008 | Dashboard metrics come from shares, scans, and RSVPs |
| FR-INV-010 | FR-INV-008, FR-INV-009 | Notifications depend on RSVP and reminder state |
| FR-INV-011 | FR-INV-002, FR-INV-005 | Admin controls act on templates and public invitations |
| FR-INV-012 | FR-INV-005, FR-INV-008, FR-INV-009, FR-INV-010 | Deletion must account for public assets, response data, and creator export windows |

---

## 8. API and Data Requirements

### 8.1 Required API Capability Surface

The exact route naming can follow RawDrive conventions, but the platform must support the following capabilities:

```text
POST   /api/v1/.../digital-invitations                 Create invitation
PATCH  /api/v1/.../digital-invitations/{id}            Update invitation
POST   /api/v1/.../digital-invitations/{id}/publish    Publish invitation
POST   /api/v1/.../digital-invitations/{id}/archive    Archive or expire invitation
GET    /api/v1/.../digital-invitations/{id}            Fetch creator-facing invitation
GET    /api/v1/.../digital-invitations/{id}/analytics  Fetch invitation analytics
POST   /api/v1/.../digital-invitations/{id}/images     Register image upload
GET    /api/v1/.../digital-invitations/templates       List templates
POST   /api/v1/.../digital-invitations/templates       Create template
GET    /i/{slug}                                       Fetch public invitation by slug
POST   /i/{slug}/access                                Validate password or PIN if protected
POST   /i/{slug}/rsvp                                  Submit RSVP
GET    /i/{slug}/calendar.ics                          Download calendar asset
GET    /i/{slug}/qr                                    Download QR asset
```

### 8.2 Core Data Model

The current database already contains `digital_invitations` and `invitation_rsvps`. Phase 1 launch scope requires the following target entities and fields, whether implemented as tables, JSON columns, or service-owned resources:

| Entity | Required fields | Notes |
| --- | --- | --- |
| `invitations` | `id`, `workspace_id`, `slug`, `title`, `event_type`, `event_datetime`, `event_timezone`, `venue`, `host_names`, `status`, `published_at`, `expires_at`, `auto_delete_at` | Existing schema needs expansion |
| `invitation_templates` | `id`, `category`, `name`, `preview_image`, `supported_languages`, `is_premium`, `status` | Needed for admin and creator flows |
| `invitation_media` | `id`, `invitation_id`, `purpose`, `object_key`, `variants_json`, `ai_status`, `sort_order` | Supports cover, gallery, social preview |
| `invitation_rsvps` | `id`, `invitation_id`, `guest_name`, `contact_hash`, `status`, `guest_count`, `message`, `edit_token_hash`, `consent_at` | Current schema stores the basics only |
| `invitation_qr_assets` | `id`, `invitation_id`, `qr_path`, `ics_path`, `scan_count`, `last_scanned_at` | Needed for QR reporting |
| `invitation_analytics` | `invitation_id`, `views`, `unique_views`, `shares`, `qr_scans`, `device_breakdown`, `city_breakdown`, `rsvp_rate` | Can be aggregate table or warehouse stream |
| `invitation_exports` | `id`, `invitation_id`, `requested_by`, `status`, `download_path`, `expires_at` | Needed for export-before-purge |

### 8.3 Integrations and Jobs

- RawDrive Auth Service for creator authentication and workspace isolation.
- RawDrive media or object storage layer for invitation media and generated assets.
- Asynchronous processing for image optimization, AI enhancements, QR generation, and notifications.
- Calendar asset generation using standards-compliant ICS output.
- Scheduled purge workflow for deletion warnings, exports, and data deletion.
- CDN or edge caching for public invitation delivery and image variants.

---

## 9. Competitive Positioning

| Feature | RawDrive | DigiInvite | Inytes | InviteMart | WedMeGood |
| --- | --- | --- | --- | --- | --- |
| Regional templates | 15+ launch templates with South Indian and multilingual focus | Limited regional packs | Decorative focus | Theme-led | Video-heavy |
| AI image tools | Upscale, background cleanup, social-ready crops | Basic | None | Minimal | None |
| QR and calendar flow | Branded QR plus ICS with analytics | Basic QR | None | Downloadable PDF flow | Weak |
| RSVP analytics | Creator dashboard with response tracking | Basic | None | Basic | None |
| Auto-delete compliance | Event plus 7 day default purge | Manual | None | None | None |
| Free tier | Basic templates and publish path | Paid leaning | Paid | Paid | Template-only |

RawDrive should win on three axes:

- India-first sharing behavior, especially WhatsApp and 4G optimization
- wedding and festival template depth with multilingual support
- privacy-safe RSVP plus deletion lifecycle, which most direct competitors ignore

---

## 10. Open Questions and Release Decisions

- Should guest reminders in phase 1 be limited to creator-exported workflows, or should RawDrive send them directly through approved channels?
- Should premium upsell be based on template access only, or also include analytics depth, AI image processing limits, and retention controls?
- Should public invitation URLs be globally unique by slug only, or namespaced by workspace for operational safety?
- Should ICS generation stay generic, or add provider-specific deep links for Google Calendar and Apple Calendar in later phases?

---

## 11. Requirement Summary

| Total FRs | Total NFRs | Core launch themes |
| --- | --- | --- |
| 12 | 8 | Create, customize, publish, share, RSVP, analyze, delete safely |
