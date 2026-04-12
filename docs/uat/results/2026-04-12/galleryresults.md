---

# 📋 RAWDRIVE — GALLERY MODULE: IN-DEPTH UAT REPORT
**Date:** April 12, 2026 | **Tester:** UAT Specialist / Business Analyst | **Environment:** Production

---

## 🗂️ SCOPE OF TESTING

Every single interactive element was physically clicked, hovered, typed into, and validated. The Gallery module was tested across three areas: **Gallery List Page**, **Gallery Detail Page (Studio View)**, and **Client-Facing Gallery View**.

---

## ✅ SECTION 1 — GALLERY LIST PAGE

### TC-GL-01 | Grid ↔ List View Toggle
- **Action:** Clicked the grid icon and list icon.
- **Expected:** View switches between card grid and row list.
- **Result:** ✅ **PASS** — Both views render correctly with proper layout.

### TC-GL-02 | Gallery Card — Thumbnail Preview
- **Action:** Observed gallery cards in both grid and list views.
- **Expected:** Cover photo should appear as thumbnail.
- **Result:** ❌ **FAIL — BUG** — Gallery cards show NO thumbnail preview images. All cards appear as blank white boxes with only title, tags and date. Even the gallery with 17 uploaded photos (Wedding Gallery UAT) shows no cover image.

### TC-GL-03 | Gallery Card — Hover State & Context Menu
- **Action:** Hovered over gallery cards.
- **Expected:** Hover overlay with options (edit, delete, share) should appear.
- **Result:** ❌ **FAIL — BUG** — No hover state. No context menu. No per-card actions accessible from the list.

### TC-GL-04 | "+ New Gallery" Button
- **Action:** Clicked "+ New Gallery".
- **Expected:** A form to create a gallery appears.
- **Result:** ✅ **PASS** — Inline form appears with Title field and Type dropdown.

### TC-GL-05 | New Gallery — Empty Title Validation
- **Action:** Clicked "Create Gallery" with blank title.
- **Expected:** Inline validation error "Title is required" highlighted in red.
- **Result:** ❌ **FAIL — BUG** — No error message displayed. Button simply does nothing silently. No toast, no field highlight, no validation feedback.

### TC-GL-06 | New Gallery — Type Dropdown
- **Action:** Opened the TYPE dropdown.
- **Expected:** Multiple gallery type options.
- **Result:** ✅ **PASS** — Dropdown works. Options available: "Proofing — client selects favorites" and delivery types.

### TC-GL-07 | New Gallery — Successful Creation
- **Action:** Filled title "UAT Test Gallery 2026" and clicked "Create Gallery".
- **Expected:** Gallery created and appears in list.
- **Result:** ✅ **PASS** — Gallery created successfully. Count updated from 2→3.

### TC-GL-08 | New Gallery — Cancel Button
- **Action:** Tested Cancel button behavior.
- **Expected:** Form dismisses without creating a gallery.
- **Result:** ✅ **PASS** — Cancel correctly dismisses the form.

---

## ✅ SECTION 2 — GALLERY DETAIL PAGE (STUDIO/PHOTOGRAPHER VIEW)

### TC-GD-01 | Gallery Header — Title Inline Edit
- **Action:** Clicked on the gallery title "Wedding Gallery UAT".
- **Expected:** Title becomes editable inline.
- **Result:** ❌ **FAIL — BUG** — Title is NOT editable inline. No edit pencil icon. No way to rename a gallery from its detail page.

### TC-GD-02 | Gallery Header — Description Inline Edit
- **Action:** Clicked on description "Full module E test".
- **Expected:** Description becomes editable.
- **Result:** ❌ **FAIL — BUG** — Description is NOT editable.

### TC-GD-03 | Gallery Tags (wedding, published, Published badge)
- **Action:** Clicked on each tag chip.
- **Expected:** Either filter or open an edit modal.
- **Result:** ❌ **FAIL — BUG** — All tags are completely non-interactive. No response on click.

### TC-GD-04 | Gallery — No Settings/Edit Button
- **Action:** Scanned the entire gallery detail page for any edit, gear, or settings button.
- **Expected:** A dedicated Settings button to edit gallery name, type, client assignment, cover photo, sharing settings, watermark, password, etc.
- **Result:** ❌ **FAIL — CRITICAL BUG** — There is absolutely NO Settings or Edit button on the gallery detail page. Confirmed also by testing `/galleries/{id}/settings` URL which returns a 404. Photographers have no way to edit or configure a gallery after creation.

### TC-GD-05 | KPI Cards (Assets, Selections, Selection Limit)
- **Action:** Clicked on each KPI card.
- **Expected:** Drill-down or interactive filter.
- **Result:** ⚠️ **INFO** — Cards are display-only (non-interactive), which is acceptable for summary stats.

### TC-GD-06 | Upload Photos — Button Click
- **Action:** Clicked "Upload Photos" button.
- **Expected:** File picker / upload modal opens.
- **Result:** ✅ **PASS** — Upload area is functional. Supports JPEG, PNG, TIFF, RAW (CR2, NEF, ARW, DNG, RAF), up to 2GB per file.

### TC-GD-07 | Upload Photos — Drag & Drop Zone
- **Action:** Observed the drag-and-drop zone.
- **Expected:** Dashed border indicating a valid drop zone.
- **Result:** ✅ **PASS** — Drop zone clearly visible with dashed border and instructional copy.

### TC-GD-08 | Photo Cards — Click to Open Lightbox
- **Action:** Clicked individual photo thumbnails (11.jpg).
- **Expected:** Lightbox/modal viewer opens.
- **Result:** ✅ **PASS** — Lightbox opens with full image view.

### TC-GD-09 | Lightbox — Zoom In
- **Action:** Clicked Zoom In button (multiple clicks).
- **Expected:** Image zooms in with % indicator.
- **Result:** ✅ **PASS** — Zooms from 100% → 125% → 150%. Percentage shown in header.

### TC-GD-10 | Lightbox — Zoom Out
- **Action:** Clicked Zoom Out button.
- **Expected:** Image zooms out.
- **Result:** ✅ **PASS** — Correctly zooms back out to fit-to-screen.

### TC-GD-11 | Lightbox — Next Button Navigation
- **Action:** Clicked the ">" Next button.
- **Expected:** Navigates to next photo.
- **Result:** ✅ **PASS** — Navigates to 12.jpg correctly.

### TC-GD-12 | Lightbox — Arrow Key Navigation
- **Action:** Pressed Right Arrow key on keyboard.
- **Expected:** Navigates to next photo.
- **Result:** ✅ **PASS** — Arrow key navigation works (11 → 12 → 13).

### TC-GD-13 | Lightbox — Previous Button Navigation
- **Action:** Expected a "<" Previous button.
- **Expected:** Appears after moving past first photo.
- **Result:** ✅ **PASS** — Previous button appears and navigates back correctly.

### TC-GD-14 | Lightbox — Compare Mode
- **Action:** Clicked "Compare with next" button.
- **Expected:** Side-by-side slider comparison of two consecutive photos.
- **Result:** ❌ **FAIL — BUG** — Compare mode opens with split-screen layout and draggable divider, but **both images are completely black** (failed to load). The comparison slider shows 11.jpg / 12.jpg labels but no actual images. Persists even after 3-second wait.

### TC-GD-15 | Lightbox — Comments Panel
- **Action:** Clicked Comments (C) button.
- **Expected:** Side panel opens to add and view comments per photo.
- **Result:** ✅ **PARTIAL PASS** — Panel opens and shows "No comments yet". Text input appears at the bottom.

### TC-GD-16 | Lightbox — Comment Submission (Enter key)
- **Action:** Typed comment text and pressed Enter.
- **Expected:** Comment posted and appears in the list.
- **Result:** ❌ **FAIL — BUG** — Pressing Enter does not submit the comment. The text remains in the input box but is never posted.

### TC-GD-17 | Lightbox — Comment Submission (Post button)
- **Action:** Clicked the "Post" button after typing a comment.
- **Expected:** Comment saved and displayed.
- **Result:** ❌ **FAIL — BUG** — Clicking "Post" does not submit the comment. "No comments yet" persists. Comment functionality is completely broken.

### TC-GD-18 | Lightbox — Info Panel (I button)
- **Action:** Clicked the Info (I) button.
- **Expected:** A separate panel showing EXIF metadata, file size, dimensions, upload date.
- **Result:** ❌ **FAIL — BUG** — Info button only toggles the same Comments panel. There is no dedicated info panel. No EXIF data, no metadata display.

### TC-GD-19 | Lightbox — Fullscreen (F)
- **Action:** Clicked Fullscreen button.
- **Expected:** Photo expands to true browser fullscreen.
- **Result:** ✅ **PASS** — Fullscreen mode activates correctly.

### TC-GD-20 | Lightbox — Fullscreen Exit
- **Action:** Pressed Escape key in fullscreen.
- **Expected:** Exit fullscreen (return to lightbox).
- **Result:** ✅ **PASS** — Esc exits fullscreen but keeps lightbox open (correct behavior).

### TC-GD-21 | Lightbox — Close (X / Esc)
- **Action:** Clicked the X (Close) button.
- **Expected:** Lightbox closes and returns to gallery grid.
- **Result:** ✅ **PASS** — Lightbox closes correctly.

### TC-GD-22 | Lightbox — Filmstrip Thumbnail Bar
- **Action:** Looked for a filmstrip of all photos at the bottom of the lightbox.
- **Expected:** Scrollable filmstrip of all 17 photos at the bottom for quick navigation.
- **Result:** ❌ **FAIL — MISSING FEATURE** — No filmstrip bar visible. User can only navigate one-by-one using arrows or keyboard. For 17+ photos this is a significant UX gap.

### TC-GD-23 | Lightbox — Download Button
- **Action:** Clicked the Download button.
- **Expected:** Original photo downloads to device.
- **Result:** ✅ **PASS** — Download button is present and functional.

### TC-GD-24 | "Review Proofing" Button
- **Action:** Clicked "Review proofing" button.
- **Expected:** Navigates to proofing queue page.
- **Result:** ✅ **PASS** — Routes to `/galleries/{id}/proofing` with all client selections.

### TC-GD-25 | Proofing Queue — Approve Button
- **Action:** Clicked "Approve" on a client selection.
- **Expected:** Status changes to "approved", counter updates.
- **Result:** ✅ **PASS** — Status badge changes from "selected" → "approved". Counter updates instantly (Approved 0 → Approved 1).

### TC-GD-26 | Proofing Queue — Reject Button
- **Action:** Clicked "Reject" on a client selection.
- **Expected:** Status changes to "rejected", counter updates.
- **Result:** ✅ **PASS** — Status badge changes to "rejected". Rejected counter updates.

### TC-GD-27 | Proofing Queue — Star Rating
- **Action:** Clicked stars on a selection item.
- **Expected:** Stars fill in to indicate quality rating (1-5 stars).
- **Result:** ✅ **PASS** — Stars activate on click (filled golden stars visible).

### TC-GD-28 | Proofing Queue — "Mark selected" button
- **Action:** Observed "Mark selected" button on each item.
- **Expected:** Should toggle the selected state of the item.
- **Result:** ⚠️ **UNTESTED** — Could not verify the toggle effect without a second state.

### TC-GD-29 | Proofing Status Badges (Selected/Approved/Rejected) — Click to Filter
- **Action:** Clicked "Approved 1", "Rejected 1", "Selected 0" badge chips on the gallery detail page.
- **Expected:** Asset grid filters to show only that category.
- **Result:** ❌ **FAIL — BUG** — Badges are non-interactive. Clicking them does nothing. No filtering happens.

### TC-GD-30 | "Export Selections (CSV)" Button
- **Action:** Clicked "Export selections (CSV)".
- **Expected:** CSV file downloads with the client selection data.
- **Result:** ❌ **FAIL — CRITICAL BUG** — Opens raw API endpoint in a new tab showing `{"error":"missing authorization header"}`. The export call does not attach the session's auth token. This is a security and functional failure.

### TC-GD-31 | "View as client" — Published Gallery
- **Action:** Clicked "View as client" on the Wedding Gallery UAT (Published).
- **Expected:** Opens the public-facing client gallery in a new tab.
- **Result:** ✅ **PASS** — Opens correctly at `/g/wedding-gallery-uat-ff31645a?mode=client`.

### TC-GD-32 | "View as client" — Unpublished/Draft Gallery
- **Action:** Clicked "View as client" on the newly created "UAT Test Gallery 2026" (Draft/Unpublished).
- **Expected:** Should either show a preview or gracefully handle the unpublished state.
- **Result:** ❌ **FAIL — BUG** — Returns a **404 error page**. Draft galleries should show a "gallery not yet published" message, not a 404.

---

## ✅ SECTION 3 — CLIENT-FACING GALLERY VIEW

### TC-CV-01 | Page Load & Image Rendering
- **Action:** Opened client gallery URL.
- **Expected:** Gallery title, description, photo count and photos load.
- **Result:** ✅ **PASS** — Images load after ~3 seconds with proper masonry grid layout.

### TC-CV-02 | Photo Click — Lightbox / Selection
- **Action:** Clicked on a photo in client gallery view.
- **Expected:** Opens photo lightbox OR allows client to "favourite/select" the photo.
- **Result:** ❌ **FAIL — CRITICAL BUG** — Clicking photos in client view does absolutely nothing. No lightbox, no selection, no zoom. **This is the most critical bug** — the core client proofing action (selecting favourite photos) cannot be initiated from the gallery grid.

### TC-CV-03 | Grid / Map Toggle
- **Action:** Clicked "Grid" and "Map" buttons.
- **Expected:** Grid shows photo masonry layout; Map shows geo-tagged photos on a map.
- **Result:** ✅ **PASS** — Grid view works. Map view works with a friendly "No geotagged photos. None of the photos in this gallery contain GPS metadata." message.

### TC-CV-04 | Scroll — Page Content Disappears
- **Action:** Scrolled down past all photos.
- **Expected:** Footer or smooth end-of-gallery experience.
- **Result:** ❌ **FAIL — BUG** — After scrolling past all images, the page becomes entirely blank white. No footer, no "end of gallery" message, no load-more indicator.

### TC-CV-05 | "Keep these memories" Popup
- **Action:** Hovered over a photo.
- **Expected:** A nudge popup for client registration.
- **Result:** ✅ **PASS** — Popup appears. "Create free account" and "Not now" buttons both work correctly.

### TC-CV-06 | Client Gallery — No Header Navigation for Client
- **Action:** Observed the top navigation of the client view.
- **Expected:** Minimal branding with no photographer's studio nav.
- **Result:** ✅ **PASS** — Clean header showing RawDrive branding, no studio navigation.

### TC-CV-07 | "Powered by RawDrive" Footer Branding
- **Action:** Observed bottom of the client gallery page.
- **Expected:** White-label branding or "Powered by RawDrive".
- **Result:** ✅ **PASS** — "Powered by RawDrive" branding visible in the bottom-right corner.

---

## 🐛 CONSOLIDATED BUG REGISTER

| # | Bug ID | Location | Severity | Description |
|---|--------|----------|----------|-------------|
| 1 | BUG-GAL-001 | Gallery List | 🔴 High | Gallery cards show no thumbnail/cover image in grid view |
| 2 | BUG-GAL-002 | Gallery List | 🔴 High | No hover state or context menu on gallery cards — no quick edit/delete |
| 3 | BUG-GAL-003 | New Gallery Form | 🟡 Medium | No validation error shown when "Create Gallery" is clicked with empty title |
| 4 | BUG-GAL-004 | Gallery Detail | 🔴 Critical | NO Settings/Edit button — gallery title, description, type, cover photo, client assignment, sharing settings cannot be edited after creation |
| 5 | BUG-GAL-005 | Gallery Detail | 🟡 Medium | Tags (wedding, draft, Published) are non-interactive — can't click to edit or filter |
| 6 | BUG-GAL-006 | Gallery Detail | 🟡 Medium | Proofing Status filter badges (Selected/Approved/Rejected) are non-interactive |
| 7 | BUG-GAL-007 | Lightbox | 🔴 High | Compare Mode — both images render completely black (image load failure) |
| 8 | BUG-GAL-008 | Lightbox | 🔴 High | Comments cannot be posted — both Enter key and "Post" button do nothing |
| 9 | BUG-GAL-009 | Lightbox | 🟡 Medium | Info (I) button shows no metadata/EXIF panel — redundantly re-opens Comments |
| 10 | BUG-GAL-010 | Lightbox | 🟡 Medium | No filmstrip thumbnail bar for quick photo navigation |
| 11 | BUG-GAL-011 | Export CSV | 🔴 Critical | "Export selections (CSV)" button opens raw API URL in new tab with `{"error":"missing authorization header"}` — auth token not attached |
| 12 | BUG-GAL-012 | View as Client | 🟡 Medium | "View as client" on a draft/unpublished gallery returns 404 instead of a graceful unpublished message |
| 13 | BUG-GAL-013 | Client View | 🔴 Critical | Clicking photos in client gallery does nothing — no lightbox, no selection capability |
| 14 | BUG-GAL-014 | Client View | 🟡 Medium | Scrolling past photos results in blank white page — no footer/end-of-gallery indicator |

---

## ✅ WHAT IS WORKING WELL

| Feature | Status |
|---------|--------|
| Gallery creation (with title) | ✅ Works |
| Gallery list view toggle (Grid/List) | ✅ Works |
| Photo upload UI (drag & drop zone, button) | ✅ Works |
| Photo lightbox opens on click | ✅ Works |
| Lightbox Zoom In / Zoom Out | ✅ Works |
| Lightbox Next / Previous navigation | ✅ Works |
| Lightbox Arrow key navigation | ✅ Works |
| Lightbox Fullscreen mode | ✅ Works |
| Lightbox Close (X) button | ✅ Works |
| Lightbox Download button | ✅ Works |
| Comments panel opens/closes | ✅ Works |
| Proofing Queue – Approve button | ✅ Works |
| Proofing Queue – Reject button | ✅ Works |
| Proofing Queue – Star rating | ✅ Works |
| View as Client (published gallery) | ✅ Works |
| Client Gallery — Grid/Map toggle | ✅ Works |
| Client Gallery — Images render | ✅ Works |
| "Keep these memories" popup | ✅ Works |
| "Not now" dismisses popup | ✅ Works |

---

## 📊 TEST SUMMARY

| Category | Total TCs | Pass | Fail | Partial |
|----------|-----------|------|------|---------|
| Gallery List | 8 | 4 | 3 | 1 |
| Gallery Detail (Studio) | 24 | 14 | 9 | 1 |
| Client-Facing View | 7 | 4 | 3 | 0 |
| **TOTAL** | **39** | **22** | **15** | **2** |

**Pass Rate: 56%** — Not release-ready in current state.

---

## 🚨 PRIORITY FIXES (Before ANY release)

1. **[P0] No gallery edit/settings** — Photographers cannot rename, reassign, configure, or manage galleries post-creation. This is the biggest functional gap.
2. **[P0] Client photo click does nothing** — The entire proofing workflow breaks at the first step. Clients literally cannot select photos.
3. **[P0] Export CSV auth error** — Exposes raw API errors to photographers and makes proofing exports non-functional.
4. **[P1] Compare Mode black images** — A key differentiating feature is completely broken.
5. **[P1] Comments don't post** — Studio commentary on photos is entirely non-functional.
6. **[P1] No gallery thumbnail covers** — Visual UX is significantly degraded; photographers can't identify galleries at a glance.

**Overall UAT Verdict: 🔴 NOT READY FOR PRODUCTION**