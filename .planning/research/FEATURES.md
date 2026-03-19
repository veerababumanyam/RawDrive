# Feature Research: Profile & Public Page Modernization

**Domain:** Link-in-bio / photographer profile pages
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH (broad ecosystem research with multiple corroborating sources; photographer-specific niche has fewer dedicated tools to compare)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or amateur.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Mobile-first responsive design | 85%+ of bio-link traffic is mobile; 53% abandon if load >3s | MEDIUM | RawDrive has responsive layout but needs polish pass for premium feel. Every competitor is mobile-first. |
| Theme/template system with one-click apply | Linktree, Beacons, Carrd all offer instant theme switching. Users expect visual variety without design skill. | MEDIUM | RawDrive has 20+ themed backgrounds; needs curation into cohesive "themes" (background + fonts + button style + colors as a unit). |
| Custom colors, fonts, button styles | Every competitor from free-tier Linktree to Beacons allows brand color customization. | LOW | RawDrive has per-field visibility toggles and some color controls. Consolidate into a proper theme builder. |
| Profile photo/avatar with crop | Universal across all platforms. Broken in RawDrive currently -- fix is P0. | LOW | Fix existing avatar upload crop/zoom. All competitors display circular or rounded-square avatar. |
| Social link icons (major platforms) | Linktree, Beacons, Pixieset all auto-render branded icons for Instagram, TikTok, YouTube, etc. | LOW | RawDrive supports 11 platforms already. Ensure icons are current (Threads, Bluesky, Lemon8 are now table stakes). |
| Custom links with titles + optional thumbnails | Core link-in-bio functionality. Every platform supports titled links. Thumbnails on links (Linktree Pro, Beacons free) add visual richness. | LOW | RawDrive has custom links. Add optional thumbnail/icon per link. |
| Bio/description text | Every platform shows a short bio under avatar. | LOW | Already exists in RawDrive. Ensure character limit is generous (Linktree allows 80 chars, Beacons ~200). |
| SEO metadata (title, description, OG tags) | Expected for any public page. Affects link previews on social shares. | LOW | RawDrive already has SEO metadata + JSON-LD. Verify OG image generation works correctly. |
| Analytics (page views, link clicks, referrers) | Linktree, Beacons, Later all provide click analytics. Users need to know what works. | LOW | RawDrive already tracks views, referrers, geography, device. Ensure per-link click tracking exists. |
| QR code for profile URL | Linktree, Pixieset, and most tools generate QR codes. Photographers print these on business cards. | LOW | RawDrive already has QR download. Ensure it is styled/branded (not generic black-and-white). |
| vCard download (contact card) | Photographers share contact info at events. Expected for professional profiles. | LOW | Already exists in RawDrive. Verify it works on iOS and Android. |
| Fast page load (<2s) | Bio links are impulse clicks from social media. Slow = bounce. | MEDIUM | Requires SSR or static generation for public pages, optimized image loading, minimal JS bundle for public view. |
| HTTPS + custom domain support | Carrd, Linktree Pro, Beacons Pro all offer custom domains. Professional photographers want their own domain. | HIGH | Not currently in RawDrive. Defer to v1.x -- use /u/:slug and /p/:slug for now, but architect for future custom domains. |

### Differentiators (Competitive Advantage)

Features that set RawDrive apart. Not required, but valuable -- especially where photography-specific needs diverge from generic link-in-bio tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Bento grid layout** (drag-and-drop blocks) | Bento.me pioneered this; it is now a major design trend for 2025-2026. Grid layouts feel more premium than vertical link lists. RawDrive already has a Bento Grid -- polish it. | MEDIUM | RawDrive has 25+ Bento Grid display components. Refine the grid editor to feel like Bento.me's drag-and-drop. Add snap-to-grid, resize handles, and responsive breakpoint controls. |
| **Featured gallery preview** (hero image grid) | No generic link-in-bio tool shows photography work inline. RawDrive can embed a live gallery preview directly on the profile page -- this is the killer differentiator. | MEDIUM | Already partially built. Make it a first-class block: auto-pull latest gallery covers, lightbox preview, link to full gallery. |
| **Animated themes with micro-interactions** | Linktree Pro offers Confetti, Starry Night, Rainbow animated themes. Subtle animations (hover effects, scroll-triggered reveals, parallax backgrounds) make pages feel premium. | MEDIUM | Add 4-6 animated themes. Use CSS animations + Framer Motion. Keep performant -- animations must not degrade mobile performance. |
| **AI-assisted bio and SEO generation** | RawDrive already has Gemini-powered bio/SEO generation. No competitor except Beacons (with "Beam" AI) offers this. Lean into it. | LOW | Already built. Polish the UX: show before/after, allow tone selection (professional, casual, creative), generate in multiple languages. |
| **Booking/contact CTA block** | Stan Store and Beacons emphasize conversion. A prominent "Book Now" or "Get in Touch" block with calendar integration or contact form is high-value for photographers. | MEDIUM | New feature. Add a CTA block type that can link to external booking (Calendly, HoneyBook) or show an inline contact form. |
| **Testimonial/review showcase** | Photographers live on social proof. No link-in-bio tool surfaces client reviews inline. | LOW | New block type. Pull from RawDrive's existing client review system or allow manual entry. Display as a carousel or grid. |
| **Music/video embed blocks** | Linktree, Beacons, and Bento.me support Spotify, YouTube, TikTok embeds inline. For wedding photographers, embedding a highlight reel is powerful. | LOW | RawDrive has TikTok/Spotify embeds already. Add YouTube embed block. Ensure all embeds are lazy-loaded for performance. |
| **Live preview in editor** | Linktree and Beacons both show real-time preview alongside editor. RawDrive has this but it is reportedly buggy. | MEDIUM | Fix existing live preview. Ensure it updates in real-time, shows mobile viewport by default, and allows toggling between mobile/tablet/desktop. |
| **Dual profile system (personal + company)** | Unique to RawDrive. Linktree has one profile. Having both /u/:slug (photographer) and /p/:slug (studio brand) lets photographers separate personal brand from business. | LOW | Already architected. Polish both editors and ensure visual consistency while allowing different themes per profile. |
| **Print store / pricing block** | Photographers sell prints. A block showing pricing tiers or linking to a print store is photography-specific value. | MEDIUM | New block type. Can be simple (link to external store) or rich (inline pricing cards). Start simple. |
| **Dark mode for public pages** | Many modern profiles (Bento, Beacons) support dark mode. Photographers' work often looks better on dark backgrounds. | LOW | Add dark mode toggle or auto-detect system preference. Apply to public pages. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for a photography platform.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full e-commerce store on profile** | Stan Store and Beacons sell digital products from bio page | RawDrive is a photography platform, not Shopify. Building commerce (cart, checkout, inventory) is massive scope creep. | Link to external store (Pixieset Print Store, SmugMug) or add a simple "Pricing" block with CTA links. |
| **Email marketing / newsletter from profile** | Beacons offers email capture and newsletters | Building email infrastructure on the profile page duplicates existing notification service. Photographers use Flodesk, Mailchimp, etc. | Add an email capture block that integrates with external providers via webhook/Zapier, or collect to RawDrive's own CRM. |
| **Full page builder (multi-page site)** | Carrd builds full one-page sites | Profile pages should be focused, single-purpose. Multi-page dilutes the bio-link value and competes with actual website builders. | Keep profile as a single, scrollable page. For full sites, photographers use Squarespace/Pixieset. |
| **Real-time collaboration on profile editor** | Seems useful for studios | Massive complexity for minimal value. Profile editing is a single-person task. | Allow workspace members with admin role to edit; no simultaneous editing needed. |
| **Custom CSS injection** | Power users want pixel-perfect control | Security risk (XSS), support burden, breaks on theme updates. | Offer enough theme customization (colors, fonts, spacing, button styles) that custom CSS is not needed. Provide 15+ themes instead. |
| **Social feed auto-sync (Instagram grid mirror)** | Later's Linkin.bio mirrors Instagram feed | Requires ongoing API authentication, breaks when platforms change APIs (Instagram API changes frequently). High maintenance cost. | Allow manual image uploads for featured work. Use gallery preview block to showcase photos natively. |
| **Heatmap analytics** | Seems data-rich | Overkill for a profile page. Click tracking per link + view counts + referrer data covers 95% of needs. Heatmaps add JS weight and complexity. | Stick with per-link click analytics, referrer breakdown, and geographic data (already built). |
| **Video backgrounds** | Beacons offers video backgrounds | Heavy on mobile bandwidth, drains battery, slow to load. Conflicts with <2s load time goal. | Offer subtle CSS animations (gradients, particles) that are performant. Allow static image backgrounds. |

## Feature Dependencies

```
[Fix Avatar Upload]
    (no dependencies, P0 bugfix)

[Theme Engine Consolidation]
    └──requires──> [Design Token System]
                       └──enables──> [Animated Themes]
                       └──enables──> [Dark Mode]
                       └──enables──> [One-Click Theme Apply]

[Bento Grid Editor Polish]
    └──requires──> [Block Component System]
                       └──enables──> [Booking CTA Block]
                       └──enables──> [Testimonial Block]
                       └──enables──> [Gallery Preview Block]
                       └──enables──> [Video/Music Embed Blocks]
                       └──enables──> [Pricing Block]

[Live Preview Fix]
    └──requires──> [Theme Engine Consolidation]
    └──enhances──> [Bento Grid Editor Polish]

[Analytics Dashboard]
    └──requires──> [Per-Link Click Tracking]
    └──enhances──> [All public page features]

[AI Bio/SEO Generation]
    (already built, polish only)
    └──enhances──> [SEO Metadata]

[Custom Domain Support]
    └──requires──> [DNS verification system]
    └──requires──> [SSL certificate provisioning]
    └──conflicts with──> [Fast delivery in v1.1 -- defer to v1.x]
```

### Dependency Notes

- **Theme Engine requires Design Token System:** Themes must be composed of tokens (colors, fonts, spacing, border-radius) to allow consistent one-click switching. Without tokens, themes are fragile CSS overrides.
- **All new block types require Block Component System:** Before adding booking, testimonial, or pricing blocks, establish a composable block architecture with shared interfaces for the Bento Grid.
- **Live Preview requires Theme Engine:** Preview must render the same theme engine the public page uses. Fix the engine first, then the preview will work correctly.
- **Custom Domain conflicts with v1.1 timeline:** DNS verification and SSL provisioning are infrastructure work that should not block the design modernization milestone.

## MVP Definition

### Launch With (v1.1 -- This Milestone)

Minimum to make profiles feel modern and premium.

- [ ] **Fix avatar upload crop/zoom** -- Broken functionality, P0
- [ ] **Theme engine consolidation** -- Unify backgrounds, fonts, colors, button styles into coherent themes (8-12 themes)
- [ ] **Animated themes (3-4)** -- Subtle CSS/Framer Motion animations (gradient shift, particle float, color cycle)
- [ ] **Mobile-first public page redesign** -- Sub-2s load, polished typography, proper spacing, smooth scrolling
- [ ] **Bento grid editor polish** -- Snap-to-grid, resize handles, responsive preview
- [ ] **Live preview fix** -- Real-time updates, mobile/desktop toggle, accurate theme rendering
- [ ] **Featured gallery preview block** -- Auto-pull gallery covers, lightbox, link to full gallery
- [ ] **Social links update** -- Add Threads, Bluesky icons; ensure all 11+ platforms render correctly
- [ ] **Per-link click tracking** -- Track clicks on each custom link for analytics
- [ ] **Dark mode for public pages** -- System preference detection + manual toggle

### Add After Validation (v1.x)

Features to add once core modernization is stable.

- [ ] **Booking/CTA block** -- When users request calendar integration
- [ ] **Testimonial block** -- When client review system is more mature
- [ ] **Custom domain support** -- When demand validates the infrastructure investment
- [ ] **Additional embed blocks** (YouTube, Vimeo) -- When video content demand grows
- [ ] **Branded QR code styles** -- Custom colors/logo in QR codes
- [ ] **Print store / pricing block** -- When billing service supports product listings
- [ ] **Email capture block** -- Webhook integration to external providers

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Multi-language profile pages** -- Leverage existing i18n for public pages
- [ ] **A/B testing for profiles** -- Test different layouts/CTAs
- [ ] **AI-generated theme suggestions** -- Based on uploaded portfolio colors
- [ ] **Profile page PWA** -- Allow visitors to "install" a photographer's profile
- [ ] **Team profiles** -- Multiple photographer profiles under one studio brand

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Fix avatar upload | HIGH | LOW | P1 |
| Theme engine consolidation | HIGH | MEDIUM | P1 |
| Mobile-first public page redesign | HIGH | MEDIUM | P1 |
| Live preview fix | HIGH | MEDIUM | P1 |
| Bento grid editor polish | HIGH | MEDIUM | P1 |
| Animated themes (3-4) | MEDIUM | LOW | P1 |
| Featured gallery preview block | HIGH | LOW | P1 |
| Per-link click tracking | MEDIUM | LOW | P1 |
| Dark mode public pages | MEDIUM | LOW | P1 |
| Social links update (Threads, Bluesky) | LOW | LOW | P1 |
| Booking/CTA block | MEDIUM | MEDIUM | P2 |
| Testimonial block | MEDIUM | LOW | P2 |
| Video embed blocks (YouTube) | LOW | LOW | P2 |
| Branded QR codes | LOW | LOW | P2 |
| Custom domain support | MEDIUM | HIGH | P3 |
| Print store / pricing block | MEDIUM | MEDIUM | P3 |
| Email capture block | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.1 launch -- makes profiles feel modern
- P2: Should have, add in v1.x when core is stable
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Linktree | Beacons | Carrd | Later Linkin.bio | Stan Store | Pixieset | RawDrive Plan |
|---------|----------|---------|-------|-----------------|------------|----------|---------------|
| Theme templates | 30+ themes, 4 animated (Pro) | Customizable templates, drag-drop | 250+ full-page templates | Limited styling | Basic themes | Photography-focused | 8-12 themes with 3-4 animated |
| Grid/block layout | Vertical list only | Sections with blocks | Freeform page builder | Instagram grid mirror | Vertical list | Vertical list | Bento grid (unique advantage) |
| Editor UX | Simple add/reorder | Drag-drop block editor | Full page builder | Post-link mapper | Simple storefront | Basic link editor | Bento grid drag-drop with live preview |
| Avatar/branding | Photo + bio, Pro removes branding | Photo + bio + custom fonts | Full design control | Profile photo | Photo + bio | Photo + bio | Photo + bio + brand colors + company logo |
| Social links | Icons bar | Icons bar | Manual links | Auto from social | Icons bar | Icons + auto-connect | 11+ platform icons (expand to 15+) |
| Analytics | Views, clicks, CTR, referrers (Pro: lifetime) | Views, clicks, revenue | None built-in | Instagram insights integration | Revenue + clicks | Basic views | Views, clicks, referrers, geography, device |
| Commerce | Tip jar, commerce links | Full digital store, courses | Stripe/PayPal embed | Shoppable posts | Full store, bookings, courses | Print store | Gallery preview (native), external booking links |
| AI features | None | "Beam" AI assistant | None | Caption writer | None | None | Gemini bio/SEO generation (differentiator) |
| Custom domain | Pro plan ($24/mo) | Pro plan ($10/mo) | Pro plan ($19/yr) | No | No | Included in paid plans | Defer to v1.x |
| Dual profile (personal + brand) | No | No | No | No | No | No | Yes (unique to RawDrive) |
| Photography-specific | Generic | Generic | Generic | Social-media focused | Creator-commerce focused | Photography-native | Photography-native with galleries |
| Pricing | Free / $5-$24/mo | Free / $10-$90/mo | Free / $9-$49/yr | $25-$80/mo (with social tools) | $29-$99/mo | Free / $15-$35/mo | Included in RawDrive subscription |

## Key Takeaways for RawDrive

1. **The Bento grid layout is RawDrive's biggest visual differentiator.** No competitor except the now-defunct Bento.me offers a true grid layout. Linktree, Stan Store, and Later are all vertical lists. Polish the grid editor and make it the hero feature.

2. **Photography-native integration is the moat.** Generic tools cannot embed live gallery previews, pull client testimonials, or show portfolio work inline. RawDrive can. This is the "why use RawDrive's profile instead of Linktree" answer.

3. **Animated themes are the minimum bar for "premium feel."** Linktree's animated themes (Confetti, Starry Night) set user expectations. RawDrive needs 3-4 animated themes to feel competitive. CSS animations and Framer Motion keep these performant.

4. **The editor must feel instant.** Linktree's editor is praised for simplicity (add link, drag to reorder, done). Beacons' editor is praised for power (drag-drop blocks, sections, customization). RawDrive should aim for Beacons-level power with Linktree-level simplicity. Live preview is the key -- fix it first.

5. **Do not build commerce.** Stan Store and Beacons are pivoting toward creator commerce (stores, courses, subscriptions). This is a trap for a photography platform. Link to external commerce; focus on presentation and discovery.

6. **Performance is a feature.** Bio links are impulse clicks from social media feeds. If the page takes >2s to load, users bounce. Public pages should be lightweight -- consider SSR or static rendering, lazy-load embeds, optimize images aggressively.

## Sources

- [Linktree customization features](https://linktr.ee/blog/linktree-customization-features)
- [Linktree themes help center](https://help.linktr.ee/en/articles/5434137-choose-a-theme-for-your-linktree)
- [Linktree pricing](https://linktr.ee/s/pricing)
- [Bento Grid Design Trend 2026](https://desinance.com/design/bento-grid-web-design/)
- [Bento.me alternatives (post-discontinuation)](https://taplink.at/en/blog/bento-me-alternative.html)
- [Linktree alternatives 2026 - Adam Connell](https://adamconnell.me/linktree-alternatives/)
- [Linktree alternatives 2026 - Rebrandly](https://www.rebrandly.com/blog/linktree-alternatives)
- [Carrd review 2026](https://www.sitebuilderreport.com/carrd-review)
- [Carrd pricing analysis](https://landingi.com/carrd/pricing/)
- [Later Linkin.bio features](https://later.com/link-in-bio/)
- [Later review 2026](https://socialrails.com/blog/later-review)
- [Stan Store review 2026](https://whop.com/blog/what-is-stan-store/)
- [Stan Store - Sacra analysis ($14.7M/yr)](https://sacra.com/research/stan-store-in-bio/)
- [Beacons vs Linktree 2026](https://stackinfluence.com/blog/beacons-vs-linktree-2026-link-bio-tool-is-best)
- [Beacons features and pricing](https://home.beacons.ai/plans)
- [Beacons review 2026](https://heyorai.com/tool/beacons-ai/)
- [Pixieset Bio Links for photographers](https://blog.pixieset.com/blog/bio-links/)
- [Photography link in bio examples - Pixieset](https://blog.pixieset.com/blog/link-in-bio-photographers/)
- [Link in bio best practices 2025](https://blog.solo.to/post/link-in-bio-best-tools-and-practices-for-2025)
- [Bio link best practices - Vonza](https://vonza.com/blog/link-in-bio-best-practices/)
- [Best link in bio tools - Blogging Wizard](https://bloggingwizard.com/instagram-bio-link-tools/)
- [Beacons vs Linktree comparison - Jotform](https://www.jotform.com/blog/beacons-vs-linktree/)

---
*Feature research for: Profile & Public Page Modernization*
*Researched: 2026-03-19*
