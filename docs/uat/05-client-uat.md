# Client / Family — User Acceptance Testing

**Persona:** Client — invited by a photographer to consume galleries, favorite, proof, comment, download
**Requirements source:** `docs/TechnicalRequirements/Client-Requirements.md` (FR-CLI-*, BR-CLI-*, AC-CLI-*)
**Supporting specs:** `Client_Galleries_PWA.md`, `Security_Compliance_Privacy.md` (§5 FaceID consent), `AI_Intelligence_Search.md`
**Primary handles:** `@client_wedding` (registered invited client), `@client_unreg` (link-only, never registered)
**Build under test:** v0.0.40 (M17 Hardening Wave 5)
**Owner:** Customer Success Lead
**Read first:** [`README.md`](README.md)

---

## 1. What makes the Client UAT unique

The Client is the **end user** — the person whose experience defines RawDrive's reputation in the market. Three framing constraints:

1. **Mobile-first.** Most tests are executed on a real phone or an accurately-sized browser emulation (375×812, 390×844, 414×896, 1024×1366). Desktop is secondary.
2. **Photographer's brand, not ours.** Once a client is inside a photographer's gallery, there must be **zero RawDrive branding visible** — logo, colors, fonts, footer, PWA icon all belong to the photographer.
3. **Performance is acceptance.** An LCP above 1.2 s on a 4G profile is not "good enough" — it's a failing scenario. Performance targets are enforced, not aspired to.

---

## 2. Pre-flight

Standard environment plus:
- Wedding Gallery populated by Photographer UAT F04 (17 photos uploaded from `tests/photos/`).
- Photographer `@pho_pro` has configured branding (logo, accent) on the workspace.
- Share link generated with password `UAT-Wedding-2026`.
- One photo (`21.jpg`) marked as sensitive with PIN `2468`.
- FaceID enabled on the Faces Gallery.
- Downloads enabled on Wedding Gallery; disabled on a separate "Preview Only" gallery.

---

## Table of modules

| Module | Area | Scenarios |
|---|---|---|
| [A](#module-a--entry-experiences) | Entry experiences (direct link, password, PIN, FaceID, public slug) | A01–A10 |
| [B](#module-b--pwa--offline) | PWA install, offline shell, push | B01–B08 |
| [C](#module-c--gallery-grid--lightbox) | Gallery grid + lightbox + mobile gestures | C01–C10 |
| [D](#module-d--favorites--comments) | Favorites & comments | D01–D07 |
| [E](#module-e--proofing--selections) | Proofing & selections | E01–E08 |
| [F](#module-f--sensitive-photos--vault) | Sensitive photos (Vault / PIN) | F01–F05 |
| [G](#module-g--downloads-single--bulk-zip) | Downloads single + bulk ZIP + format | G01–G08 |
| [H](#module-h--faceid-flow-with-consent) | FaceID flow with biometric consent | H01–H07 |
| [I](#module-i--public-profile--inquiry--booking) | Public profile, inquiry, booking | I01–I08 |
| [J](#module-j--live-stream-viewer) | Live stream viewer | J01–J05 |
| [K](#module-k--communication-with-photographer) | Communication with photographer | K01–K05 |
| [L](#module-l--performance-core-web-vitals) | Performance (Core Web Vitals) | L01–L06 |
| [M](#module-m--accessibility) | Accessibility | M01–M08 |
| [N](#module-n--privacy--branding-boundary) | Privacy & branding boundary | N01–N07 |
| [O](#module-o--restricted-actions-negative) | Restricted actions (negative) | O01–O13 |
| [P](#module-p--cross-persona-flows) | Cross-persona flows | P01–P04 |

---

## Module A — Entry experiences

| ID | P | Title | Ref |
|---|---|---|---|
| A01 | P0 | Gallery link loads gallery immediately without forced registration | FR-CLI-ENT-001 |
| A02 | P1 | Optional registration prompt appears after ~30 s or first interaction | FR-CLI-ENT-002 |
| A03 | P0 | Password-protected gallery: wrong password → shake + error; gallery NOT revealed | AC-CLI-002 |
| A04 | P0 | Password screen shows photographer's logo + gallery title | FR-CLI-ENT-003 |
| A05 | P0 | Password screen does NOT reveal whether gallery exists for unknown slugs | FR-CLI-ENT-005 |
| A06 | P0 | Expired gallery shows expiry message + photographer contact | AC-CLI-003 |
| A07 | P0 | Revoked share link returns 404/410 with helpful message |
| A08 | P1 | PIN-locked photo shows blurred placeholder + lock icon in grid |
| A09 | P1 | FaceID icon shown only when photographer enabled it for the gallery | AC-CLI-008 |
| A10 | P1 | Public gallery slug (no auth) loads within photographer's branding |

### A03 — Wrong password security
- **Steps:** enter `wrong-password` on the password screen. Observe.
- **Expected:** input shakes, error "incorrect password", count of attempts tracked. Page source + network panel contain **no** gallery data — the photos list is only fetched after a successful password. Three consecutive wrong attempts trigger a short backoff per rate-limit policy.

---

## Module B — PWA, offline, push

| ID | P | Title | Ref |
|---|---|---|---|
| B01 | P0 | Install prompt appears on repeated visits (within 5 s on the second open) | AC-CLI-016 |
| B02 | P0 | PWA manifest is gallery-specific with photographer's branding | FR-CLI-ENT-012 |
| B03 | P0 | Installed PWA reopens directly to the gallery, not a generic landing page | AC-CLI-017 |
| B04 | P0 | Offline shell shows photographer logo + "You're offline — connect to view photos" | AC-CLI-018, FR-CLI-ENT-014 |
| B05 | P1 | Service worker pre-caches landing thumbnails for offline |
| B06 | P1 | Metadata and favorites cached in IndexedDB |
| B07 | P1 | Push notification: "new photos added" — received on subscribed device |
| B08 | P1 | Push permission prompt uses native OS dialog, not a custom modal |

### B03 — Installed PWA reopens to gallery (branding smoke)
- **Steps:** install the Wedding Gallery PWA on an Android / desktop Chrome profile. Close browser. Open from home screen / app drawer.
- **Expected:** PWA launches straight into the Wedding Gallery slug, showing photographer's logo and accent color. No RawDrive logo, no `app.rawdrive.in` chrome visible.

---

## Module C — Gallery grid & lightbox

| ID | P | Title |
|---|---|---|
| C01 | P0 | Masonry grid renders with correct column count at 375px / 768px / 1024px / 1440px |
| C02 | P0 | LQIP placeholders appear within 500 ms, blur-up to sharp image |
| C03 | P0 | Infinite scroll loads next batch **before** user reaches bottom | AC-CLI-021 |
| C04 | P0 | Lightbox opens on tap; swipe left/right navigates; ESC/back closes |
| C05 | P0 | Lightbox swipe to next photo completes in ≤ 200 ms | AC-CLI-020 |
| C06 | P1 | Pinch-zoom works on mobile; zoom buttons available as alternative | AC-CLI-029 |
| C07 | P1 | Keyboard navigation on desktop: arrow keys move, ESC closes, Tab cycles UI |
| C08 | P1 | Photo counter visible in lightbox (e.g., "5 / 17") |
| C09 | P1 | All rendered images are **WebP** derivatives (check `Content-Type: image/webp`) |
| C10 | P0 | Focus is trapped inside lightbox while open, returns to trigger on close |

---

## Module D — Favorites & comments

| ID | P | Title |
|---|---|---|
| D01 | P0 | Tap heart icon → instant visual feedback + count update | AC-CLI-009 |
| D02 | P0 | Favorites view lists all favorited photos in grid |
| D03 | P1 | Share favorites selection (link, WhatsApp) |
| D04 | P1 | Comment on photo from lightbox; comment appears in thread |
| D05 | P1 | Threaded reply supported |
| D06 | P0 | If photographer disabled favorites, heart button not rendered |
| D07 | P0 | If photographer disabled comments, comment input not rendered |

---

## Module E — Proofing & selections

| ID | P | Title |
|---|---|---|
| E01 | P0 | Proofing tabs show photographer-defined categories (e.g., Must Print / Maybe / Album) |
| E02 | P0 | Tap a photo → assign to a category; counter per tab updates |
| E03 | P1 | Drag between categories on desktop |
| E04 | P0 | Submit selections → photographer receives selections within 2 s | AC-CLI-011 |
| E05 | P0 | After photographer closes proofing, selection UI becomes read-only | BR-CLI-PRF-001 |
| E06 | P1 | Selection count per category visible in proofing toolbar |
| E07 | P1 | Submission confirmation modal before final submit |
| E08 | P1 | Empty state: "no selections made — start by categorizing photos" |

### E04 — Proofing submit round trip [cross-persona]
See Photographer UAT T01 / K03. Client tester on one device, Photographer on another.

---

## Module F — Sensitive photos (Vault / PIN)

| ID | P | Title | Ref |
|---|---|---|---|
| F01 | P0 | Locked photo shows blurred placeholder + lock icon in grid | FR-CLI-GAL-006, AC-CLI-012 |
| F02 | P0 | Tap locked placeholder → PIN entry with numeric keypad |
| F03 | P0 | Correct PIN reveals the photo; incorrect PIN shakes and stays locked | AC-CLI-013 |
| F04 | P0 | Wrong PIN never reveals the real photo in DOM or network response |
| F05 | P1 | "Forgot PIN? Contact your photographer" link visible |

### F04 — Sensitive photo leak check
- **Steps:** open Locked Gallery containing `21.jpg`. DevTools → Network. Attempt to inspect the network response for any asset endpoint before entering PIN.
- **Expected:** the unlocked / full-size URL is never in any request or response until PIN is verified. Thumbnail is the blurred derivative only.

---

## Module G — Downloads (single & bulk ZIP)

| ID | P | Title | Ref |
|---|---|---|---|
| G01 | P0 | Download single photo starts within 1 s | AC-CLI-014 |
| G02 | P0 | Download format picker offers: original, web-optimized (WebP), thumbnail | AGENTS.md §Derivatives |
| G03 | P0 | Bulk selection → download → ZIP generation shows animated progress, completes | AC-CLI-015 |
| G04 | P0 | ZIP filename uses gallery slug + date; preserves original filenames inside |
| G05 | P0 | Gallery with downloads disabled shows **no** download button (DOM absent) | AC-CLI-004 |
| G06 | P1 | Watermarked variant served when photographer configured watermark |
| G07 | P1 | Download of `vCard.jpeg` and `Image.jpeg` preserves exact filename case |
| G08 | P1 | Downloaded file integrity: hash matches the original in `tests/photos/` |

---

## Module H — FaceID flow with consent

| ID | P | Title | Ref |
|---|---|---|---|
| H01 | P0 | FaceID entry requires explicit "I consent to biometric scanning" before camera opens | FR-CLI-ENT-006, Security §5.1 |
| H02 | P0 | Consent text explains "your selfie is used to find your photos and is not stored" |
| H03 | P0 | Selfie capture or upload → matching photos shown within 5 s | AC-CLI-006 |
| H04 | P0 | No match → graceful "Browse all photos instead" fallback | AC-CLI-007 |
| H05 | P0 | Face matching scoped to current gallery only — no cross-gallery | BR-CLI-FACE-002 |
| H06 | P0 | Selfie is deleted after matching completes | BR-CLI-FACE-004 |
| H07 | P0 | FaceID icon hidden when photographer disabled FaceID for the gallery | AC-CLI-008 |

### H06 — Selfie deletion (privacy)
- **Steps:** complete H03. Then query backend: `SELECT count(*) FROM face_selfie_cache WHERE session_id=<id>`.
- **Expected:** row count = 0 within the session-end TTL. Object storage key for the selfie is also purged. `face_embeddings` may retain the scoped embedding only if photographer's consent profile permits it.

---

## Module I — Public profile, inquiry, booking

| ID | P | Title |
|---|---|---|
| I01 | P0 | `/u/{slug}` renders bio, services, featured galleries, CTAs |
| I02 | P1 | WhatsApp CTA opens pre-filled message |
| I03 | P1 | vCard download contains correct photographer details |
| I04 | P1 | QR code scannable to profile |
| I05 | P0 | Submit inquiry form → photographer receives lead in CRM |
| I06 | P1 | Scheduler shows available slots, greys out Google "Busy" times |
| I07 | P1 | Timezone switcher (client local vs photographer local) |
| I08 | P1 | Booking confirmation with payment (if required) — Razorpay + PhonePe both selectable |

---

## Module J — Live stream viewer

| ID | P | Title |
|---|---|---|
| J01 | P0 | Stream player starts video within 2 s | AC-CLI-025 |
| J02 | P1 | Adaptive bitrate playback (Cloudflare Stream HLS/DASH) |
| J03 | P1 | Chat overlay works: send/receive messages | AC-CLI-026 |
| J04 | P1 | Viewer count visible |
| J05 | P1 | Stream health resilience: simulated reconnect recovers automatically |

---

## Module K — Communication with photographer

| ID | P | Title |
|---|---|---|
| K01 | P1 | Message thread visible under `/messages` if registered |
| K02 | P1 | Attachment send/receive |
| K03 | P1 | Unread badge updates in real time |
| K04 | P1 | Unread count clears on thread open |
| K05 | P1 | Photographer closure of a thread reflects client-side |

---

## Module L — Performance (Core Web Vitals)

Target profile: **Moto G4 @ 4G** in Chrome DevTools, Lighthouse "Slow 4G" network.

| ID | P | Metric | Target | Ref |
|---|---|---|---|---|
| L01 | P0 | Largest Contentful Paint (LCP) | < 1.2 s | PWA doc §2.2 |
| L02 | P0 | First Input Delay / INP | < 100 ms | PWA doc §2.2 |
| L03 | P0 | Cumulative Layout Shift (CLS) | 0 (masonry placeholders stable) | PWA doc §2.2 |
| L04 | P0 | Gallery first meaningful render | < 3 s on mobile broadband | §9 Performance |
| L05 | P1 | Lightbox transition | < 200 ms |
| L06 | P1 | Infinite scroll next batch pre-loads before bottom |

Run Lighthouse audit on the Wedding Gallery share URL; record full JSON per cycle in `docs/uat/results/<cycle>/perf/`.

---

## Module M — Accessibility

| ID | P | Title | Ref |
|---|---|---|---|
| M01 | P0 | All touch targets ≥ 44 × 44 px | §10 |
| M02 | P0 | Screen reader navigates gallery with meaningful labels | AC-CLI-027 |
| M03 | P0 | Keyboard-only navigation on desktop (grid, lightbox, favorites, selections) | AC-CLI-028 |
| M04 | P1 | High contrast mode supported |
| M05 | P1 | Color not the only cue for status (e.g., favorite uses icon fill, not only red) |
| M06 | P1 | Swipe gestures always have button alternatives |
| M07 | P1 | Alt text populated from AI tags when available |
| M08 | P1 | Focus management: lightbox traps focus, returns to trigger on close |

---

## Module N — Privacy & branding boundary

| ID | P | Title | Ref |
|---|---|---|---|
| N01 | P0 | No RawDrive logo, name, or footer anywhere in client gallery experience | AC-CLI-030, BR-CLI-PRV-001 |
| N02 | P0 | Photographer logo appears on gallery, password screen, and PWA icon | AC-CLI-031 |
| N03 | P0 | Client cannot access photographer's workspace, CRM, billing, analytics |
| N04 | P0 | Public gallery SEO metadata present for search engines | BR-CLI-PRV-003 |
| N05 | P1 | Custom domain (if photographer configured) serves gallery without RawDrive hostname |
| N06 | P1 | DSAR: client can request data export of their own activity (favorites, comments, selections) |
| N07 | P1 | DSAR: client can request deletion of their account |

---

## Module O — Restricted actions (negative)

All **P0**. Each row is a `RD-CLI-*` from `Client-Requirements.md` §11.

| ID | RD | Denied | Enforcement |
|---|---|---|---|
| O01 | RD-CLI-001 | Access photographer workspace | No workspace routes |
| O02 | RD-CLI-002 | Access admin/dealer portals | No admin routes |
| O03 | RD-CLI-003 | See other clients' data | Data isolation per gallery access |
| O04 | RD-CLI-004 | Modify gallery settings | No settings UI |
| O05 | RD-CLI-005 | Delete photos | No delete control |
| O06 | RD-CLI-006 | Upload photos (except FaceID selfie) | No upload zone |
| O07 | RD-CLI-007 | Change photographer's branding | No UI |
| O08 | RD-CLI-008 | Access billing / subscription | No screens |
| O09 | RD-CLI-009 | View platform analytics | No screens |
| O10 | RD-CLI-010 | Access CRM data | No screens |
| O11 | RD-CLI-011 | Download if photographer disabled | No download control rendered |
| O12 | RD-CLI-012 | Comment if photographer disabled | No input rendered |
| O13 | RD-CLI-013 | Favorite if photographer disabled | No button rendered |

---

## Module P — Cross-persona flows

### P01 — [cross-persona] Client proofing round trip
See Photographer UAT T01.

### P02 — [cross-persona] Client places print order
- Participants: Client + Photographer testers.
- **Steps:** Client in Wedding Gallery → selects prints (if store is enabled) → checkout → chooses Razorpay or PhonePe → pays on sandbox → receives order confirmation. Photographer sees fulfilment task in CRM / orders inbox.
- **Expected:** order record has both gateway provider badge and server-verified payment status. Razorpay signature verified server-side per Razorpay doc §FR-4. Invoice generated with GST split per Contracts/Billing doc §3.1.

### P03 — [cross-persona] Client inquiry via public profile → photographer CRM
See Photographer UAT I09 and Guest UAT (G02).

### P04 — [cross-persona] Client raises privacy ticket → Admin responds
- Client files a "Privacy Support" ticket via /profile/notifications → Admin picks it up from the support queue (Admin UAT D08). Resolution notifies client.

---

## Regression gate

Run every cycle on mobile viewport + slow 4G profile:
- A03, A04, A05, A06, A07 (entry security)
- B03 (PWA reopen to gallery)
- C05, C09 (lightbox perf + WebP derivatives)
- E04 (proofing round trip)
- F03, F04 (sensitive photo PIN + leak check)
- G01, G03, G05 (download policy)
- H01, H06 (FaceID consent + selfie deletion)
- L01, L02, L03 (Core Web Vitals)
- M01, M02, M03 (a11y fundamentals)
- N01 (branding boundary)
- All of Module O (13 restricted)

---

## Result log

| Scenario ID | Tester | Device | Build hash | Date | Result | Defect ID | Evidence |
|---|---|---|---|---|---|---|---|
| A01 |  |  |  |  |  |  |  |
| … |  |  |  |  |  |  |  |
| P04 |  |  |  |  |  |  |  |

Note: include **Device** column (e.g. `Pixel 6 / Chrome 123 / 4G`) — mobile variability is a real factor.

---

## Sign-off

| Role | Name | Build hash | Date | Signature |
|---|---|---|---|---|
| Client UAT Lead |  |  |  |  |
| Customer Success Lead |  |  |  |  |
| Design Lead (Mobile) |  |  |  |  |
| Accessibility Reviewer |  |  |  |  |
| QA Lead |  |  |  |  |

---

*End of Client UAT*
