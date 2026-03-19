# Requirements: RawDrive v1.1

**Defined:** 2026-03-19
**Core Value:** Photographers can reliably upload, organize, curate, and deliver photos to clients -- every core workflow functions end-to-end with AI assistance and real-time feedback.

## v1.1 Requirements

### Foundation

- [x] **FNDTN-01**: Avatar upload displays correctly on both personal and company profiles with R2 storage pipeline
- [x] **FNDTN-02**: Avatar has proper fallback (initials/placeholder) when image fails to load
- [x] **FNDTN-03**: Theme engine consolidated into single UnifiedThemeEngine with CSS custom properties (legacy themes deleted)
- [x] **FNDTN-04**: Personal and company profiles share a unified PublicProfileRenderer component
- [x] **FNDTN-05**: Smoke tests verify both profile pages load, avatar displays, and themes render correctly

### Public Page

- [ ] **PUBPG-01**: Public personal profile (`/u/:slug`) renders mobile-first responsive layout across all devices
- [ ] **PUBPG-02**: Public company profile (`/p/:slug`) renders mobile-first responsive layout across all devices
- [ ] **PUBPG-03**: User can select from animated theme backgrounds (gradients, particles, subtle motion effects)
- [ ] **PUBPG-04**: Bento grid layout is polished with proper spacing, transitions, and responsive breakpoints
- [ ] **PUBPG-05**: Public profile pages load in under 2 seconds (LCP) with lazy-loaded embeds and optimized images
- [ ] **PUBPG-06**: Both public pages support dark mode rendering

### Editor

- [ ] **EDITR-01**: Live preview updates in real-time as user edits profile fields (no desync)
- [ ] **EDITR-02**: User can drag-and-drop to reorder profile sections with changes persisted to database
- [ ] **EDITR-03**: User can customize theme with visual gradient and solid color picker
- [ ] **EDITR-04**: User can preview profile appearance in mobile, tablet, and desktop device frames
- [ ] **EDITR-05**: Editor UI is consistent with existing RawDrive application design patterns
- [ ] **EDITR-06**: Profile changes auto-save with debounced persistence

### Content

- [ ] **CNTNT-01**: User can display a featured gallery preview block on public profile
- [ ] **CNTNT-02**: User can add a prominent booking CTA button linking to calendar/booking URL
- [ ] **CNTNT-03**: User can display client testimonials/reviews on public profile
- [ ] **CNTNT-04**: Social links render with proper platform icons and hover animations

### SEO

- [ ] **SEO-01**: Public profile pages include proper meta tags (title, description, keywords)
- [ ] **SEO-02**: Public profile pages include Open Graph and Twitter Card metadata
- [ ] **SEO-03**: Public profile pages include JSON-LD Person/Organization structured data
- [ ] **SEO-04**: Public profile pages are crawlable by search engines (not blocked by client-side rendering)

### Face Identification

- [x] **FACE-01**: Face detection runs on uploaded photos and correctly identifies/groups faces with >90% accuracy (no 500 errors, consent enforced, model validated)
- [ ] **FACE-02**: Users can view, name, merge, and split face groups through an intuitive management interface (responsive grid, context menu, confidence filter, error boundaries)
- [ ] **FACE-03**: Face search allows finding all photos of a specific person across all galleries in a workspace
- [x] **FACE-04**: Face recognition works reliably across different lighting, angles, and photo qualities (consent bypass removed, deadlock prevention, cache coherence, cascade delete verified)
- [x] **FACE-05**: Face processing completes within acceptable time and doesn't block uploads (HNSW index, batched centroids, eager model loading, enforced worker timeouts)

## v1.2 Requirements

### Gallery Analytics

- [ ] **GANLT-01**: Each gallery shows per-gallery engagement metrics (views, unique visitors, avg. time spent)
- [ ] **GANLT-02**: Gallery dashboard shows download tracking detail (per-photo downloads, batch vs single, total bandwidth)
- [ ] **GANLT-03**: Gallery owner can see device and geographic breakdown per gallery (not just workspace-wide)

### Gallery Discovery

- [ ] **GDISC-01**: Gallery search supports filtering by date range, status, client, and tags simultaneously
- [ ] **GDISC-02**: Galleries surface engagement rate ranking (most viewed, most downloaded, most shared)

## v1.3 Requirements

### Monetization & Pricing

- [ ] **MONTZ-01**: Public pricing page displays tier comparison with feature matrix, storage limits, and AI credit allocations
- [ ] **MONTZ-02**: Upgrade flow from free tier shows clear value proposition with feature diff between current and target plan
- [ ] **MONTZ-03**: Premium features (themes, AI credits, storage) show lock icon with contextual upgrade prompt when accessed on free tier
- [ ] **MONTZ-04**: Trial management shows days remaining, usage stats, and what happens after expiry

### Onboarding & Activation

- [ ] **ONBRD-01**: New user completes guided onboarding wizard (upload first photo, create gallery, set profile) with progress tracking
- [ ] **ONBRD-02**: Dashboard shows contextual "next steps" cards that adapt based on which features user has activated
- [ ] **ONBRD-03**: Interactive feature tooltips appear on first visit to each major module (galleries, clients, FaceIDs, analytics)
- [ ] **ONBRD-04**: Profile setup wizard prioritizes highest-impact fields first (avatar, title, portfolio link) with skip option

### Business Analytics & KPIs

- [ ] **BKPI-01**: Analytics dashboard shows conversion funnel metrics (gallery view -> download -> inquiry -> booking)
- [ ] **BKPI-02**: Client lifecycle dashboard tracks stages (lead, active, completed, churned) with transition dates
- [ ] **BKPI-03**: Revenue metrics panel shows monthly recurring revenue, plan distribution, and upgrade/downgrade trends
- [ ] **BKPI-04**: Weekly email digest summarizes key metrics (new visitors, downloads, client activity, storage usage)

### Integration Ecosystem

- [ ] **INTGR-01**: Email marketing integration allows syncing client list to Mailchimp or ConvertKit with tag mapping
- [ ] **INTGR-02**: Calendar integration (Google Calendar, Calendly) shows booking availability on public profile with real-time slots
- [ ] **INTGR-03**: Cloud storage import allows one-time bulk import from Google Drive or Dropbox into galleries
- [ ] **INTGR-04**: Zapier/webhook triggers fire on key events (new client, gallery published, download completed) for third-party automation

### Feature Discovery & Help

- [ ] **FDISC-01**: In-app help center provides searchable knowledge base with context-aware suggestions
- [ ] **FDISC-02**: Each major feature shows "Learn more" expandable with use case examples and best practices
- [ ] **FDISC-03**: Empty states across all modules include video walkthroughs or animated tutorials (not just text CTAs)

## v1.2 Gallery UX Requirements (from BA Review)

### Gallery Usability

- [ ] **GALUX-01**: Each AI tool in gallery toolbar shows tooltip with 1-2 sentence description on hover
- [ ] **GALUX-02**: Gallery provides visible bulk action toolbar when multiple photos selected (batch edit, tag, download, delete)
- [ ] **GALUX-03**: Gallery settings offer one-click presets (Proofing, Delivery, Sharing, Premium Delivery) that configure access, downloads, and watermark together
- [ ] **GALUX-04**: AI processing shows progress bar with estimated completion time and per-photo status (replacing "Some analyses failed" generic message)
- [ ] **GALUX-05**: Sub-galleries show clear permission inheritance indicator and allow override per sub-gallery

## v2+ Requirements (Backlog)

### Gallery Templates & Commerce

- **GTMPL-01**: Gallery templates with pre-built structures (Wedding: Ceremony/Reception/Details/Portraits; Event: Candids/Groups/Highlights; Product: Hero/Details/Lifestyle)
- **GCOMM-01**: Direct print ordering from gallery with album builder, gift print options, and lab fulfillment integration
- **GCOLB-01**: Real-time client collaboration with markup tools, revision tracking, and approval workflow
- **GAILR-01**: AI style-based recommendations ("show me outdoor portraits"), seasonal suggestions, and client preference learning

### Advanced Content

- **ACNT-01**: User can add custom CSS to their public profile
- **ACNT-02**: User can schedule profile publish/unpublish times
- **ACNT-03**: User can A/B test different profile layouts

### Advanced Analytics

- **ANLT-01**: User can view detailed profile analytics dashboard (views, clicks, geography)
- **ANLT-02**: User can see click-through rates on individual links
- **ANLT-03**: User receives weekly profile performance email digest

### Platform Expansion

- **PLAT-01**: Video content upload and streaming support
- **PLAT-02**: Multi-language UI beyond i18n (auto-detect visitor language for public pages)
- **PLAT-03**: White-label B2B solution for agencies and studios
- **PLAT-04**: Native mobile app (iOS/Android) beyond PWA
- **PLAT-05**: Print commerce integration (lab fulfillment, print pricing, client ordering)

## Out of Scope (Current Milestones)

| Feature | Reason | Revisit |
|---------|--------|---------|
| Commerce/store features | Stan Store/Beacons territory -- not core to photography platform | v2+ |
| Newsletter/email signup blocks | Scope creep -- photographers use external email tools | v2+ |
| Video background themes | Bandwidth costs, mobile performance risk | v2+ |
| SSR framework migration | Too invasive -- prerendering service sufficient for SEO | v2+ |
| Custom domain for profiles | Infrastructure complexity | v2+ |
| Profile versioning/history | Nice-to-have, not needed for modernization | v2+ |
| Native mobile app | PWA covers mobile; native adds maintenance burden | v2+ |
| Real-time collaborative editing | Not needed for photography use case | v2+ |
| Gamification (badges, achievements) | Engagement feature -- revisit after core monetization | v2+ |
| Community/marketplace features | Platform play -- requires critical mass first | v2+ |

## Traceability

### v1.1 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FNDTN-01 | Phase 10 | Complete |
| FNDTN-02 | Phase 10 | Complete |
| FNDTN-03 | Phase 10 | Complete |
| FNDTN-04 | Phase 10 | Complete |
| FNDTN-05 | Phase 10 | Complete |
| PUBPG-01 | Phase 11 | Pending |
| PUBPG-02 | Phase 11 | Pending |
| PUBPG-03 | Phase 11 | Pending |
| PUBPG-04 | Phase 11 | Pending |
| PUBPG-05 | Phase 13 | Pending |
| PUBPG-06 | Phase 11 | Pending |
| EDITR-01 | Phase 12 | Pending |
| EDITR-02 | Phase 12 | Pending |
| EDITR-03 | Phase 12 | Pending |
| EDITR-04 | Phase 12 | Pending |
| EDITR-05 | Phase 12 | Pending |
| EDITR-06 | Phase 12 | Pending |
| CNTNT-01 | Phase 13 | Pending |
| CNTNT-02 | Phase 13 | Pending |
| CNTNT-03 | Phase 13 | Pending |
| CNTNT-04 | Phase 13 | Pending |
| SEO-01 | Phase 11 | Pending |
| SEO-02 | Phase 11 | Pending |
| SEO-03 | Phase 11 | Pending |
| SEO-04 | Phase 11 | Pending |
| FACE-01 | Phase 14 | Complete |
| FACE-02 | Phase 14 | Pending |
| FACE-03 | Phase 14 | Pending |
| FACE-04 | Phase 14 | Complete |
| FACE-05 | Phase 14 | Complete |

### v1.2 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GANLT-01 | TBD | Pending |
| GANLT-02 | TBD | Pending |
| GANLT-03 | TBD | Pending |
| GDISC-01 | TBD | Pending |
| GDISC-02 | TBD | Pending |
| GALUX-01 | Phase 18 | Pending |
| GALUX-02 | Phase 17 | Pending |
| GALUX-03 | Phase 17 | Pending |
| GALUX-04 | Phase 18 | Pending |
| GALUX-05 | Phase 17 | Pending |

### v1.3 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MONTZ-01 | TBD | Pending |
| MONTZ-02 | TBD | Pending |
| MONTZ-03 | TBD | Pending |
| MONTZ-04 | TBD | Pending |
| ONBRD-01 | TBD | Pending |
| ONBRD-02 | TBD | Pending |
| ONBRD-03 | TBD | Pending |
| ONBRD-04 | TBD | Pending |
| BKPI-01 | TBD | Pending |
| BKPI-02 | TBD | Pending |
| BKPI-03 | TBD | Pending |
| BKPI-04 | TBD | Pending |
| INTGR-01 | TBD | Pending |
| INTGR-02 | TBD | Pending |
| INTGR-03 | TBD | Pending |
| INTGR-04 | TBD | Pending |
| FDISC-01 | TBD | Pending |
| FDISC-02 | TBD | Pending |
| FDISC-03 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 30 total (25 original + 5 FACE), 30 mapped, 0 unmapped
- v1.2 requirements: 10 total (5 gallery analytics/discovery + 5 gallery UX from BA review), mapped to Phases 17-18
- v1.3 requirements: 19 (monetization, onboarding, KPIs, integrations, feature discovery), pending roadmap
- v2+ backlog: 12 items (gallery templates/commerce/collaboration/AI, advanced content, analytics, platform expansion)
- **Grand total: 71 requirements across all milestones**

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — FACE-01 through FACE-05 added for Phase 14*
