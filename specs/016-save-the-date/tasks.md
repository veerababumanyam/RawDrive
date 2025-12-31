# Tasks: Save The Date - Digital Invitation System

**Input**: Design documents from `/specs/016-save-the-date/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: Tests are NOT explicitly requested in this specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/app/` for Python FastAPI code
- **Frontend**: `frontend/src/` for React TypeScript code
- **Migrations**: `backend/src/app/db/migrations/`
- **Tests**: `backend/tests/` and `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, database schema, and core infrastructure that all user stories depend on

- [x] T001 Create database migration for `invitation_templates` table in backend/migrations/versions/0059_invitation_templates.py
- [x] T002 Create database migration for `invitations` table in backend/migrations/versions/0060_invitations.py
- [x] T003 Create database migration for `invitation_images` table in backend/migrations/versions/0061_invitation_images.py
- [x] T004 Create database migration for `invitation_guests` table in backend/migrations/versions/0062_invitation_guests.py
- [x] T005 Create database migration for `invitation_rsvps` table in backend/migrations/versions/0063_invitation_rsvps.py
- [x] T006 Create database migration for `invitation_checkins` table in backend/migrations/versions/0064_invitation_checkins.py
- [x] T007 Create database migration for `invitation_events` audit table in backend/migrations/versions/0065_invitation_events.py
- [ ] T008 Run all migrations and verify schema creation
- [x] T009 [P] Create Pydantic schemas for invitation entities in backend/src/app/api/invitation_schemas.py
- [x] T010 [P] Create TypeScript interfaces for invitation types in frontend/src/types/invitations.ts
- [x] T011 [P] Create InvitationRepository in backend/src/app/repositories/invitation_repository.py
- [x] T012 [P] Create RSVPRepository in backend/src/app/repositories/rsvp_repository.py
- [x] T013 Create invitation API client service in frontend/src/services/invitationService.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core services and infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T014 Implement DigitalInvitationService with create, get, list, update, delete methods in backend/src/app/services/digital_invitation_service.py
- [x] T015 Add magic_link_target_type enum extension for 'invitation' in backend/migrations/versions/0059_invitation_templates.py
- [x] T016 Integrate DigitalInvitationService with MagicLinkService for public URL generation in backend/src/app/services/digital_invitation_service.py
- [x] T017 Create InvitationTemplateService for template rendering in backend/src/app/services/invitation_template_service.py
- [x] T018 Seed 15 initial templates (wedding, birthday, festival) in backend/src/app/db/seeds/seed_invitation_templates.py
- [x] T019 Register invitation API routes in backend/src/app/api/v1/__init__.py
- [x] T020 Add invitation routes to frontend React Router in frontend/src/router/routes.tsx

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Photographer Creates Digital Invitation (Priority: P1)

**Goal**: Enable hosts to create beautiful digital invitations using templates with customization

**Independent Test**: Navigate to invitation module, select template, fill event details, preview, and publish. Delivers a complete, shareable invitation.

### Implementation for User Story 1

- [x] T021 [P] [US1] Create InvitationsPage list/dashboard in frontend/src/pages/workspace/InvitationsPage.tsx
- [x] T022 [P] [US1] Create InvitationCreatePage wizard host in frontend/src/pages/workspace/InvitationCreatePage.tsx
- [x] T023 [US1] Create InvitationWizard 3-step component in frontend/src/components/features/invitations/InvitationWizard.tsx
- [x] T024 [US1] Implement Step 1: Event Details form with validation in InvitationWizard.tsx
- [x] T025 [US1] Create TemplateGallery component for Step 2 in frontend/src/components/features/invitations/TemplateGallery.tsx
- [x] T026 [US1] Create TemplateCustomizer component for color/font in frontend/src/components/features/invitations/TemplateCustomizer.tsx
- [x] T027 [US1] Implement Step 3: RSVP settings in InvitationWizard.tsx (Media upload deferred to images endpoint)
- [x] T028 [US1] Create InvitationPreview component with real-time updates in frontend/src/components/features/invitations/InvitationPreview.tsx
- [x] T029 [US1] Implement host API endpoints POST/GET/PATCH/DELETE in backend/src/app/api/v1/digital_invitations.py
- [x] T030 [US1] Implement publish endpoint POST /invitations/{id}/publish in backend/src/app/api/v1/digital_invitations.py
- [x] T031 [US1] Implement unpublish endpoint POST /invitations/{id}/unpublish in backend/src/app/api/v1/digital_invitations.py
- [ ] T032 [US1] Add image upload handling to DigitalInvitationService (deferred - uses existing upload flow)
- [x] T033 [US1] Create InvitationDetailPage for viewing/editing in frontend/src/pages/workspace/InvitationDetailPage.tsx
- [x] T034 [US1] Add workspace isolation checks to all invitation queries (built into DigitalInvitationService)
- [x] T035 [US1] Add form validation in InvitationWizard.tsx (basic validation implemented)

**Checkpoint**: User Story 1 complete - hosts can create, customize, and publish invitations

---

## Phase 4: User Story 2 - Guest Views Invitation and RSVPs (Priority: P1)

**Goal**: Enable guests to view published invitations and submit RSVP responses without login

**Independent Test**: Open a published invitation URL, view content, submit RSVP, receive confirmation.

### Implementation for User Story 2

- [x] T036 [P] [US2] Create PublicInvitationPage in frontend/src/pages/public/PublicInvitationPage.tsx
- [x] T037 [US2] Implement public portal API GET /portal/invitations/{slug} in backend/src/app/api/v1/public_invitations.py
- [x] T038 [US2] Implement InvitationRSVPService with submit method in backend/src/app/services/invitation_rsvp_service.py
- [x] T039 [US2] Implement RSVP deduplication by email in InvitationRSVPService
- [x] T040 [US2] Generate and hash edit tokens for RSVP updates in InvitationRSVPService
- [x] T041 [US2] Implement public RSVP submission POST /portal/invitations/{slug}/rsvp in backend/src/app/api/v1/public_invitations.py
- [x] T042 [US2] Create RSVPForm component (embedded in PublicInvitationPage.tsx)
- [x] T043 [US2] Add RSVP edit via token PATCH /portal/invitations/{slug}/rsvp/{id} in backend/src/app/api/v1/public_invitations.py
- [x] T044 [US2] Add countdown timer to public invitation page (implemented in PublicInvitationPage.tsx)
- [x] T045 [US2] Add venue display with Google Maps link (implemented in PublicInvitationPage.tsx)
- [x] T046 [US2] Implement password protection UI (implemented in PublicInvitationPage.tsx)
- [x] T047 [US2] Add rate limiting (100/hour per IP) to public RSVP endpoints
- [x] T048 [US2] Integrate notification service for RSVP confirmation emails in InvitationRSVPService
- [x] T049 [US2] Handle expired invitation display (implemented in PublicInvitationPage.tsx)

**Checkpoint**: User Story 2 complete - guests can view invitations and submit RSVPs

---

## Phase 5: User Story 3 - Host Manages Guest List and RSVPs (Priority: P1)

**Goal**: Enable hosts to view RSVP dashboard with analytics, filter responses, and export data

**Independent Test**: Create invitation, collect RSVPs, view dashboard with accurate counts and guest details.

### Implementation for User Story 3

- [x] T050 [P] [US3] Create RSVPDashboard component in frontend/src/components/features/invitations/RSVPDashboard.tsx
- [x] T051 [US3] Implement host RSVP list API GET /invitations/{id}/rsvps in backend/src/app/api/v1/digital_invitations.py
- [x] T052 [US3] Add RSVP filtering by attendance status in RSVPRepository
- [x] T053 [US3] Add RSVP search by name/email in RSVPRepository
- [x] T054 [US3] Create RSVP summary statistics (attending, not attending, maybe, total party size)
- [x] T055 [US3] Create RSVPExport component in frontend/src/components/features/invitations/RSVPExport.tsx
- [x] T056 [US3] Implement CSV export API GET /invitations/{id}/rsvps/export?format=csv in digital_invitations.py
- [x] T057 [US3] Implement PDF export API GET /invitations/{id}/rsvps/export?format=pdf in digital_invitations.py
- [x] T058 [US3] Create PDF generation utility for RSVP export in backend/src/app/utils/pdf_generator.py
- [x] T059 [US3] Add RSVP delete capability for host in RSVPDashboard (DELETE endpoint + UI)
- [x] T060 [US3] Create invitation_stats materialized view refresh function (in migration 0065)

**Checkpoint**: User Story 3 complete - hosts can view and export RSVP data

---

## Phase 6: User Story 4 - QR Code Generation (Priority: P2)

**Goal**: Generate downloadable QR codes linking to invitation URL in multiple formats

**Independent Test**: Generate QR code for published invitation, download PNG/SVG/PDF, scan to verify correct URL.

### Implementation for User Story 4

- [x] T061 [P] [US4] Create InvitationQRService for QR orchestration in backend/src/app/services/invitation_qr_service.py
- [x] T062 [US4] Integrate existing QRCodeService for invitation URLs in InvitationQRService
- [x] T063 [US4] Implement QR code API GET /invitations/{id}/qr in backend/src/app/api/v1/digital_invitations.py
- [x] T064 [US4] Support format parameter (png, svg, pdf) in QR endpoint
- [x] T065 [US4] Support size parameter (256-2048px) in QR endpoint
- [x] T066 [US4] Implement logo overlay option using cover image in InvitationQRService
- [x] T067 [US4] Create InvitationQRModal component in frontend/src/components/features/invitations/InvitationQRModal.tsx
- [x] T068 [US4] Add format/size selection to QR modal
- [x] T069 [US4] Add download functionality for QR code in InvitationQRModal

**Checkpoint**: User Story 4 complete - hosts can generate and download QR codes

---

## Phase 7: User Story 5 - Calendar Integration .ics (Priority: P2)

**Goal**: Generate .ics calendar files for guests to add event to their calendar

**Independent Test**: Click "Add to Calendar", download .ics, import to Google/Apple/Outlook Calendar.

### Implementation for User Story 5

- [x] T070 [P] [US5] Install icalendar package and add to requirements.txt
- [x] T071 [US5] Create CalendarService for .ics generation in backend/src/app/services/calendar_service.py
- [x] T072 [US5] Implement RFC 5545 compliant calendar generation with timezone support
- [x] T073 [US5] Add reminder alarms (1 day, 1 hour before) to calendar events
- [x] T074 [US5] Include venue location and coordinates in .ics
- [x] T075 [US5] Implement host calendar API GET /invitations/{id}/calendar in digital_invitations.py
- [x] T076 [US5] Implement public calendar API GET /portal/invitations/{slug}/calendar in public_invitations.py
- [x] T077 [US5] Add "Add to Calendar" button to PublicInvitationPage (already implemented)

**Checkpoint**: User Story 5 complete - guests can add events to calendar

---

## Phase 8: User Story 6 - WhatsApp-Optimized Sharing (Priority: P2)

**Goal**: Optimize invitation sharing for WhatsApp with proper Open Graph meta tags

**Independent Test**: Share invitation URL on WhatsApp, verify preview shows cover image, title, description.

### Implementation for User Story 6

- [x] T078 [P] [US6] Add Open Graph meta tag generation to public invitation renderer
- [x] T079 [US6] Optimize cover images to 1200x630px for OG preview in InvitationService
- [x] T080 [US6] Add Twitter Card meta tags for cross-platform sharing
- [x] T081 [US6] Create ShareMenu component in frontend/src/components/features/invitations/ShareMenu.tsx
- [x] T082 [US6] Implement WhatsApp share with prefilled message
- [x] T083 [US6] Implement copy link functionality in ShareMenu
- [x] T084 [US6] Add share button to InvitationDetailPage

**Checkpoint**: User Story 6 complete - invitations display correctly on WhatsApp

---

## Phase 9: User Story 7 - Multi-Language Support (Priority: P2)

**Goal**: Support invitation creation in 6 regional languages with proper font rendering

**Independent Test**: Create invitation in Hindi, verify correct Devanagari font, view public page in Hindi.

### Implementation for User Story 7

- [x] T085 [P] [US7] Add regional font files (Noto Sans Devanagari, Tamil, Telugu, Kannada, Malayalam) to frontend assets
- [x] T086 [US7] Configure font-face declarations in frontend/src/index.css
- [x] T087 [US7] Add language selector to InvitationWizard Step 1
- [x] T088 [US7] Store primary_language and secondary_language in invitation data
- [x] T089 [US7] Apply appropriate font based on selected language in templates
- [x] T090 [US7] Add i18n content field to templates for language-specific default text
- [x] T091 [US7] Format dates according to locale conventions in public page
- [x] T092 [US7] Update TemplateGallery to filter by supported languages

**Checkpoint**: User Story 7 complete - invitations support regional languages

---

## Phase 10: User Story 8 - Save Draft and Auto-Save (Priority: P3)

**Goal**: Auto-save invitation progress to prevent data loss during creation

**Independent Test**: Partially fill invitation, close browser, return and verify data preserved.

### Implementation for User Story 8

- [X] T093 [P] [US8] Implement Redis draft storage with TTL in backend/src/app/services/draft_service.py
- [X] T094 [US8] Implement draft API PUT /invitations/drafts/{id} in invitations.py
- [X] T095 [US8] Implement draft list API GET /invitations/drafts in invitations.py
- [X] T096 [US8] Implement draft delete API DELETE /invitations/drafts/{id} in invitations.py
- [X] T097 [US8] Add 30s debounced auto-save to InvitationWizard
- [X] T098 [US8] Add auto-save indicator (saving..., last saved) to wizard UI
- [X] T099 [US8] Create DraftList view in InvitationsPage with resume capability
- [X] T100 [US8] Add manual "Save Draft" button to InvitationWizard

**Checkpoint**: User Story 8 complete - drafts are auto-saved and resumable

---

## Phase 11: User Story 9 - Duplicate Invitation (Priority: P3)

**Goal**: Allow hosts to duplicate existing invitations for similar events

**Independent Test**: Duplicate invitation, verify content copied except IDs and RSVPs.

### Implementation for User Story 9

- [X] T101 [P] [US9] Implement duplicate method in InvitationService
- [X] T102 [US9] Implement duplicate API POST /invitations/{id}/duplicate in invitations.py
- [X] T103 [US9] Copy all content except: invitation_id, slug, share_link_id, RSVPs
- [X] T104 [US9] Add "Copy of..." prefix to duplicated title
- [X] T105 [US9] Add duplicate button to InvitationDetailPage

**Checkpoint**: User Story 9 complete - hosts can duplicate invitations

---

## Phase 12: User Story 10 - RSVP Notification Management (Priority: P3)

**Goal**: Allow hosts to control RSVP notification frequency and preferences

**Independent Test**: Configure notifications to daily digest, collect RSVPs, verify single summary email.

### Implementation for User Story 10

- [X] T106 [P] [US10] Add notification_preference field to invitations table
- [X] T107 [US10] Create NotificationPreference schema (immediate, daily_digest, disabled)
- [X] T108 [US10] Update RSVP notification logic to respect preference
- [X] T109 [US10] Implement daily digest aggregation job in backend/src/app/workers/
- [X] T110 [US10] Add notification settings UI to InvitationDetailPage
- [X] T111 [US10] Create notification_templates for RSVP topics (immediate, digest)

**Checkpoint**: User Story 10 complete - hosts control notification preferences

---

## Phase 13: User Story 11 - Guest Check-In via QR (Priority: P3)

**Goal**: Enable event-day check-in of guests via QR code scanning

**Independent Test**: Generate guest QR, scan at venue, verify check-in recorded with timestamp.

### Implementation for User Story 11

- [X] T112 [P] [US11] Create CheckinRepository in backend/src/app/repositories/checkin_repository.py
- [X] T113 [US11] Create CheckinService with scan and verify methods in backend/src/app/services/checkin_service.py
- [X] T114 [US11] Generate signed JWT tokens for guest check-in QR codes
- [X] T115 [US11] Implement QR verification API POST /invitations/{id}/checkins/verify in invitations.py
- [X] T116 [US11] Implement check-in recording API POST /invitations/{id}/checkins in invitations.py
- [X] T117 [US11] Implement check-in list API GET /invitations/{id}/checkins in invitations.py
- [X] T118 [US11] Create CheckinScanner component in frontend/src/components/features/invitations/CheckinScanner.tsx
- [X] T119 [US11] Add real-time check-in count to RSVPDashboard
- [X] T120 [US11] Handle idempotent check-in (prevent double scan)

**Checkpoint**: User Story 11 complete - event staff can check in guests via QR

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, final hardening

- [X] T121 [P] Add WCAG 2.1 AA accessibility audit and fixes across all invitation components
- [X] T122 [P] Add keyboard navigation to all interactive elements
- [X] T123 [P] Add proper ARIA labels to form controls and modals
- [X] T124 Implement Turnstile/CAPTCHA option for RSVP forms (configurable per workspace)
- [X] T125 Add XSS protection and input sanitization review
- [X] T126 [P] Add loading states and skeleton placeholders to all async operations
- [X] T127 [P] Add error boundary and user-friendly error messages
- [X] T128 Implement auto-deletion scheduler for expired invitations
- [X] T129 Add pre-deletion warning notifications (3 days, 1 day before)
- [X] T130 Performance optimization: lazy load images, optimize LCP
- [X] T131 Mobile responsive testing and fixes for all pages
- [X] T132 Run quickstart.md validation to ensure developer setup works
- [X] T133 Code cleanup and remove any TODO comments

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKS all user stories)
    ↓
    ├─→ Phase 3: US1 (P1) - Create Invitation     ──┐
    │       ↓                                       │
    ├─→ Phase 4: US2 (P1) - Guest View/RSVP        │ Can run in parallel
    │       ↓                                       │ after Phase 2
    └─→ Phase 5: US3 (P1) - RSVP Dashboard    ←───┘
            ↓
    ┌───────┴───────┐
    ↓               ↓
Phase 6: US4    Phase 7: US5    Phase 8: US6    Phase 9: US7   (P2 - parallel)
(QR Codes)      (Calendar)      (Sharing)       (Languages)
    ↓               ↓               ↓               ↓
    └───────────────┴───────────────┴───────────────┘
                        ↓
    ┌───────────────────┼───────────────────┐
    ↓                   ↓                   ↓
Phase 10: US8      Phase 11: US9       Phase 12: US10    Phase 13: US11  (P3)
(Auto-Save)        (Duplicate)         (Notifications)    (Check-In)
    └───────────────────┴───────────────────┴───────────────────┘
                                ↓
                        Phase 14: Polish
```

### User Story Dependencies

| User Story | Priority | Dependencies | Can Start After |
|------------|----------|--------------|-----------------|
| US1: Create Invitation | P1 | None | Phase 2 |
| US2: Guest View/RSVP | P1 | US1 (needs published invitation) | Phase 2, but test after US1 |
| US3: RSVP Dashboard | P1 | US2 (needs RSVP data) | Phase 2, but test after US2 |
| US4: QR Codes | P2 | US1 (needs published invitation) | US1 complete |
| US5: Calendar | P2 | US1 (needs event details) | US1 complete |
| US6: WhatsApp Sharing | P2 | US1 (needs cover image) | US1 complete |
| US7: Multi-Language | P2 | US1 (needs template system) | US1 complete |
| US8: Auto-Save | P3 | US1 (wizard exists) | US1 complete |
| US9: Duplicate | P3 | US1 (needs invitation data) | US1 complete |
| US10: Notification Preferences | P3 | US2 (RSVP notification flow) | US2 complete |
| US11: Check-In | P3 | US2 + US4 (needs RSVP + QR) | US2 + US4 complete |

### Within Each User Story

- Models/Repositories created before services
- Services before API endpoints
- Backend APIs before frontend components
- Core implementation before integrations

### Parallel Opportunities

- All migrations (T001-T007) can run in sequence but be written in parallel
- Pydantic schemas (T009), TypeScript types (T010), repositories (T011, T012) - all [P]
- Within each user story, tasks marked [P] can run in parallel
- P2 user stories (US4-US7) can all run in parallel after US1 completion
- P3 user stories (US8-US11) can run in parallel after their dependencies

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# Launch parallel frontend page creation:
Task T021: "Create InvitationsPage in frontend/src/pages/InvitationsPage.tsx"
Task T022: "Create InvitationCreatePage in frontend/src/pages/InvitationCreatePage.tsx"

# After those complete, wizard tasks are sequential:
Task T023: "Create InvitationWizard component"
Task T024: "Implement Step 1: Event Details"
# etc.
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup (T001-T013)
2. Complete Phase 2: Foundational (T014-T020) - **CRITICAL GATE**
3. Complete Phase 3: User Story 1 (T021-T035)
4. **STOP and VALIDATE**: Test invitation creation end-to-end
5. Complete Phase 4: User Story 2 (T036-T049)
6. **STOP and VALIDATE**: Test guest view and RSVP flow
7. Complete Phase 5: User Story 3 (T050-T060)
8. **STOP and VALIDATE**: Test RSVP dashboard and export
9. Deploy MVP

### Incremental Delivery

| Increment | Stories | Deliverable |
|-----------|---------|-------------|
| MVP | US1 + US2 + US3 | Basic invitation creation, viewing, RSVP |
| Enhancement 1 | US4 + US5 | QR codes and calendar integration |
| Enhancement 2 | US6 + US7 | WhatsApp sharing and multi-language |
| Enhancement 3 | US8 + US9 + US10 + US11 | Auto-save, duplicate, notifications, check-in |

### Parallel Team Strategy

With 3 developers after Foundational phase:

- **Developer A**: US1 (Create Invitation) → US4 (QR) → US8 (Auto-Save)
- **Developer B**: US2 (Guest View) → US5 (Calendar) → US9 (Duplicate)
- **Developer C**: US3 (Dashboard) → US6 (Sharing) + US7 (Languages) → US10 + US11

---

## Task Summary

| Phase | Tasks | Parallel Opportunities |
|-------|-------|----------------------|
| 1. Setup | 13 | T009, T010, T011, T012 |
| 2. Foundational | 7 | None (sequential dependency) |
| 3. US1 - Create Invitation | 15 | T021, T022 |
| 4. US2 - Guest View/RSVP | 14 | T036 |
| 5. US3 - RSVP Dashboard | 11 | T050 |
| 6. US4 - QR Codes | 9 | T061 |
| 7. US5 - Calendar | 8 | T070 |
| 8. US6 - WhatsApp Sharing | 7 | T078 |
| 9. US7 - Multi-Language | 8 | T085 |
| 10. US8 - Auto-Save | 8 | T093 |
| 11. US9 - Duplicate | 5 | T101 |
| 12. US10 - Notifications | 6 | T106 |
| 13. US11 - Check-In | 9 | T112 |
| 14. Polish | 13 | T121, T122, T123, T126, T127 |

**Total Tasks**: 133

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MVP = US1 + US2 + US3 (approximately 49 tasks including setup)
- Suggested first sprint: Phase 1 + Phase 2 + Phase 3 (35 tasks)
