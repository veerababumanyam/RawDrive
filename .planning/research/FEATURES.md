# Feature Landscape

**Domain:** Professional Photography SaaS Platform (Gallery Delivery, AI Curation, Client Management)
**Researched:** 2026-03-18
**Competitors analyzed:** Pic-Time, Pixieset, ShootProof, CloudSpot, AfterShoot, Imagen AI

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Email verification on signup** | Every SaaS requires it. Without it, fake accounts flood the system and users can't recover access | Low | RawDrive has 6+ TODO placeholders. Blocking user journey. |
| **Password reset via email** | Users forget passwords constantly. No reset = locked out = churned | Low | Standard token-based flow. Must work before launch. |
| **Gallery delivery email** | Photographers need to notify clients when galleries are ready. Pic-Time, ShootProof, Pixieset all send branded delivery emails | Medium | Must include: gallery link, photographer branding, expiration date |
| **Download controls** | Photographers must control what clients download: resolution tiers (web/social/full), single vs batch, per-gallery policies | Medium | RawDrive has `download_policy` enum already (`view_only|web_only|watermarked_only|original_allowed`). Needs enforcement. |
| **Watermarked previews** | All competitors apply watermarks to gallery previews to prevent screenshot theft. CloudSpot and ShootProof both emphasize this | Medium | Generate watermarked variants on upload. Serve watermarked unless download policy allows originals. |
| **Gallery slideshow** | Built-in slideshow viewing is standard across Pic-Time, ShootProof, CloudSpot. Clients expect immersive viewing | Medium | Frontend-only feature: auto-advance, keyboard nav, fullscreen. No server-side video rendering needed. |
| **Duplicate detection** | AfterShoot and Imagen both auto-detect duplicates as baseline. Photographers upload burst sequences constantly | Medium | Hash-based (perceptual hash) for exact/near dupes. RawDrive has this scaffolded but image byte fetching is broken. |
| **Basic rate limiting** | API security table stakes. Without it, a single client can DDoS the platform | Low | Redis sliding window on upload/download endpoints. RawDrive has this designed but unenforced. |
| **Timing-safe API key comparison** | Basic security hygiene. Timing attacks on string comparison are well-documented | Low | Single-line fix: `hmac.compare_digest()`. No excuse for shipping without this. |
| **Workspace-scoped permission checks** | Multi-tenant isolation is the #1 security requirement. Missing checks = data leaks between workspaces | Low | RawDrive has gaps in comments endpoint. Must audit all endpoints. |
| **Real-time upload progress** | Photographers upload thousands of images. They need progress feedback, not a spinning wheel | Medium | WebSocket or SSE. RawDrive has notification service scaffolded. |
| **Gallery expiration** | All competitors support gallery expiration dates. Photographers use this to drive urgency for print sales | Low | Add expiration timestamp + cron job to disable access. Simple but critical for business model. |

## Differentiators

Features that set product apart. Not expected by default, but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI similarity grouping** | Group burst sequences automatically so photographers review one pick per group instead of 50 similar shots. AfterShoot's core value prop | High | Requires working CLIP embeddings + cosine similarity clustering. RawDrive has the architecture but CLIP returns placeholder data. |
| **AI quality scoring** | Score images on sharpness, exposure, eye-open detection, composition. AfterShoot analyzes these criteria automatically | High | Needs multiple ML models or a multi-head approach. Start with sharpness (Laplacian variance) and exposure histogram analysis. |
| **Marketing email automation** | Pic-Time's killer feature: abandoned cart reminders, gallery expiration warnings, seasonal sale campaigns. Drives 30-40% of print revenue | High | Requires event tracking, campaign builder, template system. Defer most of this to v2, but gallery expiration reminders are table stakes. |
| **Contact sheet PDF export** | Allow photographers to generate a PDF contact sheet of a gallery for offline review or printing | Medium | Use a PDF library (WeasyPrint or ReportLab in Python). Grid layout with thumbnails + filenames. |
| **Branded gallery experience** | Custom domains, logo placement, color themes. Pic-Time and Pixieset both emphasize brand customization | Medium | RawDrive has Gallery Design Studio already. Ensure it actually works end-to-end. |
| **Bulk invitation email delivery** | Send wedding invitation emails to guest lists. RawDrive has invitation CRUD but no actual email sending | Medium | Template rendering + batch sending via Postal. Must handle bounces and track delivery. |
| **Churn intervention notifications** | Detect at-risk users (low login frequency, unused storage) and send retention emails | Medium | Requires usage tracking + trigger rules. Scaffolded in RawDrive but not wired. |
| **Face detection and grouping** | Group photos by detected faces so clients can find all photos of themselves | High | RawDrive has face detection worker infrastructure. Needs CLIP or dedicated face model (ArcFace) for embeddings. |
| **Tiered rate limiting by plan** | Different API limits for free vs pro vs enterprise. Standard SaaS monetization lever | Low | Extend rate limiter to read plan tier from JWT claims. |
| **Multi-channel notifications** | Push notifications, in-app toasts, email digests. Not just WebSocket | Medium | Notification service exists. Wire WebSocket for in-app, email for digests. |

## Anti-Features

Features to explicitly NOT build. Either out of scope, negative ROI, or actively harmful.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Server-side slideshow video rendering** | Enormous compute cost, storage bloat, FFmpeg complexity for minimal value over client-side slideshow | Build client-side slideshow with JS transitions. Zero server cost. |
| **Full email marketing platform** | Pic-Time spent years building this. Building a Mailchimp competitor is a distraction | Implement gallery expiration reminders and delivery notifications only. Integrate with external ESP for marketing later. |
| **AI auto-editing (color correction, retouching)** | AfterShoot/Imagen's core product. Massive ML engineering effort. Photographers are particular about their editing style | Focus on culling/grouping (selection), not editing (modification). Let photographers use Lightroom for edits. |
| **Real-time collaborative editing** | Explicitly out of scope per PROJECT.md. Not a photography use case | Single-photographer workflow is the target. |
| **Video upload/processing** | Storage and bandwidth costs are 10-100x photos. Defer to v2+ per PROJECT.md | Keep upload service photo-only for now. |
| **OAuth/social login** | Out of scope per PROJECT.md. Email/password sufficient for v1 | Standard JWT auth is working. Add OAuth in v2. |
| **Custom print lab integration** | Complex fulfillment logistics, lab API integrations, shipping. Huge scope | Support download-only delivery. Photographers use their own print labs. |
| **Mobile native app** | PWA covers mobile adequately for v1. Native app is 2x development effort | Optimize PWA experience. RawDrive already has PWA support. |

## Feature Dependencies

```
Email Infrastructure (Postal)
  --> Email Verification
  --> Password Reset
  --> Gallery Delivery Emails
  --> Bulk Invitation Emails
  --> Gallery Expiration Reminders

CLIP Model Loading
  --> Batch Embedding Computation
  --> Similarity Clustering / Grouping
  --> Face Detection Grouping (partial)

Similarity Clustering
  --> Duplicate Detection (enhanced, beyond hash)

WebSocket Notifications Service
  --> Real-time Upload Progress
  --> Churn Intervention Notifications
  --> Multi-channel Notifications

Rate Limiting (Redis)
  --> Tiered Rate Limiting by Plan

Download Policy Enforcement
  --> Watermarked Previews (watermark generation on upload)
```

## MVP Recommendation

### Phase 1: Unblock Core Journeys (Email + Security)
Prioritize these because nothing else matters if users cannot sign up, reset passwords, or if data leaks between workspaces:

1. **Email infrastructure** (Postal deployment) -- unlocks 5+ downstream features
2. **Email verification + password reset** -- unblocks user onboarding
3. **Security fixes** (timing-safe compare, permission checks, row-level locking) -- production blockers
4. **Rate limiting enforcement** -- security table stakes

### Phase 2: Gallery Delivery Experience
These are the features photographers evaluate platforms on:

5. **Gallery delivery emails** -- the core "deliver photos to client" workflow
6. **Download policy enforcement** -- protect photographer's work
7. **Gallery slideshow** (client-side) -- immersive viewing experience
8. **Gallery expiration** -- drives print sales urgency
9. **Bulk invitation email delivery** -- complete the invitation feature

### Phase 3: AI Features
These differentiate but are complex. Ship after core is stable:

10. **CLIP model loading** (actual ViT-B/32) -- foundation for all AI
11. **Duplicate detection** (fix image byte fetching + perceptual hashing) -- immediate photographer value
12. **Similarity grouping** (cosine similarity clustering) -- the "wow" feature
13. **AI quality scoring** (sharpness + exposure) -- start simple, iterate

### Phase 4: Polish and Notifications
14. **WebSocket real-time notifications** -- upload progress, gallery activity
15. **Contact sheet PDF export** -- nice-to-have, not critical path
16. **Churn intervention notifications** -- retention, wire after notification infra works

**Defer to v2:** Marketing email automation, AI auto-editing, face grouping (beyond basic detection), video support, OAuth, print lab integration.

## Complexity Budget

| Complexity | Count | Examples |
|------------|-------|---------|
| Low | 5 | Email verification, password reset, timing-safe compare, permission checks, rate limiting |
| Medium | 8 | Gallery delivery email, download enforcement, slideshow, bulk invitations, PDF export, notifications, gallery expiration, watermarks |
| High | 3 | CLIP embeddings, similarity clustering, AI quality scoring |

**Total estimated effort:** The Low items are days each. Medium items are 1-2 weeks each. High items are 2-4 weeks each. Phasing correctly (email infra first, AI last) prevents blocking.

## Sources

- [Pic-Time features and marketing automation](https://blog.pic-time.com/blog/marketing-automation) -- HIGH confidence (official)
- [ShootProof vs Pixieset comparison](https://www.shootproof.com/shootproof-vs-pixieset/) -- HIGH confidence (official)
- [CloudSpot gallery download settings](https://help.cloudspot.io/en/articles/114565-gallery-download-settings) -- HIGH confidence (official docs)
- [CloudSpot watermarking](https://www.cloudspot.io/posts/watermarking-an-underutilized-photography-gallery-feature) -- HIGH confidence (official blog)
- [ShootProof watermark setup](https://help.shootproof.com/hc/en-us/articles/115010233548-How-do-I-add-change-or-remove-watermarks-in-my-galleries) -- HIGH confidence (official docs)
- [Best AI photo culling software 2026](https://pixelixe.com/blog/best-ai-photo-culling-software-for-professional-photographers/) -- MEDIUM confidence (third-party review)
- [AfterShoot culling guide](https://support.aftershoot.com/en/articles/5223473-get-started-with-aftershoot-culling) -- HIGH confidence (official)
- [Imagen AI culling overview](https://imagen-ai.com/valuable-tips/best-ai-culling/) -- HIGH confidence (official)
- [API rate limiting best practices 2025](https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025) -- MEDIUM confidence (industry guide)
- [Pixieset best photo gallery 2026](https://blog.pixieset.com/blog/best-photo-gallery/) -- HIGH confidence (official blog)
