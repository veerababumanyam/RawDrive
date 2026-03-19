# Roadmap: RawDrive

## Milestones

- [x] **v1.0 MVP** - Phases 01-09 (shipped 2026-03-19)
- [ ] **v1.1 Profile & Public Page Modernization** - Phases 10-14 (in progress)
- [ ] **v1.2 Public Gallery & Gallery Player Modernization** - Phases 15-18 (planned)
- [ ] **v1.3 Monetization, Onboarding & Growth** - Phases 19-22 (planned)

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
- [ ] **Phase 11: Public Page Redesign** - Mobile-first layouts for both profiles, animated themes, bento grid, dark mode, SEO metadata
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
**Plans**: 3 plans

Plans:
- [ ] 10-01-PLAN.md -- R2 avatar pipeline + AvatarDisplay component with fallback
- [ ] 10-02-PLAN.md -- UnifiedThemeEngine + SectionRegistry + PublicProfileRenderer
- [ ] 10-03-PLAN.md -- Wire pages to shared renderer, delete legacy files, smoke tests

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
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD
- [ ] 11-03: TBD

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
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD

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
**Plans**: TBD

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
- [ ] 14-01-PLAN.md -- Backend critical bug fixes & security hardening (500 errors, embeddings in API, consent bypass, model hash, representative faces)
- [ ] 14-02-PLAN.md -- Performance infrastructure (HNSW index, batched centroid recalculation, eager model loading, worker timeout enforcement)
- [ ] 14-03-PLAN.md -- Worker reliability & consent enforcement (consent in workers, cascade delete, deadlock prevention, cache coherence)
- [ ] 14-04-PLAN.md -- Frontend bug fixes & state management (API response normalization, state sync, error boundaries, responsive grid, keyboard nav)
- [ ] 14-05-PLAN.md -- UX polish & face search (confidence filter, context menu, undo merge, cross-gallery face search, human verification)

### v1.2 Public Gallery & Gallery Player Modernization

**Milestone Goal:** Research competitor platforms and modernize the public gallery viewing experience -- layouts, lightbox, client interactions, downloads, and per-gallery analytics.

**Phase Numbering:**
- Integer phases (15, 16, 17, 18): Planned v1.2 work
- Decimal phases (15.1, 16.1): Urgent insertions if needed

- [ ] **Phase 15: Gallery Research & Foundation** - Benchmark against Pixieset/ShootProof/Pic-Time/SmugMug, audit current gallery code, define design system tokens for gallery views
- [ ] **Phase 16: Gallery Layouts & Lightbox** - Modern layout engine (masonry, grid, justified, filmstrip), fullscreen lightbox with zoom/pan/EXIF, LQIP progressive loading
- [ ] **Phase 17: Client Interaction & Delivery** - Favorites/selections workflow, download flows (single/batch/full), password protection UX, gallery comments/proofing, bulk actions toolbar (GALUX-02), settings presets (GALUX-03), sub-gallery permissions (GALUX-05)
- [ ] **Phase 18: Gallery Analytics & Polish** - Per-gallery engagement metrics (GANLT-01/02/03), gallery discovery ranking (GDISC-01/02), AI tool tooltips (GALUX-01), AI processing status UX (GALUX-04), sharing OG previews, dark/light themes, performance budget

#### Phase 15: Gallery Research & Foundation
**Goal**: Current gallery codebase is audited, competitor benchmarks documented, and shared design tokens established for gallery views
**Depends on**: v1.1 (complete) -- unified theme engine from Phase 10 carries forward
**Requirements**: Research-only phase (no specific requirements -- feeds Phases 16-18)
**Success Criteria** (what must be TRUE):
  1. Competitive analysis document covers all 7 target platforms with feature matrix and screenshot references
  2. Current gallery code audit identifies all technical debt, broken features, and modernization targets
  3. Gallery design tokens (colors, spacing, typography, animation) are defined and integrated with UnifiedThemeEngine
**Plans**: TBD

#### Phase 16: Gallery Layouts & Lightbox
**Goal**: Public galleries render in modern layout modes with a premium fullscreen viewing experience
**Depends on**: Phase 15
**Requirements**: Gallery layouts, lightbox, LQIP (from v1.2 PROJECT.md scope)
**Success Criteria** (what must be TRUE):
  1. Gallery owner selects layout mode (masonry, grid, justified, filmstrip) and public gallery renders correctly on all devices
  2. Visitor clicks a photo and enters fullscreen lightbox with smooth zoom, pan, swipe navigation, and EXIF display
  3. Photos load with LQIP blur-up placeholder, replacing with full resolution progressively
  4. Keyboard navigation (arrow keys, escape) works in lightbox across desktop browsers
**Plans**: TBD

#### Phase 17: Client Interaction & Delivery
**Goal**: Clients can interact with galleries (favorites, comments, downloads) through polished, branded experiences with professional bulk workflows
**Depends on**: Phase 16
**Requirements**: Client favorites, downloads, password protection, comments (from v1.2 PROJECT.md scope), GALUX-02, GALUX-03, GALUX-05
**Success Criteria** (what must be TRUE):
  1. Client marks photos as favorites within a public gallery and photographer sees the selection list in their dashboard
  2. Client downloads single photo, batch selection, or full gallery with progress indicator and completion notification
  3. Password-protected gallery shows branded entry page with clear instructions
  4. Gallery expiration date displays prominently with countdown and download reminder
  5. Multi-select activates visible bulk action toolbar with batch edit, tag, download, and delete operations
  6. Gallery settings offer one-click presets (Proofing, Delivery, Sharing, Premium Delivery) configuring access+downloads+watermark
  7. Sub-gallery permissions show clear inheritance indicator with per-sub-gallery override option
**Plans**: TBD

#### Phase 18: Gallery Analytics & Polish
**Goal**: Gallery owners see per-gallery engagement metrics, AI tools are discoverable, and all galleries meet performance and SEO targets
**Depends on**: Phase 17
**Requirements**: GANLT-01, GANLT-02, GANLT-03, GDISC-01, GDISC-02, GALUX-01, GALUX-04
**Success Criteria** (what must be TRUE):
  1. Gallery detail page shows views, unique visitors, avg. time spent, and device/geo breakdown
  2. Download tracking shows per-photo download counts, batch vs single breakdown, and total bandwidth
  3. Gallery list supports filtering by date range, status, client, and tags simultaneously
  4. Gallery ranking view shows galleries ordered by engagement rate (most viewed, most downloaded)
  5. Public gallery pages include OG meta tags and render correctly in link previews
  6. Every AI tool in gallery toolbar shows tooltip with description on hover and link to help docs
  7. AI processing shows progress bar with estimated completion and per-photo status (no generic "failed" messages)
**Plans**: TBD

### v1.3 Monetization, Onboarding & Growth

**Milestone Goal:** Transform RawDrive from feature-complete tool into growth-ready business -- pricing transparency, guided onboarding, business analytics, third-party integrations, and feature discovery.

**Phase Numbering:**
- Integer phases (19, 20, 21, 22): Planned v1.3 work

- [ ] **Phase 19: Onboarding & Feature Discovery** - Guided wizard, adaptive next-steps dashboard, interactive tooltips, help center, video walkthroughs
- [ ] **Phase 20: Pricing & Monetization UX** - Tier comparison page, contextual upgrade prompts, trial management, premium feature gating
- [ ] **Phase 21: Business Analytics & KPIs** - Conversion funnel, client lifecycle, revenue metrics, weekly digest emails
- [ ] **Phase 22: Integration Ecosystem** - Email marketing sync, calendar booking, cloud import, Zapier/webhook triggers

#### Phase 19: Onboarding & Feature Discovery
**Goal**: New users reach their first "aha moment" (published gallery with photos) within 10 minutes of signup
**Depends on**: v1.2 (complete)
**Requirements**: ONBRD-01, ONBRD-02, ONBRD-03, ONBRD-04, FDISC-01, FDISC-02, FDISC-03
**Success Criteria** (what must be TRUE):
  1. New user completes onboarding wizard (upload photo, create gallery, set avatar/title) with progress bar showing 3/3 steps
  2. Dashboard shows contextual "next step" cards that update as user activates features (gallery -> clients -> analytics)
  3. First visit to Galleries module shows interactive tooltip explaining key actions, dismissable and non-blocking
  4. Empty states in all major modules include video walkthrough or animated tutorial (not just text + CTA button)
  5. Help center search returns relevant articles for common queries (upload, share, client, billing)
**Plans**: TBD

#### Phase 20: Pricing & Monetization UX
**Goal**: Users clearly understand plan differences and are guided toward upgrades at natural friction points
**Depends on**: Phase 19 -- users must be activated before upgrade prompts have meaning
**Requirements**: MONTZ-01, MONTZ-02, MONTZ-03, MONTZ-04
**Success Criteria** (what must be TRUE):
  1. Public pricing page displays all plan tiers with feature matrix, storage limits, AI credits, and gallery counts
  2. Free-tier user clicking a premium theme sees lock icon, feature preview, and one-click upgrade path
  3. Trial user sees days remaining, usage vs limits, and clear explanation of post-expiry behavior
  4. Upgrade flow shows clear before/after comparison between current plan and target plan
**Plans**: TBD

#### Phase 21: Business Analytics & KPIs
**Goal**: Photographers have actionable business intelligence showing how their platform drives client engagement and revenue
**Depends on**: Phase 20
**Requirements**: BKPI-01, BKPI-02, BKPI-03, BKPI-04
**Success Criteria** (what must be TRUE):
  1. Analytics dashboard shows conversion funnel from gallery view through download to inquiry with drop-off rates
  2. Client lifecycle view shows distribution across stages (lead, active, completed, churned) with transition history
  3. Revenue panel shows MRR trend, plan distribution pie chart, and upgrade/downgrade events
  4. Weekly email digest arrives with top 5 metrics, notable changes, and actionable suggestions
**Plans**: TBD

#### Phase 22: Integration Ecosystem
**Goal**: RawDrive connects to photographers' existing tools, eliminating manual data entry and enabling automation
**Depends on**: Phase 21
**Requirements**: INTGR-01, INTGR-02, INTGR-03, INTGR-04
**Success Criteria** (what must be TRUE):
  1. User connects Mailchimp/ConvertKit account and client list syncs with tag mapping within 5 minutes
  2. User connects Google Calendar and public profile shows real booking availability with selectable time slots
  3. User imports photos from Google Drive folder into a gallery with progress indicator and completion summary
  4. User configures webhook URL and receives POST payload within 30 seconds of gallery publish event
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 -> 19 -> 20 -> 21 -> 22

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
| 10. Foundation & Fixes | 3/3 | Complete   | 2026-03-19 | - |
| 11. Public Page Redesign | v1.1 | 0/? | Not started | - |
| 12. Editor Redesign | v1.1 | 0/? | Not started | - |
| 13. Content Blocks & Performance | v1.1 | 0/? | Not started | - |
| 14. FaceID Deep Dive & Enhancement | 5/5 | Complete   | 2026-03-19 | - |
| 15. Gallery Research & Foundation | v1.2 | 0/? | Not started | - |
| 16. Gallery Layouts & Lightbox | v1.2 | 0/? | Not started | - |
| 17. Client Interaction & Delivery | v1.2 | 0/? | Not started | - |
| 18. Gallery Analytics & Polish | v1.2 | 0/? | Not started | - |
| 19. Onboarding & Feature Discovery | v1.3 | 0/? | Not started | - |
| 20. Pricing & Monetization UX | v1.3 | 0/? | Not started | - |
| 21. Business Analytics & KPIs | v1.3 | 0/? | Not started | - |
| 22. Integration Ecosystem | v1.3 | 0/? | Not started | - |
