# RawDrive Client / Family / Guest Role — Frontend Requirements Specification

**Version:** 1.0
**Date:** 2026-04-04
**PRD Reference:** `frontend/docs/TechnicalRequirements/PRD.md` (Sections 6.2.6, 15, 17, 23, 25, 26)

---

## Table of Contents

1. [Role Overview](#1-role-overview)
2. [Entry Experiences](#2-entry-experiences)
3. [Navigation and Layout](#3-navigation-and-layout)
4. [Feature Access Matrix](#4-feature-access-matrix)
5. [Screens and Page Inventory](#5-screens-and-page-inventory)
6. [UI Components and Patterns](#6-ui-components-and-patterns)
7. [Business Rules and Validation](#7-business-rules-and-validation)
8. [Notifications and Alerts](#8-notifications-and-alerts)
9. [Performance Requirements](#9-performance-requirements)
10. [Accessibility Requirements](#10-accessibility-requirements)
11. [Restricted Actions — Explicit Denials](#11-restricted-actions--explicit-denials)
12. [Cross-References](#12-cross-references)
13. [Acceptance Criteria](#13-acceptance-criteria)

---

## 1. Role Overview

### 1.1 Role Description

The **Client / Family / Guest** consumes galleries, favorites photos, comments, approves selections, views albums, sends inquiries, and accesses shared assets. This is the END USER — the person receiving the photographer's deliverables. Their experience defines RawDrive's reputation.

### 1.2 Sub-Types

| Sub-Type | Description | Entry |
|----------|------------|-------|
| Invited Client | Directly invited by photographer | Email/WhatsApp link |
| Family/Guest | Shared a gallery link | Link, may or may not register |
| Public Visitor | Discovers via public profile or gallery slug | Search/direct URL |

### 1.3 Key Characteristics

- No subscription, no billing, no workspace
- Mobile-first experience is CRITICAL (most view on phones)
- Created by: invitation, inquiry flow, or portal registration
- Photographer's branding visible throughout

---

## 2. Entry Experiences

### 2.1 Direct Gallery Link

1. Receive link via email/WhatsApp/SMS
2. Land on gallery — no auth required (or optional registration prompt)
3. View, browse, favorite, comment, download (per photographer's policy)

**FR-CLI-ENT-001**: Gallery link must load gallery immediately without forced registration.
**FR-CLI-ENT-002**: Optional registration prompt appears after 30 seconds or on first interaction (favorite/comment).

### 2.2 Password/PIN Protected Gallery

1. Password entry screen with photographer branding
2. Correct password → gallery access
3. PIN entry for individual locked photos within gallery
4. "Forgot PIN? Contact photographer" CTA

**FR-CLI-ENT-003**: Password screen must show photographer logo and gallery title.
**FR-CLI-ENT-004**: Wrong password shows shake animation and clear error message.
**FR-CLI-ENT-005**: Password entry must NOT reveal if gallery exists (security).

### 2.3 FaceID Gallery Entry

1. FaceID icon/CTA on eligible gallery slug
2. Privacy consent: "We will use your camera to find your photos. Your image is not stored."
3. Open camera or upload selfie
4. System identifies face → filters to matching photos
5. Fallback to manual browse if identification fails

**FR-CLI-ENT-006**: FaceID requires explicit privacy consent before camera access.
**FR-CLI-ENT-007**: Face matching scoped to this gallery only — not cross-gallery.
**FR-CLI-ENT-008**: Graceful fallback: "We couldn't find a match. Browse all photos instead."
**FR-CLI-ENT-009**: FaceID only available if photographer enabled it for this gallery.

### 2.4 Public Gallery Slug

- SEO-friendly URL (e.g., `/gallery/smith-wedding-2026`)
- No auth required
- Full gallery experience within photographer's settings

### 2.5 Photographer Public Profile

- URL: `/u/{slug}`
- Bio, services, featured galleries
- Booking CTA, WhatsApp CTA
- QR code, vCard download
- Browse to public galleries

**FR-CLI-ENT-010**: Public profile must be SEO-optimized with meta tags, structured data.
**FR-CLI-ENT-011**: vCard download contains: name, phone, email, website.

### 2.6 PWA Installation

- "Add to Home Screen" prompt on supported browsers
- Branded icon with gallery/photographer name
- Re-entry to same gallery without re-navigation
- Offline shell with graceful messaging

**FR-CLI-ENT-012**: PWA manifest must be gallery-specific with photographer's branding.
**FR-CLI-ENT-013**: Installed PWA reopens to the gallery, not a generic landing page.
**FR-CLI-ENT-014**: Offline shell shows: photographer logo + "You're offline. Connect to view photos."

---

## 3. Navigation and Layout

### 3.1 Gallery-Centric Navigation

- No workspace, no sidebar clutter
- Clean, premium, fullscreen gallery experience
- Photographer's branding (logo, colors, custom domain)

### 3.2 Mobile Navigation (Bottom Bar)

| Icon | Label | Function |
|------|-------|----------|
| Grid | Gallery | Return to gallery grid view |
| Heart | Favorites | View all favorited photos |
| Chat | Messages | Communication with photographer |
| User | Profile | Client profile/preferences |

### 3.3 Desktop Navigation (Top Bar)

| Element | Description |
|---------|-------------|
| Photographer Logo | Left-aligned, links to gallery root |
| Gallery Title | Center |
| Favorites Counter | "12 favorites" link |
| Download Button | If downloads enabled |
| Share Button | Re-share gallery link |
| Profile/Login | Client account |

**FR-CLI-NAV-001**: Navigation adapts to mobile (bottom bar) and desktop (top bar).
**FR-CLI-NAV-002**: Photographer branding applied consistently: logo, colors, fonts.
**FR-CLI-NAV-003**: No RawDrive branding visible to client (white-labeled for photographer).

---

## 4. Feature Access Matrix

| Feature | Access | Condition |
|---------|--------|-----------|
| Gallery Viewing | Full | Always (after password if set) |
| Photo Lightbox (swipe, zoom) | Full | Always |
| Favorites | Mark/unmark/view | If photographer allows |
| Star Ratings | Rate photos | If photographer allows |
| Comments | Add/view | If photographer allows |
| Proofing/Selections | Submit/approve | Per photographer's workflow |
| Downloads (single) | Download | Per photographer's download policy |
| Downloads (bulk ZIP) | Download | Per photographer's download policy |
| Album Viewing | View spreads | If shared |
| FaceID Browse | Use selfie to filter | If photographer enabled |
| Sensitive Photos | Enter PIN to unlock | If photographer has locked photos |
| Inquiry/Booking | Send inquiry | Via CTA |
| Communication | Message photographer | If enabled |
| Profile | Basic (name, email, phone) | If registered |
| Notification Preferences | Opt-in/out | If registered |
| Gallery Re-Share | Share link | If photographer allows |
| QR Access | Scan to access | Always |
| Freelancer Discovery | Browse listings | Public pages |
| Camera Rental Discovery | Browse listings | Public pages |
| Live Stream Viewing | Watch + chat | If granted access |

---

## 5. Screens and Page Inventory

### 5.1 Gallery Experience

| Screen ID | Route | Description |
|-----------|-------|-------------|
| CLI-GAL-001 | `/gallery/{slug}` | Gallery landing: hero cover, title, photo grid |
| CLI-GAL-002 | `/gallery/{slug}/password` | Password entry screen |
| CLI-GAL-003 | `/gallery/{slug}/faceid` | FaceID capture: camera/upload + consent |
| CLI-GAL-004 | `/gallery/{slug}/photo/:id` | Photo lightbox: fullscreen, swipe, zoom |
| CLI-GAL-005 | `/gallery/{slug}/favorites` | All favorited photos in one view |
| CLI-GAL-006 | `/gallery/{slug}/selections` | Proofing: labeled groups, selection count, approve |
| CLI-GAL-007 | `/gallery/{slug}/download` | Download center: format picker, bulk ZIP |

**FR-CLI-GAL-001**: Gallery landing shows masonry grid with LQIP blur-up loading.
**FR-CLI-GAL-002**: Lightbox supports: swipe left/right, pinch-zoom on mobile, tap to toggle UI.
**FR-CLI-GAL-003**: Favorites view: grid of all favorited photos, export/share options.
**FR-CLI-GAL-004**: Selection/proofing: labeled tabs (e.g., "Must Print", "Maybe", "Album"), drag/tap to categorize.
**FR-CLI-GAL-005**: Download center: original vs web size, single vs bulk ZIP with progress.
**FR-CLI-GAL-006**: Locked photos show locked placeholder (blurred thumbnail + lock icon) or hidden per config.
**FR-CLI-GAL-007**: PIN entry for locked photos: numeric keypad, shake on wrong PIN.

### 5.2 Album Experience

| Screen ID | Route | Description |
|-----------|-------|-------------|
| CLI-ALB-001 | `/album/{slug}` | Album viewer: spread-by-spread, flip animation |
| CLI-ALB-002 | `/album/{slug}/comment` | Comment on album spreads |

### 5.3 Photographer Profile

| Screen ID | Route | Description |
|-----------|-------|-------------|
| CLI-PUB-001 | `/u/{slug}` | Photographer profile: bio, services, galleries, CTAs |
| CLI-PUB-002 | `/u/{slug}/inquiry` | Inquiry form: message, event details, dates |
| CLI-PUB-003 | `/u/{slug}/book` | **Scheduler: service selection, date picker, slot selection** |
| CLI-PUB-004 | `/u/{slug}/book/confirm` | **Booking confirmation & Payment (if required)** |

**FR-CLI-PUB-001**: Profile shows: bio, services, featured galleries, booking CTA, WhatsApp CTA, QR, vCard.
**FR-CLI-PUB-002**: Inquiry form: name, email, phone, event type, preferred dates, message.
**FR-CLI-PUB-003**: Scheduler shows available days in a calendar grid with "Busy" days greyed out.
**FR-CLI-PUB-004**: Timezone switcher: Client can toggle between their local time and photographer's time.
**FR-CLI-PUB-005**: Service selection: Client picks from photographer-defined services (duration/price shown).

### 5.4 Communication

| Screen ID | Route | Description |
|-----------|-------|-------------|
| CLI-MSG-001 | `/messages` | Message thread with photographer |

### 5.5 Live Streaming

| Screen ID | Route | Description |
|-----------|-------|-------------|
| CLI-STR-001 | `/stream/{eventId}` | Live stream player: video, chat, viewer count |

**FR-CLI-STR-001**: Stream player: adaptive bitrate via Cloudflare Stream HLS/DASH.
**FR-CLI-STR-002**: Chat overlay with lightweight engagement.

### 5.6 Client Account

| Screen ID | Route | Description |
|-----------|-------|-------------|
| CLI-PRF-001 | `/profile` | Name, email, phone (if registered) |
| CLI-NOT-001 | `/profile/notifications` | Notification preferences |

### 5.7 PWA Home

| Screen ID | Route | Description |
|-----------|-------|-------------|
| CLI-PWA-001 | `/home` | Gallery list (if client has multiple gallery accesses) |

---

## 6. UI Components and Patterns

### 6.1 Premium Gallery Grid
- Masonry layout with responsive columns (1-4 based on viewport)
- LQIP: tiny blurred placeholder → sharp image (blur-up transition)
- Smooth scroll with infinite load (next batch loads before user reaches bottom)
- Lazy loading with intersection observer

### 6.2 Lightbox
- Full-screen photo viewer
- Swipe gestures: left/right to navigate, up to close
- Pinch-zoom on mobile (two-finger)
- Tap to toggle UI (favorite heart, comment bubble, download icon, photo counter)
- Keyboard navigation on desktop: arrow keys, ESC to close

### 6.3 Favorite Button
- Heart icon: empty (not favorited) → filled red (favorited)
- Tap animation: heart scale + particle burst
- Instant optimistic UI feedback
- Counter showing total favorites per photo

### 6.4 Comment Input
- Expandable text area attached to photo in lightbox
- Submit button
- Threaded replies if supported
- Timestamp and commenter name

### 6.5 Selection Chips (Proofing)
- Labeled tabs: photographer-defined categories (e.g., "Must Print", "Maybe", "Album")
- Tap photo → assign to category
- Drag between categories on desktop
- Selection counter per category
- "Submit Selections" button with confirmation

### 6.6 Proofing Toolbar
- Fixed bottom bar during proofing
- Shows: selected count per category, total selected, "Submit" button
- Progress indicator: "12 of 50 photos categorized"

### 6.7 Download Button
- Single photo: tap download icon → format picker (original/web) → download
- Bulk: select multiple → "Download Selected" → format → ZIP generation with progress
- ZIP download shows: "Preparing your photos... 45%" with animated progress bar

### 6.8 PIN Entry
- Numeric keypad for locked photos
- Masked input (dots)
- Shake animation on wrong PIN
- "Forgot PIN? Contact your photographer" link
- Supports both gallery-wide PIN and per-photo PIN scopes

### 6.9 FaceID Camera
- Camera viewfinder with face outline guide
- "Take Photo" capture button
- "Or upload a photo instead" link below
- Privacy notice: "Your photo is used only to find your images and is not stored."
- Loading state: "Finding your photos..."
- Result: filtered gallery view of matching photos

### 6.10 PWA Install Banner
- Contextual: "Add this gallery to your home screen"
- Platform-specific instructions (iOS: share → Add to Home, Android: native prompt)
- Dismissible with "Not now" (don't show again for 7 days)

### 6.11 WhatsApp Share Button
- Green WhatsApp branded button
- Pre-filled message: "Check out these photos: [gallery link]"
- Available on gallery, favorites, individual photos

### 6.12 Loading States
- Skeleton screens for gallery grid
- Blur-up LQIP for individual photos
- Spinner for operations (download, ZIP, FaceID)
- "Loading more photos..." at infinite scroll boundary

### 6.13 Empty States
- "No favorites yet — tap the heart icon on any photo"
- "No comments on this photo yet"
- "No selections made — start by categorizing photos"

### 6.14 Error States
- "Wrong password — please try again" (with shake)
- "This gallery was not found"
- "Access to this gallery has been revoked"
- "This gallery has expired — contact your photographer"
- "You're offline — connect to view photos"
- "Face not recognized — browse all photos instead"

---

## 7. Business Rules and Validation

### 7.1 Access Control

**BR-CLI-ACC-001**: Access strictly controlled by photographer's gallery settings.
**BR-CLI-ACC-002**: Password/PIN must match before gallery content shown.
**BR-CLI-ACC-003**: Gallery expiry enforced — expired galleries show expiry message + photographer contact.
**BR-CLI-ACC-004**: Download permissions enforced — no download button if disabled.
**BR-CLI-ACC-005**: Watermarked images shown if photographer configured watermarks.
**BR-CLI-ACC-006**: Favorite/comment features only if photographer enabled them.

### 7.2 FaceID Rules

**BR-CLI-FACE-001**: FaceID consent required before camera access.
**BR-CLI-FACE-002**: Face matching scoped to current gallery only — no cross-gallery.
**BR-CLI-FACE-003**: FaceID only available if photographer enabled it for this gallery.
**BR-CLI-FACE-004**: Selfie/photo not stored after matching completes.

### 7.3 Privacy

**BR-CLI-PRV-001**: Client cannot access photographer's workspace or other clients' data.
**BR-CLI-PRV-002**: Client cannot see photographer's business data (billing, analytics, CRM).
**BR-CLI-PRV-003**: Public gallery SEO metadata must be present for search engines.
**BR-CLI-PRV-004**: PWA manifest must be gallery-specific with photographer's branding.

### 7.4 Proofing Rules

**BR-CLI-PRF-001**: Selection submission is final once photographer marks proofing as closed.
**BR-CLI-PRF-002**: Client can modify selections until submission deadline (if set).
**BR-CLI-PRF-003**: Selection categories defined by photographer, not client.

---

## 8. Notifications and Alerts

| Trigger | Priority | Channel |
|---------|----------|---------|
| Gallery shared with you | High | Email + WhatsApp/SMS |
| New photos added to gallery | Medium | Email (if registered) |
| Proofing reminder | High | Email + WhatsApp/SMS |
| Proofing feedback from photographer | Medium | Email |
| New message from photographer | Medium | Email (if registered) |
| Gallery approaching expiry | Medium | Email |
| Live stream starting soon | High | Email + SMS |
| Download ready (bulk ZIP) | Low | In-app |

---

## 9. Performance Requirements

| Metric | Target |
|--------|--------|
| Gallery first meaningful render | < 3 seconds on broadband mobile |
| LQIP placeholder visible | < 500ms |
| Lightbox transition | < 200ms |
| Infinite scroll next batch | Loads before user reaches bottom |
| PWA install prompt | Within 5 seconds of repeated visit |
| Offline shell load | Immediate (cached) |
| FaceID matching response | < 5 seconds |
| Download initiation | < 1 second for single photo |

---

## 10. Accessibility Requirements

| Requirement | Standard |
|------------|----------|
| Touch targets | Minimum 44px (WCAG 2.1) |
| Swipe gestures | Button alternatives always available |
| Screen reader | Full gallery navigation support |
| High contrast | Supported mode |
| Keyboard navigation | Full desktop support (arrows, ESC, tab) |
| Alt text | From AI tagging where available |
| Focus management | Lightbox traps focus, returns on close |
| Color independence | Never rely on color alone for meaning |

---

## 11. Restricted Actions — Explicit Denials

| # | Denied Action | Enforcement |
|---|-------------|-------------|
| RD-CLI-001 | Access photographer's workspace | No workspace routes |
| RD-CLI-002 | Access admin/dealer portals | No admin routes |
| RD-CLI-003 | See other clients' data | Data isolation per gallery access |
| RD-CLI-004 | Modify gallery settings | No settings UI |
| RD-CLI-005 | Delete photos | No delete controls |
| RD-CLI-006 | Upload photos (except FaceID selfie) | No upload zone |
| RD-CLI-007 | Change photographer's branding | No branding UI |
| RD-CLI-008 | Access billing/subscription | No billing screens |
| RD-CLI-009 | View platform analytics | No analytics screens |
| RD-CLI-010 | Access CRM data | No CRM screens |
| RD-CLI-011 | Download if photographer disabled | No download controls rendered |
| RD-CLI-012 | Comment if photographer disabled | No comment input rendered |
| RD-CLI-013 | Favorite if photographer disabled | No favorite button rendered |

---

## 12. Cross-References

| PRD Section | Client Coverage |
|-------------|----------------|
| 15 (Gallery System) | Sections 2, 5.1 |
| 15.4 (FaceID) | Section 2.3, 6.9 |
| 15.5 (Sensitive Locking) | Section 5.1, 6.8 |
| 15.7 (PWA) | Section 2.6, 6.10 |
| 15.8 (Conversion) | Section 5.3 (Inquiry) |
| 15.2 (Proofing) | Section 5.1 (Selections), 6.5-6.6 |
| 17 (AI) | Section 2.3 (FaceID) |
| 23 (Public Profiles) | Section 5.3 |
| 25 (Communication) | Section 5.4 |
| 26 (Live Streaming) | Section 5.5 |

---

## 13. Acceptance Criteria

### 13.1 Gallery Access
**AC-CLI-001**: Given a gallery link, when client clicks it, then gallery renders within 3 seconds.
**AC-CLI-002**: Given a password-protected gallery, when wrong password entered, then shake + error shown, gallery NOT revealed.
**AC-CLI-003**: Given an expired gallery, when client visits, then expiry message + photographer contact shown.
**AC-CLI-004**: Given a gallery with downloads disabled, then no download button exists in DOM.

### 13.2 FaceID
**AC-CLI-005**: Given FaceID enabled, when client opens camera, then privacy consent shown first.
**AC-CLI-006**: Given consent granted and selfie taken, then matching photos shown within 5 seconds.
**AC-CLI-007**: Given no face match, then "Browse all photos" fallback shown.
**AC-CLI-008**: Given FaceID disabled by photographer, then no FaceID icon visible.

### 13.3 Favorites & Proofing
**AC-CLI-009**: Given favorites enabled, when client taps heart, then instant visual feedback + count updates.
**AC-CLI-010**: Given proofing enabled, when client categorizes photos, then counter updates per category.
**AC-CLI-011**: Given client submits selections, then photographer receives notification.

### 13.4 Sensitive Photos
**AC-CLI-012**: Given a PIN-locked photo, then blurred placeholder shown until correct PIN entered.
**AC-CLI-013**: Given wrong PIN, then shake animation + error message (not revealing the photo).

### 13.5 Downloads
**AC-CLI-014**: Given downloads enabled, when client downloads single photo, then download starts within 1 second.
**AC-CLI-015**: Given bulk download, then ZIP generation shows progress and completes.

### 13.6 PWA
**AC-CLI-016**: Given repeated gallery visit, then PWA install prompt appears within 5 seconds.
**AC-CLI-017**: Given installed PWA, when opened, then goes directly to the gallery.
**AC-CLI-018**: Given offline with installed PWA, then branded offline shell shown.

### 13.7 Performance
**AC-CLI-019**: Given gallery with 500 photos on mobile broadband, then first 20 photos render within 3 seconds.
**AC-CLI-020**: Given lightbox open, then swipe to next photo completes within 200ms.
**AC-CLI-021**: Given infinite scroll, then next batch loads before user reaches bottom of current batch.

### 13.8 Public Profile
**AC-CLI-022**: Given photographer profile at `/u/{slug}`, then bio, services, galleries, booking CTA all render.
**AC-CLI-023**: Given WhatsApp CTA, when tapped on mobile, then WhatsApp opens with pre-filled message.
**AC-CLI-024**: Given vCard download, then contact file downloads with correct photographer details.

### 13.9 Live Streaming
**AC-CLI-025**: Given stream access, when client opens stream, then video starts within 2 seconds.
**AC-CLI-026**: Given chat enabled, then client can send/receive messages during stream.

### 13.10 Accessibility
**AC-CLI-027**: Given a screen reader user, when navigating gallery, then all photos have descriptive labels.
**AC-CLI-028**: Given keyboard-only user on desktop, then can navigate: grid, lightbox, favorites, selections.
**AC-CLI-029**: Given pinch-zoom disabled, then zoom buttons available as alternative.

### 13.11 Branding
**AC-CLI-030**: Given a photographer with custom branding, then NO RawDrive branding visible to client.
**AC-CLI-031**: Given photographer logo uploaded, then logo appears on gallery, password screen, and PWA icon.

---

## Requirement Summary

| Category | Count |
|----------|-------|
| Functional Requirements (FR-CLI-*) | 20 |
| Business Rules (BR-CLI-*) | 14 |
| Performance Requirements | 8 |
| Accessibility Requirements | 8 |
| Restricted Actions (RD-CLI-*) | 13 |
| Acceptance Criteria (AC-CLI-*) | 31 |
| **Total Testable Requirements** | **94** |

---

*End of Client / Family / Guest Role Frontend Requirements Specification*
