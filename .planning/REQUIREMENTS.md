# Requirements: RawDrive v1.1

**Defined:** 2026-03-19
**Core Value:** Photographers can reliably upload, organize, curate, and deliver photos to clients -- every core workflow functions end-to-end with AI assistance and real-time feedback.

## v1.1 Requirements

### Foundation

- [ ] **FNDTN-01**: Avatar upload displays correctly on both personal and company profiles with R2 storage pipeline
- [ ] **FNDTN-02**: Avatar has proper fallback (initials/placeholder) when image fails to load
- [ ] **FNDTN-03**: Theme engine consolidated into single UnifiedThemeEngine with CSS custom properties (legacy themes deleted)
- [ ] **FNDTN-04**: Personal and company profiles share a unified PublicProfileRenderer component
- [ ] **FNDTN-05**: Smoke tests verify both profile pages load, avatar displays, and themes render correctly

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

## v2 Requirements

### Advanced Content

- **ACNT-01**: User can add custom CSS to their public profile
- **ACNT-02**: User can schedule profile publish/unpublish times
- **ACNT-03**: User can A/B test different profile layouts

### Analytics

- **ANLT-01**: User can view detailed profile analytics dashboard (views, clicks, geography)
- **ANLT-02**: User can see click-through rates on individual links
- **ANLT-03**: User receives weekly profile performance email digest

## Out of Scope

| Feature | Reason |
|---------|--------|
| Commerce/store features | Stan Store/Beacons territory -- not core to photography platform |
| Newsletter/email signup blocks | Scope creep -- photographers use external email tools |
| Video background themes | Bandwidth costs, mobile performance risk |
| SSR framework migration | Too invasive -- prerendering service sufficient for SEO |
| Custom domain for profiles | Infrastructure complexity, defer to v2+ |
| Profile versioning/history | Nice-to-have, not needed for modernization |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FNDTN-01 | Phase 10 | Pending |
| FNDTN-02 | Phase 10 | Pending |
| FNDTN-03 | Phase 10 | Pending |
| FNDTN-04 | Phase 10 | Pending |
| FNDTN-05 | Phase 10 | Pending |
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

**Coverage:**
- v1.1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after roadmap creation*
