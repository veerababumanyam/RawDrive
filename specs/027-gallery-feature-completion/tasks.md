# Tasks: Gallery Feature Completion

**Input**: Design documents from `/specs/027-gallery-feature-completion/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend main API**: `backend/src/app/`
- **Gallery microservice**: `services/gallery-service/src/`
- **Frontend**: `frontend/src/`
- **Migrations**: `backend/migrations/versions/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema changes and shared service setup

- [X] T001 Create migration file `backend/migrations/versions/0162_gallery_feature_completion.py`
- [X] T002 Add `daily_download_limit` and `slideshow_audio_url` columns to galleries table
- [X] T003 Add `parent_sub_gallery_id` and `depth` columns to sub_galleries table with max depth constraint
- [X] T004 Create `gallery_password_resets` table with indexes
- [X] T005 Add `utm_params` JSONB column to magic_links table
- [X] T006 [P] Create sub-gallery hierarchy validation trigger in migration
- [ ] T007 Run migration and verify schema changes: `docker exec rawdrive-backend alembic upgrade head`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core services and utilities that multiple user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 [P] Create `backend/src/app/services/access_code_service.py` with bcrypt verification logic
- [X] T009 [P] Create `backend/src/app/services/download_quota_service.py` with Redis INCR and TTL
- [X] T010 [P] Create `backend/src/app/services/gallery_password_reset_service.py` with token generation
- [X] T011 [P] Create `frontend/src/hooks/useRTL.ts` for RTL locale detection
- [X] T012 [P] Create `frontend/src/hooks/useHighContrast.ts` for contrast mode persistence
- [X] T013 [P] Create `frontend/src/styles/high-contrast.css` with WCAG AAA color variables
- [X] T014 Add `AccessCodeService` dependency injection to `backend/src/app/api/v1/__init__.py`
- [X] T015 Add `DownloadQuotaService` dependency injection to `backend/src/app/api/v1/__init__.py`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Per-Photo Access Codes (Priority: P1) MVP

**Goal**: Allow photographers to set unique access codes on individual photos to protect sensitive images

**Independent Test**: Set access code on photo, share gallery, attempt to view - code prompt appears. Enter correct code - photo unlocks for session.

### Implementation for User Story 1

- [X] T016 [US1] Add `POST /api/v1/public/galleries/{gallery_id}/assets/{asset_id}/verify-code` endpoint to `backend/src/app/api/v1/public_galleries.py`
- [X] T017 [US1] Add `PUT /api/v1/galleries/{gallery_id}/assets/{asset_id}/access-code` endpoint to `backend/src/app/api/v1/galleries.py`
- [X] T018 [US1] Add `DELETE /api/v1/galleries/{gallery_id}/assets/{asset_id}/access-code` endpoint to `backend/src/app/api/v1/galleries.py`
- [X] T019 [US1] Add Redis lockout tracking (3 failures = 5 min block) to `access_code_service.py`
- [X] T020 [P] [US1] Create Pydantic schemas `VerifyCodeRequest`, `AccessCodeRequest` in `backend/src/app/schemas/access_code.py`
- [X] T021 [P] [US1] Create `frontend/src/components/features/gallery/AccessCodeModal.tsx` with code input UI
- [ ] T022 [US1] Add locked photo overlay (blur + "Enter code") to `frontend/src/components/features/gallery/PhotoCard.tsx`
- [ ] T023 [US1] Add session storage for verified codes in `frontend/src/services/galleryService.ts`
- [ ] T024 [US1] Add photographer UI for setting codes in gallery asset management panel

**Checkpoint**: Per-photo access codes fully functional and testable

---

## Phase 4: User Story 2 - Daily Download Limits (Priority: P1)

**Goal**: Allow photographers to limit how many photos clients can download per day

**Independent Test**: Set daily limit to 10, download 10 photos - 11th download blocked with "Daily limit reached" message.

### Implementation for User Story 2

- [ ] T025 [US2] Create `backend/src/app/middleware/download_limit_middleware.py` with quota check
- [ ] T026 [US2] Add `PUT /api/v1/galleries/{gallery_id}/download-limit` endpoint to `backend/src/app/api/v1/galleries.py`
- [ ] T027 [US2] Add `GET /api/v1/galleries/{gallery_id}/download-limit` endpoint for current usage
- [ ] T028 [US2] Integrate middleware with download endpoints in `backend/src/app/api/v1/media.py`
- [ ] T029 [P] [US2] Create Pydantic schema `DownloadLimitRequest` in `backend/src/app/schemas/gallery.py`
- [ ] T030 [P] [US2] Add download limit selector (5/10/25/50/100/unlimited) to `frontend/src/components/features/gallery/DownloadSettings.tsx`
- [ ] T031 [US2] Add remaining downloads counter to public gallery UI in `frontend/src/pages/public/PublicGalleryPage.tsx`
- [ ] T032 [US2] Add 429 error handling with "Daily limit reached" message and reset time display

**Checkpoint**: Daily download limits fully functional and testable

---

## Phase 5: User Story 3 - High Contrast Mode (Priority: P1)

**Goal**: Provide WCAG AAA compliant high contrast mode for visually impaired users

**Independent Test**: Enable high contrast via toggle, verify all text meets 7:1 contrast ratio.

### Implementation for User Story 3

- [X] T033 [P] [US3] Create `frontend/src/components/features/gallery/HighContrastToggle.tsx` with accessibility icon
- [ ] T034 [US3] Add CSS custom properties for high contrast in `frontend/src/index.css` (:root.high-contrast)
- [ ] T035 [US3] Add `document.documentElement.classList.toggle('high-contrast')` logic to toggle component
- [ ] T036 [US3] Persist preference using localStorage key `rawdrive_high_contrast`
- [ ] T037 [US3] Add high contrast toggle to public gallery header in `frontend/src/pages/public/PublicGalleryPage.tsx`
- [ ] T038 [US3] Override gallery branding colors when high contrast is active

**Checkpoint**: High contrast mode fully functional, passes WCAG AAA audit

---

## Phase 6: User Story 4 - Skip Links for Accessibility (Priority: P2)

**Goal**: Provide skip links for keyboard-only users to bypass navigation

**Independent Test**: Press Tab on gallery page - "Skip to main content" link receives focus. Press Enter - focus moves to gallery grid.

### Implementation for User Story 4

- [X] T039 [P] [US4] Create `frontend/src/components/ui/SkipLinks.tsx` component
- [ ] T040 [US4] Add skip link CSS (visually hidden until focus) to `frontend/src/index.css`
- [ ] T041 [US4] Add SkipLinks component to `frontend/src/pages/public/PublicGalleryPage.tsx` as first child
- [ ] T042 [US4] Add target IDs (`id="main-content"`, `id="gallery-grid"`) to main content sections
- [ ] T043 [US4] Add "Skip to photo actions" link to Lightbox in `frontend/src/components/features/gallery/Lightbox.tsx`
- [ ] T044 [US4] Add i18n translations for skip link text in `frontend/public/locales/en/gallery.json`

**Checkpoint**: Skip links functional for keyboard navigation

---

## Phase 7: User Story 5 - RTL Layout for Urdu (Priority: P2)

**Goal**: Render gallery UI in right-to-left layout for Urdu locale

**Independent Test**: Set language to Urdu, verify entire UI flips to RTL including navigation arrows.

### Implementation for User Story 5

- [ ] T045 [US5] Add `dir="rtl"` attribute based on locale in `frontend/src/App.tsx` or root layout
- [ ] T046 [US5] Convert physical CSS properties to logical properties in `frontend/src/index.css`:
  - `margin-left` → `margin-inline-start`
  - `margin-right` → `margin-inline-end`
  - `padding-left` → `padding-inline-start`
  - `text-align: left` → `text-align: start`
- [ ] T047 [P] [US5] Update gallery grid to flow RTL when `dir="rtl"` is set
- [ ] T048 [US5] Add `transform: scaleX(-1)` or logical property for navigation arrows in RTL
- [ ] T049 [US5] Test bidirectional text isolation for mixed LTR/RTL content (URLs, numbers)
- [ ] T050 [US5] Add Urdu locale to E2E test matrix

**Checkpoint**: RTL layout fully functional for Urdu locale

---

## Phase 8: User Story 6 - Breadcrumb Navigation (Priority: P3)

**Goal**: Show current location in nested sub-gallery structure with clickable path

**Independent Test**: Navigate to "Reception > Cake Cutting", breadcrumb shows full path, click parent to return.

### Implementation for User Story 6

- [X] T051 [P] [US6] Create `frontend/src/components/features/gallery/Breadcrumbs.tsx` component
- [ ] T052 [US6] Add `GET /api/v1/galleries/{gallery_id}/breadcrumbs` endpoint to `services/gallery-service/src/api/v1/public/galleries.py`
- [ ] T053 [US6] Implement recursive CTE query for ancestor lookup in `services/gallery-service/src/services/gallery_service.py`
- [ ] T054 [US6] Add breadcrumb response schema in `services/gallery-service/src/schemas/gallery.py`
- [ ] T055 [US6] Integrate Breadcrumbs component with sub-gallery navigation in `frontend/src/pages/public/PublicGalleryPage.tsx`
- [ ] T056 [US6] Add `aria-label="Breadcrumb"` and `aria-current="page"` for accessibility

**Checkpoint**: Breadcrumb navigation fully functional

---

## Phase 9: User Story 7 - Nested Sub-Galleries (Priority: P3)

**Goal**: Allow photographers to create sub-galleries within sub-galleries (max 3 levels)

**Independent Test**: Create "Day 1" sub-gallery, create "Ceremony" inside it - nested navigation works.

### Implementation for User Story 7

- [ ] T057 [US7] Update `SubGalleryCreate` schema to include optional `parent_sub_gallery_id` in `services/gallery-service/src/schemas/sub_gallery.py`
- [ ] T058 [US7] Update sub-gallery creation endpoint to handle parent assignment in `services/gallery-service/src/api/v1/galleries.py`
- [ ] T059 [US7] Add depth calculation and validation in gallery service
- [ ] T060 [P] [US7] Create `frontend/src/components/features/gallery/SubGalleryTree.tsx` for hierarchical display
- [ ] T061 [US7] Update sub-gallery creation UI to allow selecting parent folder
- [ ] T062 [US7] Add "Maximum nesting depth reached" warning when depth > 2

**Checkpoint**: Nested sub-galleries fully functional

---

## Phase 10: User Story 8 - UTM Tracking for Share Links (Priority: P3)

**Goal**: Allow photographers to add UTM parameters to share links for marketing attribution

**Independent Test**: Create share link with UTM source "instagram", analytics show correct attribution.

### Implementation for User Story 8

- [ ] T063 [US8] Update magic link creation to accept `utm_params` in `backend/src/app/services/magic_link_service.py`
- [ ] T064 [US8] Add `utm_params` field to magic link response schema
- [ ] T065 [P] [US8] Add UTM parameter inputs (source, medium, campaign, content) to `frontend/src/components/features/gallery/ShareMenu.tsx`
- [ ] T066 [US8] Append UTM params to generated share URLs
- [ ] T067 [US8] Record UTM source in magic link stats on gallery access
- [ ] T068 [US8] Display UTM breakdown in share link analytics

**Checkpoint**: UTM tracking fully functional

---

## Phase 11: User Story 9 - Gallery Password Reset (Priority: P4)

**Goal**: Allow clients to reset gallery password via email

**Independent Test**: Click "Forgot password", enter email, receive link, access gallery without password.

### Implementation for User Story 9

- [ ] T069 [US9] Add `POST /api/v1/public/galleries/{gallery_id}/password-reset/request` endpoint to `backend/src/app/api/v1/public_galleries.py`
- [ ] T070 [US9] Add `POST /api/v1/public/galleries/{gallery_id}/password-reset/verify` endpoint
- [ ] T071 [US9] Implement token generation and email sending via notifications-service
- [ ] T072 [US9] Add rate limiting (3 requests/hour per email) to password reset endpoint
- [ ] T073 [P] [US9] Create `frontend/src/components/features/gallery/PasswordResetModal.tsx`
- [ ] T074 [US9] Add "Forgot password?" link to `frontend/src/components/features/gallery/PasswordVerificationModal.tsx`
- [ ] T075 [US9] Create password reset email template in `services/notifications-service/src/templates/gallery_password_reset.py`
- [ ] T076 [US9] Handle reset token verification and grant session access

**Checkpoint**: Password reset flow fully functional

---

## Phase 12: User Story 10 - Slideshow Background Music (Priority: P4)

**Goal**: Allow photographers to add background music to gallery slideshows

**Independent Test**: Upload audio file, start slideshow - music plays. Pause slideshow - music pauses.

### Implementation for User Story 10

- [ ] T077 [US10] Add audio file upload endpoint with 10MB limit in `backend/src/app/api/v1/galleries.py`
- [ ] T078 [US10] Store audio URL in R2 and save to `slideshow_audio_url` field
- [ ] T079 [P] [US10] Create `frontend/src/components/features/gallery/SlideshowAudioPlayer.tsx`
- [ ] T080 [US10] Integrate audio player with slideshow controls (play/pause sync)
- [ ] T081 [US10] Handle browser autoplay policy with fallback "Play music" button
- [ ] T082 [US10] Add audio file selector to slideshow settings in photographer UI
- [ ] T083 [US10] Add volume control and mute toggle to audio player

**Checkpoint**: Slideshow background music fully functional

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [ ] T084 [P] Update `docs/Features/GALLERY_REQUIREMENTS_ANALYSIS.md` with completed feature status
- [ ] T085 [P] Add i18n translations for all new UI strings in `frontend/public/locales/en/gallery.json`
- [ ] T086 [P] Add i18n translations for Urdu in `frontend/public/locales/ur/gallery.json`
- [ ] T087 Add Prometheus metrics for download quota checks and access code verifications
- [ ] T088 Add structured logging with correlation IDs to new services
- [ ] T089 Run quickstart.md validation checklist
- [ ] T090 Manual accessibility audit with screen reader testing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (migration must be applied)
- **User Stories (Phase 3-12)**: All depend on Foundational phase completion
  - P1 stories (US1, US2, US3) should be prioritized
  - P2 stories (US4, US5) follow P1 completion
  - P3 stories (US6, US7, US8) follow P2 completion
  - P4 stories (US9, US10) follow P3 completion
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | Depends On | Notes |
|-------|------------|-------|
| US1 (Access Codes) | Foundational | Uses `access_code_service.py` |
| US2 (Download Limits) | Foundational | Uses `download_quota_service.py` |
| US3 (High Contrast) | Foundational | Uses `useHighContrast.ts` |
| US4 (Skip Links) | None | Frontend only, can start with Foundational |
| US5 (RTL) | Foundational | Uses `useRTL.ts` |
| US6 (Breadcrumbs) | US7 (optional) | Works better with nested sub-galleries |
| US7 (Nested Sub-Galleries) | Migration | Requires `parent_sub_gallery_id` field |
| US8 (UTM Tracking) | Migration | Requires `utm_params` field |
| US9 (Password Reset) | Foundational, Migration | Uses `gallery_password_reset_service.py` |
| US10 (Slideshow Audio) | Migration | Requires `slideshow_audio_url` field |

### Parallel Opportunities

**Phase 2 (Foundational)**:
```bash
# All services can be created in parallel:
T008: access_code_service.py
T009: download_quota_service.py
T010: gallery_password_reset_service.py
T011: useRTL.ts
T012: useHighContrast.ts
T013: high-contrast.css
```

**User Stories (P1 in parallel)**:
```bash
# US1, US2, US3 can be worked on simultaneously:
Developer A: US1 (Access Codes)
Developer B: US2 (Download Limits)
Developer C: US3 (High Contrast)
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (Migration)
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 - Per-Photo Access Codes
4. Complete Phase 4: US2 - Daily Download Limits
5. Complete Phase 5: US3 - High Contrast Mode
6. **STOP and VALIDATE**: All P1 stories functional
7. Deploy MVP

### Incremental Delivery

| Release | User Stories | Value Delivered |
|---------|--------------|-----------------|
| MVP | US1, US2, US3 | Core privacy, business protection, accessibility |
| v2 | US4, US5 | Full accessibility compliance |
| v3 | US6, US7, US8 | Enhanced navigation and analytics |
| v4 | US9, US10 | Premium features |

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Tasks** | 90 |
| **Phase 1 (Setup)** | 7 |
| **Phase 2 (Foundational)** | 8 |
| **User Story Tasks** | 68 |
| **Polish Tasks** | 7 |
| **Parallelizable Tasks [P]** | 22 |

### Tasks per User Story

| Story | Priority | Task Count |
|-------|----------|------------|
| US1: Access Codes | P1 | 9 |
| US2: Download Limits | P1 | 8 |
| US3: High Contrast | P1 | 6 |
| US4: Skip Links | P2 | 6 |
| US5: RTL Layout | P2 | 6 |
| US6: Breadcrumbs | P3 | 6 |
| US7: Nested Sub-Galleries | P3 | 6 |
| US8: UTM Tracking | P3 | 6 |
| US9: Password Reset | P4 | 8 |
| US10: Slideshow Audio | P4 | 7 |

---

## Notes

- All tasks include exact file paths for implementation
- [P] tasks can run in parallel (different files, no dependencies)
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
