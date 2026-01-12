# Feature Specification: Gallery Feature Completion

**Feature Branch**: `027-gallery-feature-completion`
**Created**: 2026-01-10
**Status**: Draft
**Input**: Complete gallery feature gaps - implement missing/incomplete features for production-ready galleries. Excludes IP whitelisting and video captions.

## Pre-Implementation Analysis

Based on codebase review, the following features are **already implemented** and excluded from this spec:
- **Remember me for gallery passwords** - ✅ Uses localStorage `PASSWORD_VERIFIED_KEY_PREFIX`
- **Touch targets 44x44px** - ✅ CSS `.touch-target` class with 44px min dimensions
- **AI tags search** - ✅ `ai_tags JSONB` field exists, typed in `PublicGalleryAsset`
- **Share analytics** - ✅ `MagicLinkStats` with device/country/day breakdown implemented

The following have **partial implementation** and need completion:
- **Per-photo access codes** - DB field `access_code_hash` exists but no API/UI
- **RTL support** - i18n config exists but CSS logical properties not applied

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-Photo Access Codes (Priority: P1)

As a photographer, I want to assign unique access codes to specific photos so only clients who receive the code can view sensitive images (e.g., wedding gift photos, surprise party reveals).

**Why this priority**: Core privacy feature that enables photographers to share galleries publicly while protecting select images.

**Existing Implementation**: Database field `access_code_hash` exists in `gallery_assets` table (migration 0002).

**Work Required**: Add API endpoint for code verification, frontend modal for code entry, photographer UI for setting codes.

**Independent Test**: Set access code on photo, share gallery link, attempt to view photo - code prompt should appear. Enter correct code - photo becomes visible.

**Acceptance Scenarios**:

1. **Given** a photo with access code "GIFT2026", **When** client views gallery, **Then** photo appears blurred/locked with "Enter code" overlay
2. **Given** locked photo, **When** client enters correct code, **Then** photo unlocks and remains unlocked for session
3. **Given** locked photo, **When** client enters incorrect code 3 times, **Then** 5-minute lockout applies
4. **Given** photographer, **When** setting access code on photo, **Then** code can be 4-8 alphanumeric characters

---

### User Story 2 - Daily Download Limits (Priority: P1)

As a photographer, I want to limit how many photos clients can download per day to prevent bulk downloads of watermarked previews or abuse of download policies.

**Why this priority**: Business protection - prevents clients from downloading entire galleries before payment.

**Existing Implementation**: None. Download policy only controls quality tiers (view_only, web_only, etc.).

**Work Required**: Add `daily_download_limit` field to galleries, implement Redis-based counter, add middleware enforcement.

**Independent Test**: Set daily limit to 10, download 10 photos - 11th download should be blocked with "Daily limit reached" message.

**Acceptance Scenarios**:

1. **Given** gallery with daily limit of 10, **When** client downloads 10 photos, **Then** further downloads blocked until next calendar day (midnight UTC)
2. **Given** blocked client, **When** next day arrives, **Then** download counter resets to 0
3. **Given** gallery without limit, **When** client downloads any number of photos, **Then** no restrictions apply
4. **Given** photographer, **When** setting daily limit, **Then** can choose 5, 10, 25, 50, 100, or unlimited

---

### User Story 3 - High Contrast Mode (Priority: P1)

As a visually impaired client, I want to enable high contrast mode so I can navigate the gallery more easily.

**Why this priority**: WCAG 2.1 AA compliance requirement - ensures galleries are accessible to all users.

**Existing Implementation**: None. Theme system only supports light/dark/system.

**Work Required**: Add high-contrast CSS theme variables, accessibility toggle in gallery header, localStorage persistence.

**Independent Test**: Enable high contrast via preference, verify all text meets 7:1 contrast ratio, all interactive elements clearly visible.

**Acceptance Scenarios**:

1. **Given** any gallery page, **When** client enables high contrast mode, **Then** color scheme switches to high contrast theme immediately
2. **Given** high contrast mode, **When** text and background are displayed, **Then** contrast ratio is at least 7:1
3. **Given** high contrast preference set, **When** client visits any gallery, **Then** high contrast mode persists across sessions

---

### User Story 4 - Skip Links for Accessibility (Priority: P2)

As a keyboard-only user, I want skip links at the top of gallery pages so I can quickly navigate to main content without tabbing through navigation.

**Why this priority**: Core WCAG 2.1 AA requirement for keyboard accessibility.

**Existing Implementation**: None. Screen reader announcements exist but no skip links.

**Work Required**: Create SkipLinks component, add to PublicGalleryPage and Lightbox.

**Independent Test**: Press Tab on gallery page - first focusable element should be "Skip to main content" link. Press Enter - focus moves to main gallery grid.

**Acceptance Scenarios**:

1. **Given** any gallery page, **When** user presses Tab key as first action, **Then** "Skip to main content" link receives focus
2. **Given** skip link focused, **When** user presses Enter, **Then** focus moves to first photo in gallery grid
3. **Given** lightbox open, **When** user presses Tab, **Then** "Skip to photo actions" link is available

---

### User Story 5 - RTL Layout for Urdu (Priority: P2)

As an Urdu-speaking client, I want the gallery interface to display in right-to-left layout so text reads naturally and navigation feels intuitive.

**Why this priority**: Market expansion - Pakistan/India market requires proper RTL support.

**Existing Implementation**: i18n config includes Urdu with `dir: 'rtl'` and Noto Nastaliq Urdu font. CSS logical properties not applied.

**Work Required**: Add `dir="rtl"` attribute based on locale, convert CSS to logical properties (margin-inline, padding-inline), flip navigation arrows.

**Independent Test**: Set language to Urdu, verify entire UI flips to RTL including navigation, buttons, and text alignment.

**Acceptance Scenarios**:

1. **Given** gallery with Urdu language, **When** page loads, **Then** entire layout renders right-to-left
2. **Given** RTL layout, **When** viewing navigation arrows, **Then** "next" arrow points left, "previous" points right
3. **Given** RTL layout, **When** viewing gallery grid, **Then** photos flow from right to left

---

### User Story 6 - Breadcrumb Navigation (Priority: P3)

As a client browsing nested sub-galleries, I want breadcrumb navigation so I can see my current location and quickly navigate back to parent folders.

**Why this priority**: Essential for galleries with folder structures deeper than one level.

**Existing Implementation**: None. Sub-gallery tabs exist but no hierarchical breadcrumbs.

**Work Required**: Create Breadcrumbs component, integrate with sub-gallery navigation.

**Independent Test**: Navigate into nested folder, verify breadcrumb shows full path, click parent breadcrumb to return.

**Acceptance Scenarios**:

1. **Given** nested sub-gallery structure, **When** client navigates to "Reception > Cake Cutting", **Then** breadcrumb shows "Gallery > Reception > Cake Cutting"
2. **Given** breadcrumb displayed, **When** client clicks "Reception", **Then** navigates directly to Reception sub-gallery
3. **Given** root gallery, **When** viewing, **Then** breadcrumb shows only gallery name

---

### User Story 7 - Nested Sub-Galleries (Priority: P3)

As a photographer, I want to create sub-galleries within sub-galleries to organize large events with multiple nested categories.

**Why this priority**: Required for complex event structures (multi-day weddings, corporate conferences).

**Existing Implementation**: None. `SubGalleryEntity` only references `gallery_id`, not parent sub-gallery.

**Work Required**: Add `parent_sub_gallery_id` field to sub_galleries table, update API endpoints, frontend nested navigation.

**Independent Test**: Create sub-gallery "Day 1", create sub-gallery "Ceremony" within it, add photos - navigation works correctly.

**Acceptance Scenarios**:

1. **Given** sub-gallery "Day 1", **When** photographer creates new sub-gallery "Ceremony" inside, **Then** nested structure is created
2. **Given** nested structure, **When** client navigates, **Then** can drill down and up through hierarchy
3. **Given** deeply nested structure, **When** exceeding 3 levels, **Then** system prevents further nesting with warning

---

### User Story 8 - UTM Tracking for Share Links (Priority: P3)

As a photographer, I want to add UTM parameters to share links so I can track which marketing channels drive gallery views.

**Why this priority**: Business intelligence - helps photographers understand referral sources.

**Existing Implementation**: None. Magic links have no `utm_params` field.

**Work Required**: Add `utm_params JSONB` field to magic_links table, update share link creation UI.

**Independent Test**: Create share link with UTM source "instagram", share link - analytics should attribute visit to Instagram.

**Acceptance Scenarios**:

1. **Given** share link creation, **When** photographer adds UTM parameters, **Then** link includes ?utm_source=X&utm_medium=Y
2. **Given** UTM-tagged link, **When** client visits gallery, **Then** source is recorded in analytics
3. **Given** analytics dashboard, **When** viewing, **Then** can filter by UTM source/medium/campaign

---

### User Story 9 - Gallery Password Reset (Priority: P4)

As a client who forgot the gallery password, I want to request a password reset so I can regain access without contacting the photographer.

**Why this priority**: Reduces photographer support burden for common access issues.

**Existing Implementation**: None. Only photographers can set/reset passwords.

**Work Required**: Add password reset endpoint, email flow via notifications-service, "Forgot password" UI.

**Independent Test**: Click "Forgot password", enter email, receive link, reset password - access restored.

**Acceptance Scenarios**:

1. **Given** password-protected gallery, **When** client clicks "Forgot password", **Then** email input form appears
2. **Given** registered email, **When** client submits, **Then** reset link sent to email
3. **Given** reset link clicked, **When** within 1 hour, **Then** client can access gallery without password for that session

---

### User Story 10 - Slideshow Background Music (Priority: P4)

As a photographer, I want to add background music to slideshows so clients have an enhanced viewing experience.

**Why this priority**: Premium feature for wedding and event photographers.

**Existing Implementation**: `SlideshowConfig` exists with interval, transition, autoplay but no `audio_url` field.

**Work Required**: Add `audio_url` field to SlideshowConfig, audio player component, photographer upload UI.

**Independent Test**: Upload audio file, start slideshow - music plays automatically, mutes when slideshow paused.

**Acceptance Scenarios**:

1. **Given** gallery with audio file, **When** slideshow starts, **Then** music begins playing automatically (if autoplay allowed)
2. **Given** playing slideshow, **When** client pauses, **Then** music pauses synchronously
3. **Given** mobile browser, **When** autoplay blocked, **Then** "Play music" button appears

---

### Edge Cases

- How does system handle per-photo access codes on downloaded images? Codes only gate viewing; downloads follow download policy.
- What happens when daily download limit is reached mid-ZIP creation? Complete current ZIP, block next request.
- How does high contrast mode interact with branded galleries? Override brand colors with accessible alternatives.
- What happens when RTL text is mixed with LTR (URLs, numbers)? Use CSS bidirectional isolation.
- How are access codes handled in ZIP downloads? Photos with codes are excluded unless code was verified in session.
- What happens when sub-gallery nesting exceeds 3 levels? System prevents creation and shows user warning.

## Requirements *(mandatory)*

### Functional Requirements

**Tier 1: Critical UX**
- **FR-001**: System MUST allow photographers to set 4-8 character alphanumeric access codes on individual photos (complete existing DB field integration)
- **FR-002**: System MUST enforce daily download limits configurable as 5, 10, 25, 50, 100, or unlimited
- **FR-003**: System MUST provide high contrast mode meeting WCAG AAA (7:1) contrast ratio

**Tier 2: Accessibility**
- **FR-004**: System MUST provide skip links on all gallery pages (skip to content, skip to navigation)
- **FR-005**: System MUST render right-to-left layout for Urdu locale including mirrored navigation (complete existing i18n)

**Tier 3: Enhanced Features**
- **FR-006**: System MUST display breadcrumb navigation for nested sub-galleries
- **FR-007**: System MUST support up to 3 levels of nested sub-galleries
- **FR-008**: System MUST allow adding UTM parameters (source, medium, campaign) to share links

**Tier 4: Media Enhancements**
- **FR-009**: System MUST provide email-based password reset for gallery access
- **FR-010**: System MUST support audio file attachment for slideshow background music

### Key Entities

- **PhotoAccessCode**: Per-photo access control (asset_id, code_hash, created_by, created_at) - extends existing `access_code_hash` field
- **DownloadQuota**: Daily download tracking (client_identifier, gallery_id, date, download_count)
- **SubGalleryHierarchy**: Nested folder structure (sub_gallery_id, parent_sub_gallery_id, depth)
- **GalleryPasswordReset**: Temporary access tokens (gallery_id, email, token_hash, expires_at)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 99% of per-photo access code verifications complete in under 500ms
- **SC-002**: Daily download limit enforcement has zero false negatives (no bypasses)
- **SC-003**: High contrast mode passes WCAG 2.1 AAA audit with zero failures
- **SC-004**: Skip links enable keyboard users to reach main content within 3 keypresses
- **SC-005**: RTL layout renders correctly for all UI components with zero text overlap issues
- **SC-006**: Breadcrumb navigation correctly reflects location at all nesting depths
- **SC-007**: UTM parameters are correctly appended to 100% of configured share links
- **SC-008**: Password reset emails deliver within 60 seconds of request
- **SC-009**: Slideshow audio plays smoothly without buffering on 4G connections

## Assumptions

1. **Storage**: Audio files limited to 10MB
2. **Nesting Limit**: Sub-gallery nesting limited to 3 levels to prevent UI complexity
3. **Download Limit Reset**: Daily limits reset at midnight UTC, not per 24-hour rolling window
4. **High Contrast**: Overrides gallery branding colors when enabled (accessibility takes priority)
5. **RTL**: Only applies to Urdu locale; other RTL languages follow same pattern if added
6. **Access Code Security**: Codes are hashed; actual codes are never stored in database
7. **Email Service**: Notifications-service is available and configured for password reset emails
8. **Redis**: Redis is available for download quota tracking and rate limiting

## Out of Scope

- IP whitelisting (Enterprise feature, explicitly excluded per user request)
- Video captions/subtitles (explicitly excluded per user request)
- Audio file editing/trimming (users upload final files)
- Advanced analytics dashboards (basic stats already implemented via MagicLinkStats)
- Access code bulk generation (individual codes only for v1)
- Album proofing (separate feature on branch 026-album-proofing)
- Gallery password persistence (already implemented via localStorage)
- Touch target sizing (already implemented via CSS)
- AI tags search (already implemented)
- Share analytics dashboard (already implemented via MagicLinkStats)
