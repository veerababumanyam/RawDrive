---
status: testing
phase: 14-faceid-deep-dive-and-enhancement
source: 14-01-SUMMARY.md, 14-02-SUMMARY.md, 14-03-SUMMARY.md, 14-04-SUMMARY.md, 14-05-SUMMARY.md
started: 2026-03-19T22:00:00Z
updated: 2026-03-19T22:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Face Groups API No Longer Returns 500
expected: |
  Navigate to the People page or any gallery with face groups. The face groups load without errors. No 500 status codes in the browser console network tab. Face group cards display with names and thumbnails.
awaiting: user response

## Tests

### 1. Face Groups API No Longer Returns 500
expected: Navigate to the People page or any gallery with face groups. The face groups load without errors. No 500 status codes in the browser console network tab. Face group cards display with names and thumbnails.
result: [pending]

### 2. Embedding Vectors Not Exposed in API
expected: Open browser DevTools Network tab. Click on a face group or view face details. Inspect the JSON response body. The response should NOT contain an "embedding" field with a 512-number array. Fields like name, thumbnail_url, face_count should be present.
result: [pending]

### 3. Face Group Representative Thumbnails Display
expected: Navigate to People page. Every face group card shows a face thumbnail (cropped face image). No broken image icons. If a group had a missing representative, it should now show the highest-confidence face.
result: [pending]

### 4. People Page Responsive Layout
expected: Open People page on desktop — face group cards in 6-8 column grid. Resize browser to tablet width (~768px) — grid reduces columns. Resize to mobile (~375px) — grid shows 2-3 columns. No horizontal overflow or cut-off cards at any width.
result: [pending]

### 5. Keyboard Navigation on People Page
expected: Focus the People page face group grid. Press arrow keys (left/right/up/down) — selection highlight moves between face group cards. Press Enter on a selected card — opens the face group detail. Press Escape — clears selection.
result: [pending]

### 6. Error Boundary on Face Operations
expected: If a face operation fails (e.g., network error during merge), instead of a white screen or crash, the user sees a friendly error message within the face panel area. The rest of the page remains functional.
result: [pending]

### 7. Face Confidence Filter
expected: On People page, a confidence filter control (slider or dropdown with All/Low/Med/High presets) is visible. Changing the filter updates which face groups are displayed. Selecting "High" shows only high-confidence face groups. Selecting "All" shows everything.
result: [pending]

### 8. Right-Click Context Menu on Face Groups
expected: Right-click on a face group card on the People page. A context menu appears with options like Rename, Merge, Delete. Clicking an option performs that action. The context menu dismisses when clicking elsewhere.
result: [pending]

### 9. Undo Merge
expected: Select two face groups and merge them. A toast notification appears at the bottom with an "Undo" button. Clicking "Undo" within the timeout period reverses the merge — the original groups reappear. The toast auto-dismisses after the timeout.
result: [pending]

### 10. Cross-Gallery Face Search
expected: On the People page, click on a face group to see details. A "Search across galleries" or similar option is available. Activating it shows photos of that person from ALL galleries in the workspace, not just one gallery.
result: [pending]

### 11. State Sync After Mutations
expected: Rename a face group. The new name appears immediately without page refresh. Merge two groups — the merged group updates immediately. Delete a group — it disappears from the list immediately. No stale data visible.
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0

## Gaps

[none yet]
