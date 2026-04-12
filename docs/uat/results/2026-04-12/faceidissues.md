# RawDrive — FaceID & Gallery Audit Report
**Role: Business Analyst + UAT Expert + Test Engineer**
**Date: 12 April 2026**

---

## 1. CURRENT STATE — What Is Actually Implemented

### ✅ Admin Side (Photographer Dashboard)

| Feature | Status | Location |
|---|---|---|
| AI Studio with People/Faces tab | ✅ Exists (empty — no API key activated) | `/ai/faces` |
| Semantic Search (natural language) | ✅ Built, waiting on API key | `/ai/search` |
| Duplicate Detection | ✅ Built, not yet run | `/ai/duplicates` |
| Gemini API Key config (model selection) | ✅ Settings wired | `/ai/settings` |
| Proofing Queue | ✅ Working | `/galleries/{id}/proofing` |
| "View as Client" link | ✅ Exists in admin gallery header | Gallery detail page |
| Gallery sharing via public URL | ✅ Live (e.g. `/g/wedding-gallery-uat-ff31645a`) | Public gallery |

### ❌ What Is NOT Implemented / Missing

| Feature | Status | Impact |
|---|---|---|
| **FaceID on public gallery (client-facing)** | ❌ MISSING | Critical — clients cannot self-identify |
| **"Find My Photos" face selfie search** | ❌ MISSING | Key differentiator not available to end user |
| **QR code for gallery sharing** | ❌ MISSING | Major gap for on-ground wedding/event use |
| **Download button per photo** | ❌ Not visible on public gallery | Clients can't self-serve downloads |
| **Select & download all my photos** | ❌ Missing | No bulk download for identified person |
| **FaceID scan trigger from gallery admin** | ❌ No "Scan Gallery" button wired | Admin cannot initiate face scan |
| **Mobile-optimised face selfie flow** | ❌ Not present | Critical for Indian wedding use case |
| **Gallery password protection** | ❌ Not visible | Privacy risk for sensitive albums |
| **Gallery settings page** | ❌ 404 at `/galleries/{id}/settings` | Settings do not exist or are not accessible |
| **AI features linked per-gallery** | ❌ AI Studio is global, not per-gallery | Photographers can't scope FaceID per event |

---

## 2. DETAILED GAP ANALYSIS

### Gap 1 — FaceID is Admin-Only, Completely Invisible to Clients
The AI Studio's "People" tab (`/ai/faces`) shows face clusters for the photographer. However, **there is zero surface on the public gallery** where a client/guest can:
- Upload a selfie to find their photos
- Click a face to filter the gallery
- See any hint that face search is available

**Competitive reference:** Pixieset, Pic-Time, and ShootProof all expose a "Find My Photos" button on the client gallery page that opens a selfie upload modal. This is the core value prop of FaceID for clients.

### Gap 2 — No QR Code for Gallery Sharing
The public gallery URL exists (`/g/wedding-gallery-uat-ff31645a`) but there is **no QR code generator** anywhere — not in the admin gallery view, not in the gallery list, not in the share panel. At Indian weddings, photographers typically display QR codes at the venue so guests scan and access photos on the spot.

**Competitive reference:** Pixieset and Shootproof both generate downloadable QR codes per gallery. Some even allow custom-branded QR prints.

### Gap 3 — No Per-Photo Download on Client Gallery
The public gallery shows photos in a masonry grid (Grid / Map views) but there is **no download button visible** on any photo or at page level. Clients/guests cannot download their own photos without contacting the photographer.

### Gap 4 — AI Studio is Decoupled from Galleries
The AI Studio is a global workspace, not connected per-gallery. Photographers have no way to say "run FaceID on Wedding Gallery UAT" from within the gallery. The marketing page shows a "Scan Gallery" button, but it's not present in the live product.

### Gap 5 — API Key Barrier Blocks All AI Features
All AI features (FaceID, semantic search, duplicate detection) are gated behind the photographer setting up a personal Google Gemini API key. This is a friction point that will cause significant drop-off. Currently shows "People Detected: 0" and "API Key Status: Not Set" on the Overview — a confusing state for any photographer.

### Gap 6 — Mobile Experience for FaceID
There is no camera-capture selfie flow for mobile. Clients at Indian weddings are almost exclusively on mobile (Android). A face search feature that requires uploading a file rather than using the phone camera is a UX failure on mobile.

---

## 3. UAT TEST CASES

### Test Suite A: FaceID — Admin Side

| TC# | Test Case | Expected | Actual | Status |
|---|---|---|---|---|
| A1 | Navigate to AI Studio → People | Shows face clusters for uploaded gallery photos | "No people detected" | ⚠️ Blocked (no API key) |
| A2 | Add Gemini API key and scan a gallery | Faces grouped and named | Not testable without API key | ⚠️ Blocked |
| A3 | Merge two face clusters | Should merge into one person | Feature visible in marketing, not in product | ❌ FAIL |
| A4 | Auto-name detected person | Should suggest name from context | Not present | ❌ FAIL |
| A5 | "Scan Gallery" button in gallery admin | Should trigger AI face scan for that gallery | Button not present | ❌ FAIL |

### Test Suite B: FaceID — Client/Public Gallery

| TC# | Test Case | Expected | Actual | Status |
|---|---|---|---|---|
| B1 | Open public gallery on desktop | "Find My Photos" / face search button visible | Not present | ❌ FAIL |
| B2 | Open public gallery on mobile | Camera selfie button visible | Not present | ❌ FAIL |
| B3 | Upload selfie on gallery | Gallery filters to photos containing that face | Feature not implemented | ❌ FAIL |
| B4 | Download photos after face match | Bulk download of matched photos | Not possible | ❌ FAIL |
| B5 | Gallery with FaceID disabled by photographer | No face search shown to client | No toggle exists to enable/disable | ❌ FAIL |

### Test Suite C: QR Code

| TC# | Test Case | Expected | Actual | Status |
|---|---|---|---|---|
| C1 | Gallery list — right-click/options menu on gallery card | QR code option available | No such option | ❌ FAIL |
| C2 | Gallery detail page — "Share" button | QR code and copy link options | No share/QR button | ❌ FAIL |
| C3 | Download QR as PNG | High-res QR downloadable | Not implemented | ❌ FAIL |
| C4 | Scan QR on mobile | Opens gallery correctly | URL works; QR doesn't exist to test | N/A |

### Test Suite D: Download Flow

| TC# | Test Case | Expected | Actual | Status |
|---|---|---|---|---|
| D1 | Single photo download on public gallery | Download button on hover/tap | Not visible | ❌ FAIL |
| D2 | Select multiple + bulk download | Checkboxes + ZIP download | Not visible | ❌ FAIL |
| D3 | Download after FaceID filter | Download only "my" matched photos | Prerequisite missing | ❌ FAIL |
| D4 | Download on mobile | Native share/save sheet | Not implemented | ❌ FAIL |

---

## 4. RECOMMENDED ENHANCEMENTS (Priority Order)

### 🔴 P0 — Critical (Must-Have for FaceID to work)

**1. "Find My Photos" Button on Public Gallery**
Add a floating or header button on the client gallery page. On click: opens a modal with (a) selfie camera capture (mobile) or (b) file upload (desktop). AI matches the selfie against the processed face index and filters the gallery grid in real-time.

**2. Per-Gallery "Run FaceID Scan" in Admin**
Inside each gallery's admin page, add an "AI" panel with a "Scan for Faces" button that runs face detection on all uploaded photos for that specific gallery and links results to that gallery's face index.

**3. QR Code Generator per Gallery**
In the gallery admin header (next to "View as Client"), add a "Share / QR" button that:
- Shows the public URL with a one-click copy
- Renders a downloadable QR code (PNG + SVG)
- Optionally allows branding (logo in center of QR)

**4. Photo Download on Client Gallery**
Add a download icon on each photo card (hover on desktop, long-press on mobile). Add a "Download All" or "Download My Photos" CTA after face match.

### 🟡 P1 — High Priority

**5. Mobile-First Selfie Flow**
On mobile browsers, default to `<input type="file" accept="image/*" capture="user">` to trigger the front camera directly. Avoid file picker friction.

**6. Gallery Password / Access Control**
Add optional PIN/password protection per gallery so only invited guests can view. This is a table-stakes feature competitors all have.

**7. FaceID Enable/Disable Toggle per Gallery**
Not every gallery should have FaceID (corporate shoots, private sessions). Add a per-gallery toggle: "Enable Face Search for clients."

**8. Reduce API Key Friction**
Consider offering a RawDrive-managed AI tier (platform-hosted API key with usage billing) as a simpler onboarding path rather than requiring every photographer to set up their own Gemini key.

### 🟢 P2 — Nice-to-Have / Competitive Parity

**9. Named Face Delivery Links**
Once a person is identified (e.g. "Priya"), auto-generate a unique delivery link (`/g/gallery-id?person=priya-abc123`) that shows only her photos. Send via WhatsApp/SMS directly to the identified person.

**10. WhatsApp Share of Gallery + QR**
For the Indian market specifically, a "Share on WhatsApp" button for the gallery link is more effective than email.

**11. Face Cluster Management (Merge/Split/Name)**
The marketing page shows this UI (Cluster Intelligence, Merge Clusters, Auto-Name). Wire this into the live product in AI Studio.

**12. Event-Day Live Face Hunt**
As photos are uploaded in real-time (live event), auto-process new photos through the face index so guests scanning at the venue find photos appearing as they're taken.

---

## 5. SUMMARY TABLE

| Area | Implemented | Missing | Priority |
|---|---|---|---|
| Admin FaceID (People tab) | Shell exists | Scan, merge, name | P0 |
| Client FaceID on gallery | Nothing | Everything | P0 |
| QR Code sharing | Nothing | Generate + download | P0 |
| Photo download on gallery | Nothing | Single + bulk + by face | P0 |
| Mobile selfie flow | Nothing | Camera capture | P0 |
| Semantic AI search | Shell (admin only) | Wired + working | P1 |
| Gallery password | Nothing | PIN/password gate | P1 |
| Per-gallery AI toggle | Nothing | Enable/disable | P1 |
| WhatsApp share | Nothing | Share button | P2 |
| Named face delivery links | Nothing | Auto-link per person | P2 |

---

**Bottom line:** FaceID exists as a backend concept and is marketed as a key feature, but **the entire client-facing layer is absent**. The public shared gallery has no face search, no download, and no QR code. The admin side has the skeleton (AI Studio tabs) but no working scan pipeline and no per-gallery integration. The biggest quick win is: add a "Find My Photos" selfie button to the public gallery + QR code generator + photo download — these three alone would make the product competitive with Pixieset and Pic-Time for the Indian wedding photography market.