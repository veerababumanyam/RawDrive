# 🔍 RawDrive Gallery Module — Full UAT Analysis Report

**Tested by:** Claude (Business Analyst & UAT Specialist)
**Date:** April 12, 2026
**Platform:** RawDrive.in — Gallery Module
**Scope:** All gallery-related screens, flows, buttons, and components

---

## 📋 EXECUTIVE SUMMARY

The RawDrive Gallery Module is well-structured for photography business management with a rich feature set. However, **7 critical bugs**, **12 UX/UI issues**, **8 missing features**, and several **duplicate data inconsistencies** were identified across all sections. The core functionality works, but several key areas need immediate attention before production release.

---

## 🔴 CRITICAL BUGS (Must Fix)

### BUG-01 — Cover Photo Picker: Images Not Rendering
**Location:** `/galleries/{id}/cover`
**Severity:** Critical
**Description:** All gallery photo thumbnails in the "Select Cover" panel render as empty grey placeholder boxes. The canvas/preview area also shows grey. Clicking thumbnails shows "Selected: asset-1/2/etc." text in the canvas, confirming the click-binding works — but the images themselves fail to load. Cover preview section (Gallery List, Share Link, Full Header panels) also shows empty grey boxes.
**Impact:** Photographers cannot visually select a cover photo.
**Expected:** Actual gallery photos should display as selectable thumbnails.

---

### BUG-02 — Design Studio Preview: Images Not Rendering
**Location:** `/galleries/{id}/design`
**Severity:** Critical
**Description:** The right-hand live preview panel shows only grey empty placeholder rectangles for all layout templates. Selecting different templates updates the label (e.g., "Classic Full", "Modern Grid") but the actual photo preview remains blank. Similarly, all layout theme thumbnails on the left panel are blank grey boxes.
**Impact:** Photographers cannot preview how their gallery will look with any design theme or layout.

---

### BUG-03 — Proofing Status Filter: Wrong Empty-State Message
**Location:** Gallery detail page, `Proofing status` sidebar widget
**Severity:** High
**Description:** When clicking "Selected 0" filter button, the assets grid shows the error message: *"No photos match the selected **face filter**."* This is incorrect — the active filter is a proofing status filter, not a face/AI filter.
**Impact:** Confuses users about which filter is active; wrong context.
**Fix:** Change empty-state copy to: *"No photos have been selected by clients yet."*

---

### BUG-04 — Lightbox Info Panel (I): Not Opening
**Location:** Gallery detail > photo lightbox
**Severity:** High
**Description:** The "Info (I)" button in the lightbox toolbar does not open an info/metadata panel. Clicking it multiple times shows no response. The Comments panel remains visible if open, but no EXIF/metadata panel appears.
**Impact:** Photographer cannot view photo metadata from the lightbox.

---

### BUG-05 — Design Studio "Suggest Design" Button: Non-Functional
**Location:** `/galleries/{id}/design` > AI Suggestions section
**Severity:** High
**Description:** Clicking "Suggest Design" produces no visible response — no loading state, no toast, no panel update. Either the API call fails silently or the feature is incomplete.
**Impact:** AI design suggestion feature appears completely broken.

---

### BUG-06 — Search Bar: Does Not Filter Gallery Cards
**Location:** Galleries list page — global search bar
**Severity:** High
**Description:** Typing "Wedding" in the search bar does not filter or highlight the gallery card. The gallery list remains unchanged regardless of input. No dropdown, no inline filtering, no debounced search occurs.
**Impact:** Users with large gallery collections cannot search/find galleries.

---

### BUG-07 — Settings Page: Page Does Not Fully Scroll
**Location:** `/galleries/{id}/settings`
**Severity:** Medium
**Description:** The Settings page appears constrained in height. Scrolling reveals the Password Protection section is partially hidden/cut off below the viewport and the page stops scrolling before showing the full content.
**Impact:** Settings below Password Protection (if any) would be inaccessible.

---

## 🟡 DUPLICATE & DATA ISSUES

### DUP-01 — Duplicate Tag Labels on Gallery Card
**Location:** Gallery list view — card tags
**Description:** The gallery card shows three tags: `wedding` (grey pill), `published` (grey pill), and `Published` (green badge). The word "published" appears **twice** — once as a lowercase category tag and once as a stylized status badge. This creates visual redundancy and confusion.
**Recommendation:** Remove the plain lowercase `published` tag. The green `Published` badge is sufficient to communicate status. The tag should only be for category/event type.

---

### DUP-02 — Duplicate Tag Behavior in Filter (Published Badge)
**Location:** Gallery list tag filter system
**Description:** Both the `published` plain tag AND the green `Published` badge both trigger the same `published` filter when clicked. Having two different-looking UI elements apply identical filters is confusing and redundant.

---

### DUP-03 — Proofing Queue: Identical Notes on Both Submissions
**Location:** `/galleries/{id}/proofing`
**Description:** Both client submissions show exactly the same message: *"Love these two!"* from the same client (UAT Client / client@test.in). While this may be test data, it raises a question: are these actually the same submission being duplicated, or are they genuinely two separate selections with identical notes? The proofing queue should show timestamps next to each submission to disambiguate.

---

### DUP-04 — Sort #0 on All Assets
**Location:** Gallery detail — assets grid
**Description:** Every single asset shows "Sort #0" as the sort order. This means drag-to-reorder has either not been used or the sort order field is not auto-incrementing. All assets at position zero could cause ordering issues.

---

## 🟠 UX/UI ISSUES

### UX-01 — Gallery Card Cover Image: Permanently Empty Placeholder
**Severity:** High
**Description:** Even though the gallery contains 17 photos, the gallery card thumbnail shows a grey placeholder image icon. Competitors like Pixieset, Pic-Time, and Shootproof automatically use the first uploaded photo as the card thumbnail. The cover photo picker exists as a separate page but the result never reflects on the card.
**Recommendation:** Auto-assign the first uploaded asset as the gallery card thumbnail if no cover is manually set.

---

### UX-02 — No Breadcrumb Navigation Inside Gallery Sub-pages
**Severity:** Medium
**Description:** When navigating to sub-pages (Cover Photo, Design & Theme, Analytics, Settings), there's only a "Back to gallery" link and no sub-navigation tabs consistent with the gallery detail page. Users have no visual awareness of where they are in the gallery hierarchy.
**Recommendation:** Show persistent tab navigation (Cover photo · Design & theme · Analytics · Settings) on all sub-pages, similar to how the gallery detail page shows them.

---

### UX-03 — Gallery Card: "Design" Button Goes Nowhere Different
**Severity:** Medium
**Description:** The card hover state shows three buttons: Open, Design, and Delete. "Design" navigates to the Design Studio. However, "Open" also gives access to the Design Studio via the "Design & theme" tab. The distinction is unclear and potentially redundant. On competitor platforms (Pic-Time), hover actions are typically: Open, Share, and Delete.

---

### UX-04 — "Created 11/4/2026" Label Ambiguity
**Severity:** Low-Medium
**Description:** The date displayed is "11/4/2026" — which in an Indian context could mean November 4, 2026, but the current date is April 12, 2026, making this a future date. This is test data, but the date format should be localized or use an unambiguous format (e.g., "4 Nov 2026" or ISO format). Additionally, this "Created" badge uses an inactive-looking pill style and has no tooltip.

---

### UX-05 — Analytics Page: Very Sparse, Missing Chart
**Severity:** Medium
**Description:** The analytics page shows 5 zero-value stat cards (Views, Visitors, Downloads, Favorites, Shares) with a single empty-state message. There is no chart, no trend line placeholder, and no historical graph even in skeleton form. Competitors like Pixieset show an empty-state chart with placeholders to communicate the data structure to new users.
**Recommendation:** Add an empty-state chart visualization and at minimum add a "Most viewed photos" section below the summary stats.

---

### UX-06 — Proofing Queue: No "Previous/Next" Photo Navigation
**Severity:** Medium
**Description:** The proofing queue cards show a thumbnail on the left but clicking the image doesn't open a lightbox. Photographers often want to quickly view a larger version of the submitted selection before approving/rejecting. There's no way to preview the full resolution from the proofing queue.

---

### UX-07 — Lightbox: Sidebar Doesn't Toggle Properly
**Severity:** Medium
**Description:** Clicking Info (I) does not switch the sidebar panel from Comments to Info. Both Comments (C) and Info (I) should toggle independently but the Info panel doesn't render. Additionally, the Comments panel doesn't have a close/toggle button — the only way to close it is to click Comments again.

---

### UX-08 — Gallery List Count: Stale During Filtering
**Severity:** Low
**Description:** The subtitle "1 gallery" remains visible even while a filter is active that shows the same 1 gallery. With more galleries and active filters, this could show "8 galleries" while only 2 are visible after filtering. The count should update to reflect visible results: e.g., "Showing 1 of 8 galleries."

---

### UX-09 — "Export Selections (CSV)" Button: No Confirmation or Loading State
**Severity:** Low
**Description:** Clicking "Export selections (CSV)" triggers an action with no visual feedback — no spinner, no "Downloading..." state, no success toast. Users don't know if the action succeeded.

---

### UX-10 — Cover Photo Page: Missing Breadcrumb / Back Navigation
**Severity:** Low
**Description:** The Cover Photo page shows the page heading "Cover Photo" with the gallery ID as a subtitle (`Gallery: 49c3b8ce-0a2c...`). Showing a raw UUID as a subtitle is unprofessional and meaningless to the user. It should show the gallery name ("Wedding Gallery UAT").

---

### UX-11 — Design Studio: "Publish" Button Missing (Save flow unclear)
**Severity:** High
**Description:** During testing, the interactive elements showed a "Publish" button in the DOM (`ref_23`) but it was not visible on screen — only "Discard All" was visible in the top-right. Users who make design changes have no obvious way to publish them. The autosave shows "Draft saved just now" but there is no clear "Publish changes" or "Save & Publish" CTA. This is a major UX gap — users may not realize their design changes are drafts only.

---

### UX-12 — Client Gallery: Non-Wedding Photos in Wedding Gallery
**Severity:** Medium (Content integrity)
**Description:** The public gallery includes images that appear to be office/team photos (a corporate group meeting photo, a casual team photo) mixed in with wedding photos. While this is likely test data, in production this would be a significant problem. The gallery type/category doesn't prevent mismatched photos from being uploaded. A content warning or AI photo categorization check on upload could help.

---

## 🟢 MISSING FEATURES & NEW RECOMMENDATIONS

### FEAT-01 — No Bulk Actions on Assets
**Description:** There is no way to select multiple photos at once and apply bulk actions (delete, move, tag, set as selected). All competitors (Pixieset, Pic-Time, ShootProof) support bulk selection with checkboxes. Bulk tagging, sorting, and deletion are standard features.

---

### FEAT-02 — No Sort/Reorder of Assets
**Description:** Assets all show "Sort #0." There is no drag-to-reorder functionality visible in the grid. Photographers need to control presentation order for client delivery.

---

### FEAT-03 — No Gallery Duplication / Template Feature
**Description:** There is no way to duplicate an existing gallery as a template for new projects. Photographers who do many weddings want to reuse design settings, cover templates, and settings without reconfiguring everything from scratch.

---

### FEAT-04 — No Client Email Sharing from Gallery
**Description:** The gallery has a "View as client" link but there is no "Share with client" button that lets the photographer input a client email address and send the gallery link directly from within the app. Platforms like Pixieset have a "Send Gallery" workflow built in.

---

### FEAT-05 — No Album / Sub-folder System
**Description:** With 17 photos all in one flat list, there is no way to organize photos into sub-albums (e.g., "Getting Ready," "Ceremony," "Reception"). All competing platforms support album groupings within galleries.

---

### FEAT-06 — No Watermarking Option
**Description:** There is no option to apply watermarks to images in the public gallery view to protect against unauthorized downloading. This is a standard feature in all photography delivery platforms.

---

### FEAT-07 — No Selection Limit Setting in Gallery Settings
**Description:** The stats card shows "Selection Limit: Open" but there is no field in the Settings page to configure this limit. Photographers often want to give clients a fixed quota (e.g., "Choose your 30 favorite photos").

---

### FEAT-08 — Analytics Lacks Photo-Level Insights
**Description:** Analytics only show gallery-level stats (Views, Visitors, Downloads, Favorites, Shares). There is no breakdown by most-viewed photos, most-downloaded photos, or client engagement per image — features standard in Pixieset and Pic-Time.

---

## ✅ WHAT'S WORKING WELL

The following tested features work correctly and are well-implemented:

- **Grid/List view toggle** — Smooth, state persists
- **Filter by tag** — Works correctly with active filter strip ("Filtered by: wedding × / Clear all")
- **Inline title & description editing** — Click-to-edit works cleanly
- **Photo lightbox** — Opens correctly, zoom in/out functional, compare mode (split view) is excellent and unique
- **Comments panel** in lightbox — Opens correctly, shows "No comments yet"
- **Dark mode toggle** — Full theme switch works well across all UI elements
- **Design Studio sections** — Cover Photo, Theme, Typography, Grid Layout, Templates, AI Suggestions all expand/collapse correctly
- **Grid Layout options** — Masonry/Grid/Justified/Carousel modes with sliders for columns and gap
- **Desktop/Tablet/Mobile preview toggle** — Updates preview layout correctly
- **Undo/Redo in Design Studio** — Properly labeled with keyboard shortcuts
- **New Gallery form validation** — "Title is required" shown correctly
- **Proofing queue** — Approve/Reject/Mark Selected/Star rating all work
- **Proofing status filter** — Approved and Rejected filters correctly show filtered assets
- **Settings toggles** — Downloads, FaceID entry, Face detection all functional
- **Password protection** — Field appears on "Set Password" click
- **Analytics time filters** — 7d/30d/90d toggle works
- **Client gallery rendering** — Photos load and display correctly in the public view
- **Client lightbox** — Keyboard navigation hints shown, filmstrip visible
- **Map view** — Shows correct "No geotagged photos" empty state
- **Auto-save in Design Studio** — Saves drafts every ~15-20 seconds
- **Performance metrics** — p95 15.7ms shown in design studio (impressive)

---

## 📊 SUMMARY SCORECARD

| Area | Score | Status |
|------|-------|--------|
| Gallery List Page | 6/10 | Search broken, duplicate tags, no cover thumbnails |
| Gallery Detail / Assets | 7/10 | Proofing filter message wrong, no bulk actions |
| Lightbox | 7/10 | Info panel broken, compare mode excellent |
| Cover Photo Page | 3/10 | **Critical: images not rendering** |
| Design Studio | 5/10 | **Critical: preview blank**, AI suggest broken |
| Analytics | 5/10 | Too sparse, no charts |
| Settings | 6/10 | Scroll issue, missing selection limit field |
| Proofing Queue | 7/10 | Good layout, missing photo preview lightbox |
| Client Gallery (Public) | 8/10 | Works well, missing favorite/select CTA |
| Dark Mode | 9/10 | Excellent implementation |

**Overall Module Score: 6.3/10** — Functional foundation with critical rendering bugs that block key workflows.

---

## 🎯 PRIORITY ACTION PLAN

**P0 — Fix Immediately (Blocking):**
1. Fix image rendering in Cover Photo picker (BUG-01)
2. Fix image rendering in Design Studio preview (BUG-02)
3. Fix "Suggest Design" AI button (BUG-05)
4. Fix Info panel in lightbox (BUG-04)

**P1 — Fix This Sprint:**
5. Fix wrong empty-state message on proofing filter (BUG-03)
6. Fix global search to filter gallery cards (BUG-06)
7. Remove duplicate "published" tag (DUP-01)
8. Fix Cover page subtitle showing UUID instead of gallery name (UX-10)
9. Auto-assign cover thumbnail from first asset (UX-01)
10. Make Publish CTA visible in Design Studio (UX-11)

**P2 — Next Sprint:**
11. Add bulk asset selection & actions (FEAT-01)
12. Add gallery sharing/email workflow (FEAT-04)
13. Add selection limit setting in Settings (FEAT-07)
14. Fix Settings page scroll issue (BUG-07)
15. Add sub-navigation tabs to all sub-pages (UX-02)
16. Improve analytics with charts (UX-05 + FEAT-08)

**P3 — Roadmap:**
17. Sub-album/folder system (FEAT-05)
18. Watermarking (FEAT-06)
19. Gallery duplication/templates (FEAT-03)
20. Photo-level analytics (FEAT-08)