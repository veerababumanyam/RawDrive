# RawDrive Photographer / Studio Owner Role — Frontend Requirements Specification

**Version:** 1.0
**Date:** 2026-04-04
**PRD Reference:** `frontend/docs/TechnicalRequirements/PRD.md` (Sections 6.2.4, 10, 13-26)

---

## Table of Contents

1. [Role Overview](#1-role-overview)
2. [Navigation and Layout](#2-navigation-and-layout)
3. [Dashboard and Home Screen](#3-dashboard-and-home-screen)
4. [Feature Access Matrix](#4-feature-access-matrix)
5. [Screens and Page Inventory](#5-screens-and-page-inventory)
6. [UI Components and Patterns](#6-ui-components-and-patterns)
7. [Business Rules and Validation](#7-business-rules-and-validation)
8. [Notifications and Alerts](#8-notifications-and-alerts)
9. [Restricted Actions](#9-restricted-actions)
10. [Cross-References](#10-cross-references)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Role Overview

### 1.1 Role Description

The **Photographer / Studio Owner** is the primary paying user and the core of RawDrive. They upload media, manage galleries, CRM, proofing, branding, availability, albums, and client delivery. The entire platform experience revolves around their workflow.

### 1.2 Registration

- Self-registration with mandatory state selection
- Onboarding: state → plan → coupon → payment → consents → dashboard
- Plan-gated features and storage quotas

### 1.3 Business Context

- Solopreneurs, freelancers, studio owners
- Primary revenue source for RawDrive (subscription + add-ons)
- Their success = RawDrive's success

---

## 2. Navigation and Layout

### 2.1 Workspace Navigation (Sidebar)

```
[RawDrive Logo / Studio Logo]
[Photographer Name]
[Plan Badge: "Professional"]
[Storage: 45GB / 100GB]

— WORKSPACE —
  Dashboard
  Galleries
  Albums
  Uploads
  Assets

— CLIENTS —
  Client CRM
  Proofing
  Contracts & Documents

— SCHEDULE —
  Calendar

— COMMUNICATION —
  Messages

— PUBLIC PRESENCE —
  Public Profile
  Freelancer Profile
  Camera Rental Listings

— STREAMING —
  Live Streaming

— AI TOOLS —
  AI Hub

— BUSINESS —
  Analytics
  Billing & Plan
  Storage

— TEAM — (Studio Owner only)
  Team Management

— SETTINGS —
  Branding
  Notification Preferences
  Security (2FA)
  Privacy
```

### 2.2 Top Bar

| Element | Description |
|---------|-------------|
| Quick Navigation | Left-aligned `Home` and `Projects` shortcuts with workspace-specific icons and hover text |
| Workspace Search | Centered desktop search field for galleries, clients, and files |
| Notification Bell | Badge count with priority |
| Storage Indicator | Quick bar: "45GB / 100GB" with color (green/amber/red) |
| Plan Badge | Current plan name with upgrade CTA if near limits |
| "View as Client" Toggle | Available on gallery screens |
| Account Menu | Profile, billing, settings, logout |

**FR-PHO-NAV-004**: Desktop dashboard header uses a three-zone layout: left quick navigation, centered search, right utility actions.
**FR-PHO-NAV-005**: `Home` routes to the authenticated dashboard and `Projects` routes to the gallery workspace, with descriptive hover text for both shortcuts.

**FR-PHO-NAV-001**: Storage indicator visible at all times; amber at 80%, red at 95%.
**FR-PHO-NAV-002**: Plan upgrade CTA appears when within 10% of any limit (storage, galleries, clients).
**FR-PHO-NAV-003**: Sidebar responsive — collapses on mobile to bottom nav.

---

## 3. Dashboard and Home Screen

### 3.1 KPI Cards

| KPI | Data |
|-----|------|
| Total Galleries | Active gallery count / plan limit |
| Active Clients | Client count / plan limit |
| Storage Used | Used / quota with percentage |
| Recent Uploads | Photos uploaded in last 7 days |
| Upcoming Shoots | Next 3 scheduled shoots |
| Proofing Pending | Galleries awaiting client proofing |
| Unread Messages | Internal communication unread count |
| Gallery Views (7d) | Total views across all galleries |

### 3.2 Activity Feed

- Recent client activity (gallery viewed, photo favorited, comment, selection)
- Upload/processing completions
- Proofing status changes
- New inquiries
- AI job completions

### 3.3 Quick Actions

| Action | Shortcut |
|--------|----------|
| Create Gallery | Ctrl+G |
| Upload Photos | Ctrl+U |
| Add Client | Ctrl+N |
| Schedule Shoot | Ctrl+S |

---

## 4. Feature Access Matrix

| Feature | Access | Plan Gated |
|---------|--------|-----------|
| **Onboarding** | Complete mandatory flow | No |
| **Dashboard** | Full (own workspace) | No |
| **Galleries** | Full CRUD | Gallery limit by plan |
| **Gallery Privacy** | Password, PIN, expiry, access modes | No |
| **Gallery Cover Design** | Full (30 templates) | No |
| **Gallery FaceID Toggle** | Enable/disable per gallery | Plan: Professional+ |
| **Sensitive Photo Locking** | Per-photo PIN controls | No |
| **Gallery Sharing** | Links, QR, slugs, email, revoke | No |
| **"View as Client"** | Preview gallery as client sees it | No |
| **Albums** | Full CRUD, spread designer | Plan: Professional+ |
| **Uploads** | Bulk, resumable | Storage quota by plan |
| **Asset Management** | Folders, collections, tagging, search | No |
| **Client Proofing** | Favorites, selections, comments, approval | No |
| **Client CRM** | Full client management | Client limit by plan |
| **Contracts & Docs** | Quotations, contracts, GST docs | Plan: Professional+ |
| **Calendar** | Shoots, deadlines, Google sync | No |
| **Communication** | Message clients, photographers, team | No |
| **Public Profile** | Full editing | No |
| **Freelancer Profile** | Toggle, listing, availability | Plan: Starter+ |
| **Camera Rental Listings** | Own listings | Plan: Starter+ |
| **Live Streaming** | Setup, configure, manage credits | Prepaid credits |
| **AI Features** | Culling, scoring, faces, search | Plan: Starter+ (basic), Professional+ (full) |
| **Analytics** | Own workspace metrics | No |
| **Billing & Plan** | View, upgrade, downgrade | No |
| **Storage** | View usage, quota | No |
| **Team Management** | Invite, roles (Studio Owner) | Plan: Business+ (team member limit) |
| **Branding** | Logo, colors, custom domain | Plan: Professional+ (domain) |
| **Security** | 2FA, sessions | No |

---

## 5. Screens and Page Inventory

### 5.1 Onboarding Flow

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-ONB-001 | `/onboarding/state` | Mandatory state selection |
| PHO-ONB-002 | `/onboarding/plan` | Plan selection with comparison |
| PHO-ONB-003 | `/onboarding/coupon` | Optional coupon entry |
| PHO-ONB-004 | `/onboarding/payment` | PhonePe payment + mandate |
| PHO-ONB-005 | `/onboarding/consents` | Legal consent checkboxes |
| PHO-ONB-006 | `/onboarding/welcome` | Welcome dashboard with first-time guidance |

**FR-PHO-ONB-001**: State selection is mandatory — cannot skip or proceed without it.
**FR-PHO-ONB-002**: Mid-funnel return resumes at last incomplete step.
**FR-PHO-ONB-003**: No backdoor to dashboard without completing all steps.

### 5.2 Galleries

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-GAL-001 | `/workspace/galleries` | Gallery list (grid/list view with status badges) |
| PHO-GAL-002 | `/workspace/galleries/create` | Create gallery form |
| PHO-GAL-003 | `/workspace/galleries/:id` | Gallery detail: photos, settings, analytics |
| PHO-GAL-004 | `/workspace/galleries/:id/settings` | Privacy, password, PIN, expiry, watermark, download, FaceID |
| PHO-GAL-005 | `/workspace/galleries/:id/cover` | Cover design studio (3-column editor) |
| PHO-GAL-006 | `/workspace/galleries/:id/share` | Share controls: links, QR, slug, email, revoke |
| PHO-GAL-007 | `/workspace/galleries/:id/proofing` | Proofing dashboard: selections, approvals |
| PHO-GAL-008 | `/workspace/galleries/:id/analytics` | Per-gallery: views, downloads, favorites, engagement |
| PHO-GAL-009 | `/workspace/galleries/:id/preview` | "View as Client" mode |

**FR-PHO-GAL-001**: Gallery list shows status badges: Draft, Shared, Expired, Protected, PWA-Enabled.
**FR-PHO-GAL-002**: Gallery creation blocked if gallery_limit reached — show upgrade prompt.
**FR-PHO-GAL-003**: Cover design studio: 3-column layout (nav | settings | live preview).
**FR-PHO-GAL-004**: Cover template library: 30 named templates (Center, Left, Novel, Vintage, Frame, Stripe, Divider, Journal, Stamp, Outline, Classic, None, Split, Label, Border, Album, Cliff, Cedar, Breeze, Aero, Surf, Cosmos, Reef, Bondi, West, Oakwood, Edge, Anchor, Joy, Love).
**FR-PHO-GAL-005**: FaceID toggle per gallery (Professional+ plan only).
**FR-PHO-GAL-006**: Sensitive photo locking: mark individual photos as PIN-locked within any shared gallery.
**FR-PHO-GAL-007**: "View as Client" renders exact client experience in a preview frame.
**FR-PHO-GAL-008**: Share analytics: link clicks, unique viewers, device breakdown.

### 5.3 Albums

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-ALB-001 | `/workspace/albums` | Album list |
| PHO-ALB-002 | `/workspace/albums/create` | Create album with lab preset selection |
| PHO-ALB-003 | `/workspace/albums/:id` | Album designer: spread workspace |
| PHO-ALB-004 | `/workspace/albums/:id/versions` | Version history |
| PHO-ALB-005 | `/workspace/albums/:id/preflight` | Print preflight checks |
| PHO-ALB-006 | `/workspace/albums/:id/proof` | Client proofing view for album |

**FR-PHO-ALB-001**: Spread designer with drag-and-drop, zoom/pan, AI layout suggestions.
**FR-PHO-ALB-002**: Lab presets and custom presets for print dimensions.
**FR-PHO-ALB-003**: Safe zone and bleed guidance overlays.

### 5.4 Uploads & Assets

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-UPL-001 | `/workspace/uploads` | Upload zone: drag-drop, bulk, resumable |
| PHO-UPL-002 | `/workspace/uploads/status` | Processing status: thumbnails, EXIF, AI |
| PHO-AST-001 | `/workspace/assets` | Asset library: grid/list, search, filters |
| PHO-AST-002 | `/workspace/assets/:id` | Asset detail: EXIF, versions, AI analysis, tags |

**FR-PHO-UPL-001**: Upload blocked if storage_quota exceeded — show upgrade prompt.
**FR-PHO-UPL-002**: Resumable uploads survive page refresh and browser restart.
**FR-PHO-UPL-003**: Processing pipeline: thumbnail → web derivative → watermark → EXIF → AI (non-blocking).
**FR-PHO-AST-001**: Semantic search: "bride smiling at sunset" using AI-generated embeddings.
**FR-PHO-AST-002**: Filter by: face group, date, tag, event, AI score, collection.

### 5.5 Clients & CRM

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-CRM-001 | `/workspace/clients` | Client list with lifecycle status |
| PHO-CRM-002 | `/workspace/clients/create` | Add client form |
| PHO-CRM-003 | `/workspace/clients/:id` | Client profile: contacts, notes, tags, galleries, communication |
| PHO-CRM-004 | `/workspace/clients/pipeline` | Deal/lead pipeline (kanban) |
| PHO-CRM-005 | `/workspace/clients/inquiries` | Inquiry inbox |

**FR-PHO-CRM-001**: Client creation blocked if client_limit reached — upgrade prompt.
**FR-PHO-CRM-002**: Client profile aggregates: linked galleries, communication log, proofing status, deal stage.
**FR-PHO-CRM-003**: Pipeline kanban: Inquiry → Lead → Proposal → Booked → Delivered.

### 5.6 Contracts & Documents

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-DOC-001 | `/workspace/documents` | Document list (quotations, contracts) |
| PHO-DOC-002 | `/workspace/documents/quotation/create` | Quotation builder |
| PHO-DOC-003 | `/workspace/documents/contract/create` | Contract builder |
| PHO-DOC-004 | `/workspace/documents/:id` | Document detail with sharing |

### 5.7 Calendar & Booking Service

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-CAL-001 | `/workspace/calendar` | Month/week/day views (Interactive) |
| PHO-CAL-002 | `/workspace/calendar/shoot/:id` | Shoot detail: client, location, time, notes |
| PHO-CAL-003 | `/workspace/calendar/settings` | **Service Creator, Durations, Buffers, Week-view Schedule** |
| PHO-CAL-004 | `/workspace/calendar/google-sync` | **Google OAuth2 flow, sync status, conflict settings** |

**FR-PHO-CAL-001**: 2-Way Google Calendar sync (Read Busy slots / Write RawDrive bookings).
**FR-PHO-CAL-002**: Color-coded events by type (shoot, deadline, delivery).
**FR-PHO-CAL-003**: Define "Services" with fixed durations (e.g., 60m, 4h) and mandatory travel buffers.
**FR-PHO-CAL-004**: "Automated Booking" toggle — enabled services become available for client selection.
**FR-PHO-CAL-005**: Conflict identification: Google "Busy" events automatically hide slots in the RawDrive booking widget.

### 5.8 Communication

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-MSG-001 | `/workspace/messages` | Message inbox: threads, unread markers |
| PHO-MSG-002 | `/workspace/messages/:threadId` | Thread detail: messages, attachments |

### 5.9 Public Presence

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-PUB-001 | `/workspace/profile/public` | Public profile editor: bio, services, galleries, CTAs, **Booking Toggle** |
| PHO-PUB-002 | `/workspace/profile/public/preview` | Preview public page |
| PHO-PUB-003 | `/workspace/profile/public/scheduler` | **Scheduler visibility per gallery/profile toggle** |
| PHO-FRL-001 | `/workspace/freelancer` | Freelancer profile: toggle, headline, specialties, availability |
| PHO-FRL-002 | `/workspace/freelancer/availability` | Airbnb-style availability calendar |
| PHO-RNT-001 | `/workspace/rentals` | Camera rental listings |
| PHO-RNT-002 | `/workspace/rentals/create` | Create rental listing |
| PHO-RNT-003 | `/workspace/rentals/:id` | Listing detail with availability calendar |

**FR-PHO-PUB-001**: Public profile at `/u/{slug}` — bio, services, featured galleries, booking CTA, WhatsApp CTA, QR, vCard, social links.
**FR-PHO-FRL-001**: Availability calendar: block/unblock dates, recurring windows, available/tentative/unavailable states.
**FR-PHO-RNT-001**: Rental listing: item description, location, pricing, deposit, conditions, availability.

### 5.10 Live Streaming

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-STR-001 | `/workspace/streaming` | Event list with status |
| PHO-STR-002 | `/workspace/streaming/setup` | Event setup: name, date, access control |
| PHO-STR-003 | `/workspace/streaming/:id` | Stream management: ingest details, viewer stats |
| PHO-STR-004 | `/workspace/streaming/credits` | Purchase streaming credits (prepaid) |

**FR-PHO-STR-001**: Show RTMPS/SRT ingest details for photographer's OBS/streaming software.
**FR-PHO-STR-002**: Credit purchase via PhonePe with rate card display.

### 5.11 AI Hub

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-AI-001 | `/workspace/ai` | AI dashboard: recent jobs, available tools |
| PHO-AI-002 | `/workspace/ai/culling` | Auto-culling workspace: review suggested keeps/rejects |
| PHO-AI-003 | `/workspace/ai/faces` | Face groups: rename, merge, split, filter |
| PHO-AI-004 | `/workspace/ai/search` | Semantic search interface |
| PHO-AI-005 | `/workspace/ai/scoring` | Aesthetic scoring dashboard |

**FR-PHO-AI-001**: Face groups show per-gallery clusters — not cross-gallery identity.
**FR-PHO-AI-002**: Culling presents side-by-side: AI suggestion vs photographer override.
**FR-PHO-AI-003**: Confidence threshold slider for face matching results.

### 5.12 Business

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-ANL-001 | `/workspace/analytics` | Gallery views, client engagement, download stats |
| PHO-BIL-001 | `/workspace/billing` | Current plan, usage, invoices, payment history |
| PHO-BIL-002 | `/workspace/billing/upgrade` | Plan comparison and upgrade flow |
| PHO-BIL-003 | `/workspace/billing/downgrade` | Downgrade with usage check |
| PHO-STG-001 | `/workspace/storage` | Storage breakdown by type, quota visualization |

**FR-PHO-BIL-001**: Upgrade applies immediately with proration.
**FR-PHO-BIL-002**: Downgrade: if usage exceeds target plan, schedule for next renewal with guidance to reduce.
**FR-PHO-STG-001**: Storage breakdown: originals, derivatives, album exports, other.

### 5.13 Team (Studio Owner)

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-TEM-001 | `/workspace/team` | Team member list |
| PHO-TEM-002 | `/workspace/team/invite` | Invite form with role/permission selection |
| PHO-TEM-003 | `/workspace/team/:memberId` | Member detail: role, permissions, activity |

**FR-PHO-TEM-001**: Team invite blocked if team_member_limit reached — upgrade prompt.
**FR-PHO-TEM-002**: Granular permission grants per feature area.

### 5.14 Settings

| Screen ID | Route | Description |
|-----------|-------|-------------|
| PHO-SET-001 | `/workspace/settings/branding` | Logo, colors, custom domain |
| PHO-SET-002 | `/workspace/settings/notifications` | Channel preferences per event type |
| PHO-SET-003 | `/workspace/settings/security` | 2FA, active sessions, session timeout |
| PHO-SET-004 | `/workspace/settings/privacy` | AI processing preferences, gallery defaults |

---

## 6. UI Components and Patterns

### 6.1 Gallery Card Grid
- Status badges: Draft (gray), Shared (green), Expired (red), Protected (amber)
- Cover thumbnail, title, photo count, share count
- Quick actions: share, edit, delete, preview

### 6.2 Drag-and-Drop Upload Zone
- Large drop target with progress bars per file
- Bulk progress indicator
- Resume button for interrupted uploads

### 6.3 Cover Design Editor (3-Column)
- Left: navigation (Cover, Typography, Color, Grid)
- Center: settings panel (template library, focal point, options)
- Right: live preview (desktop/mobile toggle, real-time updates)

### 6.4 Album Spread Designer
- Spread-by-spread workspace with zoom/pan
- Photo drag-and-drop onto layout slots
- AI layout suggestion button
- Safe zone / bleed overlays toggle

### 6.5 Client Pipeline Kanban
- Columns: Inquiry → Lead → Proposal → Booked → Delivered
- Drag cards between columns
- Card shows: client name, event date, value

### 6.6 Storage Quota Bar
- Horizontal bar: green (0-79%), amber (80-94%), red (95-100%)
- Shows: "45 GB / 100 GB used"
- "Upgrade" CTA button when amber/red

### 6.7 Plan-Gated Feature Lock
- Lock icon overlay on plan-restricted features
- "Upgrade to Professional to unlock" tooltip
- Click opens plan comparison modal

### 6.8 "View as Client" Toggle
- Toggle button on gallery detail screens
- Renders gallery exactly as client sees it (respecting password, watermark, download rules)
- Clear visual indicator: "You are viewing as client"

### 6.9 Face Group Manager
- Cluster cards: representative photo + count
- Rename (pencil icon), Merge (select multiple → merge), Split (select faces → new group)
- Confidence indicator per face match

### 6.10 WhatsApp Share Button
- Pre-filled message with gallery link
- Green WhatsApp branded button
- Available on: gallery share, public profile, referral

### 6.11 QR Code Generator
- Generate QR for: gallery link, public profile, vCard
- Download as PNG
- Display in lightbox for scanning

---

## 7. Business Rules and Validation

### 7.1 Onboarding Gates

**BR-PHO-ONB-001**: State selection mandatory — no workspace access until complete.
**BR-PHO-ONB-002**: Mid-funnel return resumes at last incomplete step.
**BR-PHO-ONB-003**: No silent skips or hidden backdoors.

### 7.2 Plan Entitlement Enforcement

**BR-PHO-ENT-001**: Gallery creation blocked if gallery_limit reached → upgrade prompt.
**BR-PHO-ENT-002**: Upload blocked if storage_quota exceeded → upgrade prompt.
**BR-PHO-ENT-003**: Client creation blocked if client_limit reached → upgrade prompt.
**BR-PHO-ENT-004**: Team invite blocked if team_member_limit reached → upgrade prompt.
**BR-PHO-ENT-005**: Plan-gated features show lock icon with upgrade CTA.
**BR-PHO-ENT-006**: Existing data remains visible after downgrade, but new creates blocked until within limit.

### 7.3 Billing Hold Mode

**BR-PHO-BIL-001**: If renewal fails or trial expires → account enters read-only state.
**BR-PHO-BIL-002**: Blocked in billing-hold: upload, gallery create/edit, client edits, proofing, new shares.
**BR-PHO-BIL-003**: Allowed in billing-hold: login, view existing data, billing recovery, plan management, support.
**BR-PHO-BIL-004**: Recovery UI shown prominently with payment update CTA.

### 7.4 Trial Lifecycle

**BR-PHO-TRL-001**: 90-day free trial countdown visible in dashboard.
**BR-PHO-TRL-002**: Expiry reminders at 30 days, 7 days, 1 day.
**BR-PHO-TRL-003**: After expiry → read-only recovery mode (same as billing-hold).

### 7.5 Gallery Rules

**BR-PHO-GAL-001**: Download policy enforced — no download if photographer disabled it.
**BR-PHO-GAL-002**: Watermark rules enforced on all derivatives.
**BR-PHO-GAL-003**: PIN/password validated before gallery content shown to clients.
**BR-PHO-GAL-004**: Gallery expiry enforced — expired galleries show "expired" to clients.
**BR-PHO-GAL-005**: FaceID consent required before enabling on a gallery.

### 7.6 AI Privacy

**BR-PHO-AI-001**: Face embeddings isolated per workspace.
**BR-PHO-AI-002**: Gallery-level AI disable option for sensitive events.
**BR-PHO-AI-003**: FaceID results scoped to gallery only — no cross-gallery identity.

---

## 8. Notifications and Alerts

| Trigger | Priority | Channel |
|---------|----------|---------|
| Client viewed gallery | Low | In-app |
| Client favorited photo | Low | In-app |
| Client commented | Medium | In-app + push |
| Client submitted selection | High | In-app + push + email |
| Proofing approved | High | In-app + push + email |
| New inquiry / booking request | High | In-app + push + email |
| Upload complete | Low | In-app |
| AI job complete (culling, faces) | Medium | In-app |
| Renewal reminder (7 days) | Medium | In-app + email |
| Payment success | Low | In-app + email |
| Payment failure | Critical | In-app + email + SMS |
| Storage 80% warning | Medium | In-app |
| Storage 95% critical | High | In-app + email |
| Gallery expiry approaching (7 days) | Medium | In-app |
| Trial expiry (30d, 7d, 1d) | High | In-app + email + SMS |
| New internal message | Medium | In-app + push |
| Live stream: viewer joined | Low | In-app |
| Live stream: health alert | High | In-app toast |

---

## 9. Restricted Actions

| # | Denied Action |
|---|-------------|
| RD-PHO-001 | Access admin/super-admin/dealer dashboards |
| RD-PHO-002 | View other photographers' workspaces |
| RD-PHO-003 | Modify platform pricing or margin rules |
| RD-PHO-004 | Approve payouts |
| RD-PHO-005 | Access platform audit logs |
| RD-PHO-006 | Moderate other users' content |
| RD-PHO-007 | Access dealer analytics or territory data |
| RD-PHO-008 | Create admin or dealer accounts |

---

## 10. Cross-References

| PRD Section | Coverage |
|-------------|---------|
| 10 (Scope) | Section 4 (Feature Access Matrix) |
| 13 (Onboarding) | Section 5.1 |
| 14 (Workspace) | Sections 2-3 |
| 15 (Gallery) | Section 5.2 |
| 16 (Upload/Storage) | Section 5.4 |
| 17 (AI) | Section 5.11 |
| 18 (CRM) | Section 5.5 |
| 19 (Contracts) | Section 5.6 |
| 20 (Freelancer) | Section 5.9 |
| 21 (Camera Rentals) | Section 5.9 |
| 22 (Albums) | Section 5.3 |
| 23 (Public Profile) | Section 5.9 |
| 25 (Communication) | Section 5.8 |
| 26 (Live Streaming) | Section 5.10 |

---

## 11. Acceptance Criteria

### 11.1 Onboarding
**AC-PHO-001**: Cannot access `/workspace/*` without completing state selection.
**AC-PHO-002**: Mid-funnel return resumes at last step.
**AC-PHO-003**: Completing onboarding lands on welcome dashboard.

### 11.1A Workspace Navigation
**AC-PHO-003A**: Desktop dashboard header keeps the gallery/client/file search input centered between quick navigation and utility actions.
**AC-PHO-003B**: Header quick navigation exposes `Home` and `Projects` shortcuts with photographer-specific hover text and correct destinations.

### 11.2 Galleries
**AC-PHO-004**: Creating gallery when at limit shows upgrade prompt, not error.
**AC-PHO-005**: Cover design shows all 30 templates in the library.
**AC-PHO-006**: "View as Client" renders exact client experience.
**AC-PHO-007**: FaceID toggle disabled for plans below Professional.
**AC-PHO-008**: PIN-locked photo shows locked placeholder to clients without PIN.

### 11.3 Uploads
**AC-PHO-009**: Upload at storage quota shows upgrade prompt.
**AC-PHO-010**: Resumable upload survives browser refresh.
**AC-PHO-011**: Processing status shows pipeline progress.

### 11.4 CRM
**AC-PHO-012**: Client creation at limit shows upgrade prompt.
**AC-PHO-013**: Pipeline kanban allows drag between columns.

### 11.5 Billing
**AC-PHO-014**: Upgrade applies immediately with plan change confirmation.
**AC-PHO-015**: Downgrade with excess usage schedules for next renewal.
**AC-PHO-016**: Billing hold blocks create/edit/upload but allows login and recovery.

### 11.6 Trial
**AC-PHO-017**: Trial countdown visible on dashboard from day 1.
**AC-PHO-018**: Reminders sent at 30d, 7d, 1d before expiry.
**AC-PHO-019**: Expired trial enters read-only mode.

### 11.7 AI
**AC-PHO-020**: Semantic search returns relevant results for "bride smiling at sunset".
**AC-PHO-021**: Face groups are per-gallery, not cross-gallery.
**AC-PHO-022**: Gallery-level AI disable prevents AI processing.

### 11.8 Communication
**AC-PHO-023**: Messages deliver to client in real-time.
**AC-PHO-024**: Unread markers update correctly.

### 11.9 Public Profile
**AC-PHO-025**: Public page renders at `/u/{slug}` with bio, galleries, CTAs.
**AC-PHO-026**: WhatsApp CTA opens pre-filled message.
**AC-PHO-027**: QR code is scannable and links to profile.

### 11.10 Live Streaming
**AC-PHO-028**: Stream setup provides RTMPS/SRT ingest details.
**AC-PHO-029**: Credit purchase via PhonePe completes successfully.

### 11.11 Plan Gating
**AC-PHO-030**: Plan-locked features show lock icon with upgrade CTA.
**AC-PHO-031**: Clicking lock opens plan comparison modal.

---

## Requirement Summary

| Category | Count |
|----------|-------|
| Functional Requirements (FR-PHO-*) | 40 |
| Business Rules (BR-PHO-*) | 22 |
| Restricted Actions (RD-PHO-*) | 8 |
| Acceptance Criteria (AC-PHO-*) | 31 |
| **Total Testable Requirements** | **101** |

---

*End of Photographer / Studio Owner Role Frontend Requirements Specification*
