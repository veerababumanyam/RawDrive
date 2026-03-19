# Roadmap: RawDrive

## Milestones

- [x] **v1.0 MVP** - Phases 01-09 (shipped 2026-03-19)
- [ ] **v1.1 Profile & Public Page Modernization** - Phases 10-13 (in progress)

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

- [ ] **Phase 10: Foundation & Fixes** - Fix avatar/R2 pipeline, consolidate theme engine, scaffold shared components, add smoke tests
- [ ] **Phase 11: Public Page Redesign** - Mobile-first layouts for both profiles, animated themes, bento grid, dark mode, SEO metadata
- [ ] **Phase 12: Editor Redesign** - Live preview, DnD section reordering, visual color picker, device frames, auto-save
- [ ] **Phase 13: Content Blocks & Performance** - Gallery preview, booking CTA, testimonials, social links, LCP budget enforcement

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
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

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

## Progress

**Execution Order:**
Phases execute in numeric order: 10 -> 11 -> 12 -> 13

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
| 10. Foundation & Fixes | v1.1 | 0/? | Not started | - |
| 11. Public Page Redesign | v1.1 | 0/? | Not started | - |
| 12. Editor Redesign | v1.1 | 0/? | Not started | - |
| 13. Content Blocks & Performance | v1.1 | 0/? | Not started | - |
