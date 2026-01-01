# Tasks: Digital Invitations Enhancement

**Input**: Design documents from `/specs/017-digital-wedding-invitations/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.yaml

**Tests**: Tests NOT explicitly requested in the specification. Integration tests included for critical paths only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a **web application** with separate frontend and backend:
- **Backend**: `backend/src/app/` for source, `backend/migrations/` for DB
- **Frontend**: `frontend/src/` for source

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migrations and foundational schema for all new tables

- [ ] T001 Create migration for invitation_sub_events table in backend/migrations/versions/0067_invitation_sub_events.py
- [ ] T002 Create migration for invitation_media table in backend/migrations/versions/0068_invitation_media.py
- [ ] T003 Create migration for image_generation_settings table in backend/migrations/versions/0069_image_generation_settings.py
- [ ] T004 Create migration for invitation_ai_generations table in backend/migrations/versions/0070_invitation_ai_generations.py
- [ ] T005 Create migration for invitation_view_analytics table in backend/migrations/versions/0071_invitation_view_analytics.py
- [ ] T006 Create migration to alter existing digital_invitations table in backend/migrations/versions/0072_invitation_schema_updates.py
- [ ] T007 Run all migrations and verify schema in development database

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story implementation

**WARNING**: No user story work can begin until this phase is complete

### Backend Foundation

- [ ] T008 [P] Create SubEvent SQLAlchemy model in backend/src/app/models/invitation_sub_event.py
- [ ] T009 [P] Create InvitationMedia SQLAlchemy model in backend/src/app/models/invitation_media.py
- [ ] T010 [P] Create ImageGenerationSettings SQLAlchemy model in backend/src/app/models/image_generation_settings.py
- [ ] T011 [P] Create InvitationAIGeneration SQLAlchemy model in backend/src/app/models/invitation_ai_generation.py
- [ ] T012 [P] Create InvitationViewAnalytics SQLAlchemy model in backend/src/app/models/invitation_view_analytics.py
- [ ] T013 Update digital_invitations model with new columns (video_object_key, audio_object_key, has_sub_events, layout_density, fonts) in backend/src/app/models/digital_invitation.py
- [ ] T014 [P] Create invitation_sub_event_repository.py in backend/src/app/repositories/
- [ ] T015 [P] Create invitation_media_repository.py in backend/src/app/repositories/
- [ ] T016 [P] Create invitation_analytics_repository.py in backend/src/app/repositories/

### Frontend Foundation

- [ ] T017 [P] Add SubEvent TypeScript interfaces in frontend/src/types/invitations.ts
- [ ] T018 [P] Add InvitationMedia TypeScript interfaces in frontend/src/types/invitations.ts
- [ ] T019 [P] Add AIGeneration TypeScript interfaces in frontend/src/types/invitations.ts
- [ ] T020 [P] Add Analytics TypeScript interfaces in frontend/src/types/invitations.ts
- [ ] T021 Add new API method stubs to frontend/src/services/invitationService.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Create Basic Invitation (Required)

**Goal**: Photographers can create invitations with template, text, photos, date/time, and share via public link

**Independent Test**: Create invitation with template, add text and photos, publish, verify public link loads correctly on mobile/desktop

### Implementation for User Story 1

- [ ] T022 [US1] Review and extend existing digital_invitation_service.py to support new schema fields in backend/src/app/services/digital_invitation_service.py
- [ ] T023 [US1] Verify existing template listing includes gradient configs in backend/src/app/services/invitation_template_service.py
- [ ] T024 [US1] Ensure autosave (invitation_draft_service.py) works with new fields in backend/src/app/services/invitation_draft_service.py
- [ ] T025 [US1] Review invitation_image_service.py for photo arrangements (carousel, grid, floating) in backend/src/app/services/invitation_image_service.py
- [ ] T026 [US1] Verify existing public invitation endpoint returns correctly for mobile in backend/src/app/api/v1/digital_invitations.py
- [ ] T027 [P] [US1] Create DateTimePicker component with timezone support in frontend/src/components/invitations/DateTimePicker.tsx
- [ ] T028 [P] [US1] Create VenueInput component with optional map embed in frontend/src/components/invitations/VenueInput.tsx
- [ ] T029 [US1] Verify InvitationEditor handles all basic fields (names, date, venue, photos) in frontend/src/pages/InvitationEditor.tsx
- [ ] T030 [US1] Add countdown timer display to public invitation view in frontend/src/components/invitations/CountdownTimer.tsx

**Checkpoint**: User Story 1 complete - basic invitation creation and sharing works

---

## Phase 4: User Story 2 - Customize Invitation Design (Required)

**Goal**: Photographers can customize colors, fonts, layout, and preview on different device sizes

**Independent Test**: Select template, modify colors/fonts, toggle device preview, save and reopen - all customizations preserved

### Implementation for User Story 2

- [ ] T031 [US2] Ensure template gradient_config JSONB is correctly parsed in backend/src/app/services/invitation_template_service.py
- [ ] T032 [US2] Add font validation (allowed font list) in invitation update endpoint in backend/src/app/api/v1/digital_invitations.py
- [ ] T033 [P] [US2] Create ColorPicker component for primary/accent/text colors in frontend/src/components/invitations/ColorPicker.tsx
- [ ] T034 [P] [US2] Create FontSelector component with 20 bundled fonts in frontend/src/components/invitations/FontSelector.tsx
- [ ] T035 [P] [US2] Create LayoutDensitySelector (compact/normal/spacious) in frontend/src/components/invitations/LayoutDensitySelector.tsx
- [ ] T036 [US2] Create DevicePreview component with iframe viewport simulation in frontend/src/components/invitations/DevicePreview.tsx
- [ ] T037 [US2] Bundle 20 Google Fonts (Playfair Display, Poppins, Dancing Script, etc.) in frontend/src/assets/fonts/
- [ ] T038 [US2] Integrate color/font/layout/preview into InvitationEditor in frontend/src/pages/InvitationEditor.tsx

**Checkpoint**: User Story 2 complete - full design customization with device preview

---

## Phase 5: User Story 3 - Hero Photos and Media (Required)

**Goal**: Photographers can add photos from gallery, arrange layouts, and optionally add video with autoplay

**Independent Test**: Add 4-5 photos, switch layouts (carousel/grid), add 60s video, publish - verify all media loads on mobile

### Backend Implementation

- [ ] T039 [US3] Create invitation_media_service.py with upload, validation, and retrieval in backend/src/app/services/invitation_media_service.py
- [ ] T040 [US3] Create video transcoding BullMQ job handler in backend/src/app/workers/video_transcoding_worker.py
- [ ] T041 [US3] Add FFmpeg transcoding logic (720p H.264 + VP9) in backend/src/app/workers/video_transcoding_worker.py
- [ ] T042 [US3] Create invitation_media.py API routes (POST, GET, DELETE) in backend/src/app/api/v1/invitation_media.py
- [ ] T043 [US3] Add media processing status endpoint in backend/src/app/api/v1/invitation_media.py

### Frontend Implementation

- [ ] T044 [P] [US3] Create MediaUploader component for video/audio in frontend/src/components/invitations/MediaUploader.tsx
- [ ] T045 [P] [US3] Create VideoPlayer component with autoplay muted, volume controls in frontend/src/components/invitations/VideoPlayer.tsx
- [ ] T046 [US3] Enhance photo layout selector (carousel, grid, floating) in frontend/src/components/invitations/PhotoLayoutSelector.tsx
- [ ] T047 [US3] Add video upload progress indicator and transcoding status in frontend/src/components/invitations/MediaUploader.tsx
- [ ] T048 [US3] Integrate media uploader and video player into InvitationEditor in frontend/src/pages/InvitationEditor.tsx

**Checkpoint**: User Story 3 complete - photos and video work with transcoding pipeline

---

## Phase 6: User Story 4 - RSVP Collection (Required)

**Goal**: Guests can RSVP with attendance, plus-ones, meals; photographers view/export responses

**Independent Test**: Enable RSVP, configure questions, share invite, submit as guest, view responses in dashboard

### Implementation for User Story 4

- [ ] T049 [US4] Review existing invitation_rsvp_service.py for custom questions support in backend/src/app/services/invitation_rsvp_service.py
- [ ] T050 [US4] Add RSVP deadline enforcement logic in backend/src/app/services/invitation_rsvp_service.py
- [ ] T051 [US4] Add RSVP export endpoint (CSV/JSON) in backend/src/app/api/v1/invitation_rsvps.py
- [ ] T052 [US4] Add RSVP notification trigger on submission in backend/src/app/services/invitation_rsvp_service.py
- [ ] T053 [P] [US4] Create RSVPQuestionBuilder component for custom questions in frontend/src/components/invitations/RSVPQuestionBuilder.tsx
- [ ] T054 [P] [US4] Create RSVPDashboard component with filtering and export in frontend/src/components/invitations/RSVPDashboard.tsx
- [ ] T055 [US4] Add RSVP deadline picker to InvitationEditor in frontend/src/pages/InvitationEditor.tsx
- [ ] T056 [US4] Integrate RSVP dashboard into invitation detail page in frontend/src/pages/InvitationDetail.tsx

**Checkpoint**: User Story 4 complete - full RSVP collection and management

---

## Phase 7: User Story 5 - AI-Assisted Content (Required)

**Goal**: Photographers generate invitation text via AI prompts using their Gemini API key

**Independent Test**: Enter prompt like "romantic beach wedding", receive 3-5 headline options, insert selected text

### Backend Implementation

- [ ] T057 [US5] Create invitation_ai_service.py with text generation logic in backend/src/app/services/invitation_ai_service.py
- [ ] T058 [US5] Integrate with existing user_gemini_settings for API key retrieval in backend/src/app/services/invitation_ai_service.py
- [ ] T059 [US5] Create AI text generation endpoint in backend/src/app/api/v1/invitation_ai.py
- [ ] T060 [US5] Add AI generation audit logging to invitation_ai_generations table in backend/src/app/services/invitation_ai_service.py
- [ ] T061 [US5] Implement graceful fallback when AI unavailable in backend/src/app/services/invitation_ai_service.py

### Frontend Implementation

- [ ] T062 [P] [US5] Create AITextGenerator component with prompt input and options display in frontend/src/components/invitations/AITextGenerator.tsx
- [ ] T063 [US5] Add "Generated by AI" indicator styling in frontend/src/components/invitations/AITextGenerator.tsx
- [ ] T064 [US5] Handle API key not configured state with settings link in frontend/src/components/invitations/AITextGenerator.tsx
- [ ] T065 [US5] Integrate AITextGenerator for headline/bio/rsvp_text fields in frontend/src/pages/InvitationEditor.tsx

**Checkpoint**: User Story 5 complete - AI text generation works with Gemini

---

## Phase 8: User Story 6 - Multi-Event Support (Required)

**Goal**: Invitations support multiple events (Mehndi, Ceremony, Reception) each with own details

**Independent Test**: Create invitation with 3 events, each different date/venue, verify all display with individual countdowns

### Backend Implementation

- [ ] T066 [US6] Create invitation_sub_event_service.py with CRUD operations in backend/src/app/services/invitation_sub_event_service.py
- [ ] T067 [US6] Create sub-events API routes in backend/src/app/api/v1/invitation_sub_events.py
- [ ] T068 [US6] Add sub-event reordering endpoint in backend/src/app/api/v1/invitation_sub_events.py
- [ ] T069 [US6] Update digital_invitation_service to set has_sub_events flag in backend/src/app/services/digital_invitation_service.py

### Frontend Implementation

- [ ] T070 [P] [US6] Create SubEventEditor component for individual event details in frontend/src/components/invitations/SubEventEditor.tsx
- [ ] T071 [P] [US6] Create SubEventList component with drag-and-drop reordering in frontend/src/components/invitations/SubEventList.tsx
- [ ] T072 [US6] Add multiple countdown timers for multi-event public view in frontend/src/components/invitations/CountdownTimer.tsx
- [ ] T073 [US6] Integrate sub-events into InvitationEditor in frontend/src/pages/InvitationEditor.tsx

**Checkpoint**: User Story 6 complete - multi-event invitations work

---

## Phase 9: User Story 7 - Social Media Sharing (Required)

**Goal**: Photographers generate optimized share cards for WhatsApp, Instagram Stories, Facebook

**Independent Test**: Click share buttons, download/copy generated assets, verify preview displays on platforms

### Implementation for User Story 7

- [ ] T074 [US7] Add Open Graph meta tags generation in backend/src/app/services/digital_invitation_service.py
- [ ] T075 [US7] Create Instagram Story dimensions export (1080x1920) in backend/src/app/services/invitation_export_service.py
- [ ] T076 [P] [US7] Create ShareButtons component (WhatsApp, Instagram, Facebook) in frontend/src/components/invitations/ShareButtons.tsx
- [ ] T077 [US7] Implement WhatsApp share URL with preview text in frontend/src/components/invitations/ShareButtons.tsx
- [ ] T078 [US7] Add QR code generation for invitation link in frontend/src/components/invitations/QRCodeGenerator.tsx

**Checkpoint**: User Story 7 complete - social sharing works

---

## Phase 10: User Story 8 - AI-Generated Backgrounds (Required)

**Goal**: Photographers generate unique backgrounds via Imagen/Nano Banana from text prompts

**Independent Test**: Enter background prompt, generate image, apply to invitation, verify text remains readable

### Backend Implementation

- [ ] T079 [US8] Create image_generation_settings_service.py for API key management in backend/src/app/services/image_generation_settings_service.py
- [ ] T080 [US8] Add Imagen/Nano Banana provider integration in backend/src/app/services/invitation_ai_service.py
- [ ] T081 [US8] Create background generation endpoint in backend/src/app/api/v1/invitation_ai.py
- [ ] T082 [US8] Add automatic overlay opacity adjustment logic in backend/src/app/services/invitation_ai_service.py

### Frontend Implementation

- [ ] T083 [P] [US8] Create AIBackgroundGenerator component with prompt input in frontend/src/components/invitations/AIBackgroundGenerator.tsx
- [ ] T084 [US8] Add preview/regenerate workflow in frontend/src/components/invitations/AIBackgroundGenerator.tsx
- [ ] T085 [US8] Create image generation settings UI in user profile in frontend/src/components/settings/ImageGenerationSettings.tsx
- [ ] T086 [US8] Integrate background generator into InvitationEditor in frontend/src/pages/InvitationEditor.tsx

**Checkpoint**: User Story 8 complete - AI background generation works

---

## Phase 11: User Story 9 - Export (Required)

**Goal**: Photographers export invitations as high-quality PDF and animated MP4

**Independent Test**: Create complete invitation, export PDF, export MP4 - verify quality and animations

### Backend Implementation

- [ ] T087 [US9] Create invitation_export_service.py with export orchestration in backend/src/app/services/invitation_export_service.py
- [ ] T088 [US9] Create PDF export worker using Puppeteer in backend/src/app/workers/pdf_export_worker.py
- [ ] T089 [US9] Create export API routes (POST to start, GET status, GET download) in backend/src/app/api/v1/invitation_export.py
- [ ] T090 [US9] Store exports in R2 with 24h expiry in backend/src/app/services/invitation_export_service.py

### Frontend Implementation

- [ ] T091 [P] [US9] Create ExportDialog component with PDF/MP4 options in frontend/src/components/invitations/ExportDialog.tsx
- [ ] T092 [US9] Add export progress indicator in frontend/src/components/invitations/ExportDialog.tsx
- [ ] T093 [US9] Integrate export dialog into invitation detail page in frontend/src/pages/InvitationDetail.tsx

**Checkpoint**: User Story 9 complete - PDF export works (MP4 deferred)

---

## Phase 12: User Story 10 - Analytics (Required)

**Goal**: Photographers view invitation analytics: views, devices, geography, RSVP conversion

**Independent Test**: Publish invitation, view from multiple devices, verify analytics show correct breakdown

### Backend Implementation

- [ ] T094 [US10] Create invitation_analytics_service.py with aggregation logic in backend/src/app/services/invitation_analytics_service.py
- [ ] T095 [US10] Add view tracking on public invitation access in backend/src/app/api/v1/digital_invitations.py
- [ ] T096 [US10] Create analytics API endpoints (overview, devices, geography) in backend/src/app/api/v1/invitation_analytics.py
- [ ] T097 [US10] Implement device type detection from User-Agent in backend/src/app/services/invitation_analytics_service.py

### Frontend Implementation

- [ ] T098 [P] [US10] Create AnalyticsDashboard component with charts in frontend/src/components/invitations/AnalyticsDashboard.tsx
- [ ] T099 [P] [US10] Create DeviceBreakdownChart component in frontend/src/components/invitations/DeviceBreakdownChart.tsx
- [ ] T100 [US10] Integrate analytics dashboard into invitation detail page in frontend/src/pages/InvitationDetail.tsx

**Checkpoint**: User Story 10 complete - analytics dashboard works

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T101 [P] Add WCAG 2.1 AA accessibility audit to all new components
- [ ] T102 [P] Add keyboard navigation to InvitationEditor in frontend/src/pages/InvitationEditor.tsx
- [ ] T103 [P] Add high-contrast mode support for public invitation view
- [ ] T104 [P] Implement progressive image loading (hero first) in public view
- [ ] T105 Add RTL text support for Arabic/Hebrew languages
- [ ] T106 Optimize Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- [ ] T107 [P] Add error boundary wrappers to all major components
- [ ] T108 Security audit: verify all endpoints have workspace isolation
- [ ] T109 Performance test: verify 100 concurrent editor sessions
- [ ] T110 Run quickstart.md validation end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-12)**: All depend on Foundational phase completion
  - All 10 user stories are required for feature completion
  - Stories can be parallelized where dependencies allow
- **Polish (Phase 13)**: Depends on all user stories being complete

### User Story Dependencies

| Story | Depends On | Notes |
|-------|------------|-------|
| US1 (Basic) | Foundational | Can start immediately after Phase 2 |
| US2 (Design) | Foundational | Can start with US1 in parallel |
| US3 (Media) | Foundational | Requires video worker setup |
| US4 (RSVP) | Foundational | Extends existing RSVP system |
| US5 (AI Text) | Foundational | Requires user_gemini_settings |
| US6 (Multi-Event) | Foundational | New sub_events table |
| US7 (Share) | US1 | Needs published invitation |
| US8 (AI Background) | US5 | Shares AI service patterns |
| US9 (Export) | US1 | Needs complete invitation |
| US10 (Analytics) | US1 | Needs view tracking data |

### Parallel Opportunities by Phase

**Phase 1 (Setup)**: Migrations T001-T006 run in sequence (migrations must be ordered)

**Phase 2 (Foundational)**:
- Backend models T008-T012 in parallel
- Repositories T014-T016 in parallel
- Frontend types T017-T020 in parallel

**Phases 3-8 (US1-US6)**: Can run in parallel by different developers after Foundational

**Phases 9-12 (US7-US10)**: Can run in parallel after their dependencies are met

---

## Parallel Example: Team of 6 Developers

```bash
# After Phase 2 (Foundational) complete, all stories can start:

# Developer A: User Story 1 (Basic Invitation)
Task: "Review digital_invitation_service.py"
Task: "Create DateTimePicker component"
Task: "Add countdown timer"

# Developer B: User Story 2 (Design Customization)
Task: "Create ColorPicker component"
Task: "Create FontSelector component"
Task: "Create DevicePreview component"

# Developer C: User Story 3 (Media)
Task: "Create invitation_media_service.py"
Task: "Create video transcoding worker"
Task: "Create MediaUploader component"

# Developer D: User Story 4 + 5 (RSVP + AI Text)
Task: "Create RSVPQuestionBuilder component"
Task: "Create invitation_ai_service.py"
Task: "Create AITextGenerator component"

# Developer E: User Story 6 (Multi-Event)
Task: "Create invitation_sub_event_service.py"
Task: "Create SubEventEditor component"
Task: "Create SubEventList component"

# Developer F: User Stories 7-10 (after US1 complete)
Task: "Create ShareButtons component"
Task: "Create AnalyticsDashboard component"
Task: "Create ExportDialog component"
```

---

## Implementation Strategy

### Full Feature Delivery

All 10 user stories are required. Implementation order:

1. **Phase 1**: Setup (migrations) - 7 tasks
2. **Phase 2**: Foundational (models, repos, types) - 14 tasks
3. **Phases 3-12**: All user stories (US1-US10) - 79 tasks
4. **Phase 13**: Polish (accessibility, performance, security) - 10 tasks

### Parallel Execution Plan

With dependencies respected:

| Wave | Stories | Can Start When |
|------|---------|----------------|
| Wave 1 | US1, US2, US3, US4, US5, US6 | After Foundational |
| Wave 2 | US7, US8, US9, US10 | After US1 + US5 |

### Checkpoints

- After Phase 2: All models and types ready
- After US1-US6: Core functionality complete
- After US7-US10: All features complete
- After Phase 13: Production ready

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Tasks** | **110** |
| Setup Tasks | 7 |
| Foundational Tasks | 14 |
| US1 (Basic) Tasks | 9 |
| US2 (Design) Tasks | 8 |
| US3 (Media) Tasks | 10 |
| US4 (RSVP) Tasks | 8 |
| US5 (AI Text) Tasks | 9 |
| US6 (Multi-Event) Tasks | 8 |
| US7 (Share) Tasks | 5 |
| US8 (AI Background) Tasks | 8 |
| US9 (Export) Tasks | 7 |
| US10 (Analytics) Tasks | 7 |
| Polish Tasks | 10 |
| Parallel Opportunities | 45+ tasks marked [P] |
| **All Stories Required** | **Yes** |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete work
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Commit after each task or logical group
- All 10 user stories are required for feature completion
- ~60% of base functionality already exists from feature 016
