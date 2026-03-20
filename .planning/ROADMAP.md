# Roadmap: RawDrive

## Milestones

- [x] **v1.0 MVP** - Phases 01-09 (shipped 2026-03-19)
- [ ] **v1.1 Profile & Public Page Modernization** - Phases 10-14 (in progress)
- [ ] **v1.2 Public Gallery & Gallery Player Modernization** - Phases 15-20 (planned)
- [ ] **v1.3 Monetization, Onboarding & Growth** - Phases 21-24 (planned)

## Phases

<details>
<summary>v1.0 MVP (Phases 01-09) - SHIPPED 2026-03-19</summary>

- [x] Phase 01: Security Hardening (2/2 plans) - completed 2026-03-18
- [x] Phase 02: Email Infrastructure (2/2 plans) - completed 2026-03-18
- [x] Phase 03: AI Service Stabilization (2/2 plans) - completed 2026-03-18
- [x] Phase 04: Rate Limiting (1/1 plans) - completed 2026-03-18
- [x] Phase 05: Email Features (3/3 plans) - completed 2026-03-18
- [x] Phase 06: AI/ML Pipeline (5/5 plans) - completed 2026-03-18
- [x] Phase 07: Gallery Completion (2/2 plans) - completed 2026-03-18
- [x] Phase 08: Notifications (2/2 plans) - completed 2026-03-19
- [x] Phase 09: Shared Packages & Test Coverage (4/4 plans) - completed 2026-03-19

</details>

### v1.1 Profile & Public Page Modernization

**Milestone Goal:** Fix broken functionality and redesign both personal photographer profile (`/u/:slug`) and company/branding profile (`/p/:slug`) pages -- editors, live previews, and public views -- to be modern, responsive, and premium.

**Phase Numbering:**
- Integer phases (10, 11, 12, 13): Planned v1.1 work
- Decimal phases (10.1, 11.1): Urgent insertions if needed (marked with INSERTED)

- [x] **Phase 10: Foundation & Fixes** - Fix avatar/R2 pipeline, consolidate theme engine, scaffold shared components, add smoke tests (completed 2026-03-19)
- [x] **Phase 11: Public Page Redesign** - Mobile-first layouts for both profiles, animated themes, bento grid, dark mode, SEO metadata (completed 2026-03-19)
- [ ] **Phase 12: Editor Redesign** - Live preview, DnD section reordering, visual color picker, device frames, auto-save
- [ ] **Phase 13: Content Blocks & Performance** - Gallery preview, booking CTA, testimonials, social links, LCP budget enforcement
- [x] **Phase 14: FaceID Deep Dive & Enhancement** - Debug face identification issues, research competitive face recognition, fix broken functionality, enhance face management UX (completed 2026-03-19)

## Phase Details

### Phase 10: Foundation & Fixes
**Goal**: Broken profile functionality works reliably and shared infrastructure is ready for visual redesign
**Depends on**: v1.0 (complete)
**Requirements**: FNDTN-01, FNDTN-02, FNDTN-03, FNDTN-04, FNDTN-05
**Success Criteria** (what must be TRUE):
  1. User uploads an avatar on personal or company profile and it displays correctly after page reload (R2 storage pipeline, not PostgreSQL blobs)
  2. When avatar image fails to load, user sees initials or a placeholder -- never a broken image icon
  3. Both `/u/:slug` and `/p/:slug` public pages render using the same shared PublicProfileRenderer component
  4. Theme selection on either profile type applies consistently via CSS custom properties (no legacy theme engine code remains)
  5. Smoke tests pass verifying both profile pages load, avatar displays, and themes render without errors
**Plans**: 4 plans

Plans:
- [x] 10-01-PLAN.md -- R2 avatar pipeline + AvatarDisplay component with fallback
- [x] 10-02-PLAN.md -- UnifiedThemeEngine + SectionRegistry + PublicProfileRenderer
- [x] 10-03-PLAN.md -- Wire pages to shared renderer, delete legacy files, smoke tests
- [x] 10-04-PLAN.md -- Gap closure: company R2 pipeline + theme export rename

### Phase 11: Public Page Redesign
**Goal**: Both public profile pages are modern, responsive, visually premium, and discoverable by search engines
**Depends on**: Phase 10
**Requirements**: PUBPG-01, PUBPG-02, PUBPG-03, PUBPG-04, PUBPG-06, SEO-01, SEO-02, SEO-03, SEO-04
**Success Criteria** (what must be TRUE):
  1. User views their personal profile (`/u/:slug`) on mobile, tablet, and desktop and the layout is polished and responsive at every breakpoint
  2. User views their company profile (`/p/:slug`) on mobile, tablet, and desktop and the layout is polished and responsive at every breakpoint
  3. User selects an animated theme (gradient, particles, subtle motion) and the public page renders it with smooth animation
  4. Bento grid layout displays with proper spacing, transitions, and responsive breakpoints across all screen sizes
  5. Public pages render in dark mode when user system preference is dark, with correct contrast and readability
  6. Fetching a public profile URL with curl returns correct meta tags (title, description, OG image, JSON-LD structured data) in raw HTML
**Plans**: 3 plans

Plans:
- [ ] 11-01-PLAN.md -- Responsive bento grid, stagger animations, animated theme backgrounds, dark mode
- [ ] 11-02-PLAN.md -- SEO backend: HTML shell, OG image generation, JSON-LD structured data
- [ ] 11-03-PLAN.md -- Wire pages to enhanced renderer, client-side meta tags, visual verification

### Phase 12: Editor Redesign
**Goal**: Profile editors deliver a real-time, drag-and-drop editing experience consistent with the rest of RawDrive
**Depends on**: Phase 11
**Requirements**: EDITR-01, EDITR-02, EDITR-03, EDITR-04, EDITR-05, EDITR-06
**Success Criteria** (what must be TRUE):
  1. User edits a profile field and sees the change reflected in the live preview panel instantly (no save-and-reload cycle)
  2. User drags a profile section to a new position and the reordered layout persists after page reload
  3. User picks a gradient or solid color in the visual theme picker and the preview updates immediately
  4. User toggles between mobile, tablet, and desktop device frames in the preview and sees accurate representations
  5. User stops typing mid-edit, navigates away, and returns to find all changes auto-saved
**Plans**: 3 plans

Plans:
- [ ] 12-01-PLAN.md -- EditorContext, auto-save hook, npm packages, Alembic migration for section_order
- [ ] 12-02-PLAN.md -- DnD section reordering, device frame preview, gradient color picker
- [ ] 12-03-PLAN.md -- Wire editors to new system, visual verification

### Phase 13: Content Blocks & Performance
**Goal**: Rich content blocks are available on public profiles and all pages meet the performance budget
**Depends on**: Phase 12
**Requirements**: CNTNT-01, CNTNT-02, CNTNT-03, CNTNT-04, PUBPG-05
**Success Criteria** (what must be TRUE):
  1. User adds a featured gallery preview block to their profile and visitors see gallery cover images with a link to the full gallery
  2. User adds a booking CTA button that links to their calendar/booking URL, prominently displayed on the public page
  3. User displays client testimonials on their public profile with proper formatting and attribution
  4. Social links render with correct platform icons (including Threads, Bluesky) and hover animations
  5. All public profile pages load in under 2 seconds (LCP) on a throttled 4G connection with all content blocks present
**Plans**: 3 plans

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD

### Phase 14: FaceID Deep Dive & Enhancement
**Goal**: All face identification features work reliably, with competitive parity to Google Photos/Apple Photos face grouping, and a polished face management UX
**Depends on**: Phase 10 (avatar/R2 pipeline, shared infrastructure)
**Requirements**: FACE-01, FACE-02, FACE-03, FACE-04, FACE-05
**Success Criteria** (what must be TRUE):
  1. Face detection runs on uploaded photos and correctly identifies/groups faces with >90% accuracy
  2. Users can view, name, merge, and split face groups through an intuitive management interface
  3. Face search allows finding all photos of a specific person across all galleries
  4. Face recognition works reliably across different lighting, angles, and photo qualities
  5. Performance: face processing completes within acceptable time and doesn't block uploads
**Plans**: 5 plans

Plans:
- [x] 14-01-PLAN.md -- Backend critical bug fixes & security hardening (500 errors, embeddings in API, consent bypass, model hash, representative faces)
- [x] 14-02-PLAN.md -- Performance infrastructure (HNSW index, batched centroid recalculation, eager model loading, worker timeout enforcement)
- [x] 14-03-PLAN.md -- Worker reliability & consent enforcement (consent in workers, cascade delete, deadlock prevention, cache coherence)
- [x] 14-04-PLAN.md -- Frontend bug fixes & state management (API response normalization, state sync, error boundaries, responsive grid, keyboard nav)
- [x] 14-05-PLAN.md -- UX polish & face search (confidence filter, context menu, undo merge, cross-gallery face search, human verification)

### v1.2 Public Gallery & Gallery Player Modernization

**Milestone Goal:** Research competitor platforms and modernize the public gallery viewing experience -- layouts, lightbox, client interactions, downloads, sharing, per-gallery analytics, and gallery UX polish to match or exceed Pixieset, ShootProof, Pic-Time, SmugMug, Zenfolio, Pass, and Narrative.

**Phase Numbering:**
- Integer phases (15, 16, 17, 18, 19, 20): Planned v1.2 work
- Decimal phases (15.1, 16.1): Urgent insertions if needed

- [x] **Phase 15: Foundation Refactor & Data Model** - Decompose PublicGalleryPage monolith, visitor-scoped proofing table, LayoutStyle enum sync, shared lightbox hooks (completed 2026-03-19)
- [ ] **Phase 16: Gallery Layout Engine & Progressive Loading** - Justified, mosaic, enhanced masonry layouts, layout switcher, LQIP blur-up pipeline
- [ ] **Phase 17: Gallery Player** - Fullscreen lightbox with zoom/pan/swipe, EXIF overlay, filmstrip navigation, mobile touch gestures
- [ ] **Phase 18: Client Interactions & Gallery UX** - Favorites, selections with quotas, comments, WebSocket sync, AI tooltips, bulk actions, settings presets, sub-gallery permissions
- [ ] **Phase 19: Downloads & Delivery** - Batch ZIP downloads, size options, gallery expiration with reminder emails, download tracking
- [ ] **Phase 20: Sharing, Analytics & Polish** - OG previews, QR codes, embeds, dark/light toggle, branded password page, background music, per-gallery analytics, gallery discovery

### Phase 15: Foundation Refactor & Data Model
**Goal**: Gallery page architecture is decomposed into composable components and data model is hardened for visitor-scoped interactions and new layout types
**Depends on**: v1.1 (complete) -- unified theme engine from Phase 10 carries forward
**Requirements**: FNDN-01, FNDN-02, FNDN-03
**Success Criteria** (what must be TRUE):
  1. PublicGalleryPage renders identically to before but is composed of PublicGalleryShell + React Contexts (GalleryThemeContext, GalleryInteractionContext, GalleryPlayerContext) -- no 800-line monolith remains
  2. Two different clients visiting the same gallery see independent favorites and selections (visitor-scoped proofing via gallery_visitor_actions table)
  3. Adding a new LayoutStyle value in shared-types automatically appears in backend models and gallery-service schemas without manual sync (enum round-trip test passes)
**Plans**: 3 plans

Plans:
- [ ] 15-01-PLAN.md -- LayoutStyle enum sync (8 values across TS/Python/DB) + gallery_visitor_actions table for per-visitor proofing
- [ ] 15-02-PLAN.md -- Decompose PublicGalleryPage monolith into PublicGalleryShell + 3 React Contexts + TanStack Query hooks
- [ ] 15-03-PLAN.md -- Decouple lightbox hooks from workspace auth + LayoutStyle enum round-trip tests

### Phase 16: Gallery Layout Engine & Progressive Loading
**Goal**: Public galleries render in multiple modern layout modes with progressive image loading for fast perceived performance
**Depends on**: Phase 15
**Requirements**: LYOT-01, LYOT-02, LYOT-03, LYOT-04, PROG-01
**Success Criteria** (what must be TRUE):
  1. Gallery owner selects justified layout and public gallery renders photos in uniform-height rows with aspect-ratio-aware balancing on all screen sizes
  2. Gallery owner selects mosaic layout and public gallery renders photos in varied tile sizes creating a magazine-style grid
  3. Existing masonry layout renders with improved column balancing and responsive breakpoints across mobile, tablet, and desktop
  4. Gallery visitor can toggle between available layouts via a layout switcher UI without page reload
  5. All gallery images load with a blurred LQIP placeholder that transitions smoothly to full resolution as the image downloads
**Plans**: 3 plans

Plans:
- [ ] 16-01-PLAN.md -- Layout engine foundation: types, ProgressiveImage LQIP blur-up, GridLayout, justified-layout install
- [ ] 16-02-PLAN.md -- Three layout renderers: JustifiedLayout, MosaicLayout, EnhancedMasonryLayout
- [ ] 16-03-PLAN.md -- LayoutSwitcher UI, wire GalleryLayoutEngine into PublicGalleryContent, visual verification

### Phase 17: Gallery Player
**Goal**: Gallery visitors experience a premium fullscreen photo viewing experience with gestures, metadata, and filmstrip navigation
**Depends on**: Phase 16 (LQIP pipeline feeds player progressive loading)
**Requirements**: PLYR-01, PLYR-02, PLYR-03, PLYR-04
**Success Criteria** (what must be TRUE):
  1. Visitor clicks a photo in the gallery and enters a fullscreen lightbox with smooth zoom (scroll/pinch), pan (drag), and swipe-to-navigate between photos
  2. Visitor taps an info button in the player and sees EXIF data (aperture, shutter speed, ISO, lens) overlaid on the current photo
  3. Visitor sees a filmstrip thumbnail strip at the bottom of the player and can click any thumbnail to jump to that photo
  4. Mobile visitor can pinch-to-zoom, swipe left/right to navigate, and double-tap to toggle zoom on any photo in the player
**Plans**: 3 plans

Plans:
- [ ] 17-01: TBD
- [ ] 17-02: TBD

### Phase 18: Client Interactions & Gallery UX
**Goal**: Clients can interact with gallery photos (favorite, select, comment) and photographers have professional gallery management tools
**Depends on**: Phase 17 (player overlay provides primary interaction surface)
**Requirements**: INTR-01, INTR-02, INTR-03, INTR-04, GALUX-01, GALUX-02, GALUX-03, GALUX-04, GALUX-05
**Success Criteria** (what must be TRUE):
  1. Client clicks a heart icon on any photo in the public gallery and the favorite persists across page reloads (visitor-scoped)
  2. Photographer sets a selection quota (e.g., "pick 50") and client sees a progress counter showing selected count vs allowed maximum
  3. Client leaves a comment on a photo during proofing and photographer sees the comment in their dashboard in real-time via WebSocket
  4. Each AI tool in the gallery toolbar shows a tooltip with 1-2 sentence description on hover explaining what it does
  5. Multi-selecting photos activates a visible bulk action toolbar with batch edit, tag, download, and delete operations
**Plans**: 3 plans

Plans:
- [ ] 18-01: TBD
- [ ] 18-02: TBD
- [ ] 18-03: TBD

### Phase 19: Downloads & Delivery
**Goal**: Clients can download gallery photos in multiple formats with tracking, and galleries auto-expire with clear communication
**Depends on**: Phase 18 (download favorites/selections depends on visitor-scoped selection data)
**Requirements**: DWNL-01, DWNL-02, DWNL-03, DWNL-04
**Success Criteria** (what must be TRUE):
  1. Client clicks "Download All" or selects specific photos and downloads a ZIP file with a visible progress bar showing percentage complete
  2. Client can choose between web, print, and original download sizes as permitted by the photographer's download policy for that gallery
  3. Gallery with an expiration date shows a countdown to the client, and reminder emails are sent automatically before the deadline
  4. Photographer opens gallery settings and sees a download log showing who downloaded which photos and when
**Plans**: 3 plans

Plans:
- [ ] 19-01: TBD
- [ ] 19-02: TBD

### Phase 20: Sharing, Analytics & Polish
**Goal**: Galleries are shareable with rich previews, photographers see per-gallery engagement data, and all gallery experiences are polished across themes and devices
**Depends on**: Phase 19 (sharing/analytics layer sits on complete gallery feature set)
**Requirements**: SHAR-01, SHAR-02, SHAR-03, SHAR-04, PROG-02, PROG-03, GANLT-01, GANLT-02, GANLT-03, GDISC-01, GDISC-02
**Success Criteria** (what must be TRUE):
  1. Sharing a gallery link on social media (Facebook, Twitter, iMessage) displays a rich preview with gallery cover photo, title, and photographer name
  2. Photographer generates a QR code for a gallery and scanning it on a phone opens the gallery directly
  3. Photographer copies an embed code and pastes it into their website, rendering a functional gallery widget in an iframe
  4. Gallery viewer toggles between dark and light mode and the entire gallery UI updates consistently (backgrounds, text, controls)
  5. Password-protected gallery shows a custom-branded entry page with photographer's logo, colors, and optional message before granting access
**Plans**: 3 plans

Plans:
- [ ] 20-01: TBD
- [ ] 20-02: TBD
- [ ] 20-03: TBD

### v1.3 Monetization, Onboarding & Growth

**Milestone Goal:** Transform RawDrive from feature-complete tool into growth-ready business -- pricing transparency, guided onboarding, business analytics, third-party integrations, and feature discovery.

**Phase Numbering:**
- Integer phases (21, 22, 23, 24): Planned v1.3 work

- [ ] **Phase 21: Onboarding & Feature Discovery** - Guided wizard, adaptive next-steps dashboard, interactive tooltips, help center, video walkthroughs
- [ ] **Phase 22: Pricing & Monetization UX** - Tier comparison page, contextual upgrade prompts, trial management, premium feature gating
- [ ] **Phase 23: Business Analytics & KPIs** - Conversion funnel, client lifecycle, revenue metrics, weekly digest emails
- [ ] **Phase 24: Integration Ecosystem** - Email marketing sync, calendar booking, cloud import, Zapier/webhook triggers

### Phase 21: Onboarding & Feature Discovery
**Goal**: New users reach their first "aha moment" (published gallery with photos) within 10 minutes of signup
**Depends on**: v1.2 (complete)
**Requirements**: ONBRD-01, ONBRD-02, ONBRD-03, ONBRD-04, FDISC-01, FDISC-02, FDISC-03
**Success Criteria** (what must be TRUE):
  1. New user completes onboarding wizard (upload photo, create gallery, set avatar/title) with progress bar showing 3/3 steps
  2. Dashboard shows contextual "next step" cards that update as user activates features (gallery -> clients -> analytics)
  3. First visit to Galleries module shows interactive tooltip explaining key actions, dismissable and non-blocking
  4. Empty states in all major modules include video walkthrough or animated tutorial (not just text + CTA button)
  5. Help center search returns relevant articles for common queries (upload, share, client, billing)
**Plans**: 3 plans

### Phase 22: Pricing & Monetization UX
**Goal**: Users clearly understand plan differences and are guided toward upgrades at natural friction points
**Depends on**: Phase 21 -- users must be activated before upgrade prompts have meaning
**Requirements**: MONTZ-01, MONTZ-02, MONTZ-03, MONTZ-04
**Success Criteria** (what must be TRUE):
  1. Public pricing page displays all plan tiers with feature matrix, storage limits, AI credits, and gallery counts
  2. Free-tier user clicking a premium theme sees lock icon, feature preview, and one-click upgrade path
  3. Trial user sees days remaining, usage vs limits, and clear explanation of post-expiry behavior
  4. Upgrade flow shows clear before/after comparison between current plan and target plan
**Plans**: 3 plans

### Phase 23: Business Analytics & KPIs
**Goal**: Photographers have actionable business intelligence showing how their platform drives client engagement and revenue
**Depends on**: Phase 22
**Requirements**: BKPI-01, BKPI-02, BKPI-03, BKPI-04
**Success Criteria** (what must be TRUE):
  1. Analytics dashboard shows conversion funnel from gallery view through download to inquiry with drop-off rates
  2. Client lifecycle view shows distribution across stages (lead, active, completed, churned) with transition history
  3. Revenue panel shows MRR trend, plan distribution pie chart, and upgrade/downgrade events
  4. Weekly email digest arrives with top 5 metrics, notable changes, and actionable suggestions
**Plans**: 3 plans

### Phase 24: Integration Ecosystem
**Goal**: RawDrive connects to photographers' existing tools, eliminating manual data entry and enabling automation
**Depends on**: Phase 23
**Requirements**: INTGR-01, INTGR-02, INTGR-03, INTGR-04
**Success Criteria** (what must be TRUE):
  1. User connects Mailchimp/ConvertKit account and client list syncs with tag mapping within 5 minutes
  2. User connects Google Calendar and public profile shows real booking availability with selectable time slots
  3. User imports photos from Google Drive folder into a gallery with progress indicator and completion summary
  4. User configures webhook URL and receives POST payload within 30 seconds of gallery publish event
**Plans**: 3 plans

## Progress

**Execution Order:**
Phases execute in numeric order: 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 -> 19 -> 20 -> 21 -> 22 -> 23 -> 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 01. Security Hardening | v1.0 | 2/2 | Complete | 2026-03-18 |
| 02. Email Infrastructure | v1.0 | 2/2 | Complete | 2026-03-18 |
| 03. AI Service Stabilization | v1.0 | 2/2 | Complete | 2026-03-18 |
| 04. Rate Limiting | v1.0 | 1/1 | Complete | 2026-03-18 |
| 05. Email Features | v1.0 | 3/3 | Complete | 2026-03-18 |
| 06. AI/ML Pipeline | v1.0 | 5/5 | Complete | 2026-03-18 |
| 07. Gallery Completion | v1.0 | 2/2 | Complete | 2026-03-18 |
| 08. Notifications | v1.0 | 2/2 | Complete | 2026-03-19 |
| 09. Shared Packages & Test Coverage | v1.0 | 4/4 | Complete | 2026-03-19 |
| 10. Foundation & Fixes | v1.1 | Complete    | 2026-03-19 | 2026-03-19 |
| 11. Public Page Redesign | 3/3 | Complete    | 2026-03-20 | - |
| 12. Editor Redesign | 1/3 | In Progress|  | - |
| 13. Content Blocks & Performance | v1.1 | 0/? | Not started | - |
| 14. FaceID Deep Dive & Enhancement | v1.1 | 5/5 | Complete | 2026-03-19 |
| 15. Foundation Refactor & Data Model | 3/3 | Complete    | 2026-03-19 | - |
| 16. Gallery Layout Engine & Progressive Loading | v1.2 | 0/? | Not started | - |
| 17. Gallery Player | v1.2 | 0/? | Not started | - |
| 18. Client Interactions & Gallery UX | v1.2 | 0/? | Not started | - |
| 19. Downloads & Delivery | v1.2 | 0/? | Not started | - |
| 20. Sharing, Analytics & Polish | v1.2 | 0/? | Not started | - |
| 21. Onboarding & Feature Discovery | v1.3 | 0/? | Not started | - |
| 22. Pricing & Monetization UX | v1.3 | 0/? | Not started | - |
| 23. Business Analytics & KPIs | v1.3 | 0/? | Not started | - |
| 24. Integration Ecosystem | v1.3 | 0/? | Not started | - |
