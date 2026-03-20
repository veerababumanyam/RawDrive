---
phase: 12-editor-redesign
plan: 03
subsystem: frontend/profile-editors
tags: [editor, live-preview, dnd, auto-save, color-picker, device-frames]
dependency_graph:
  requires: [12-01, 12-02]
  provides: [complete-editor-experience]
  affects: [personal-profile-editor, company-profile-editor, section-registry, public-profile-renderer]
tech_stack:
  added: []
  patterns: [context-driven-form-state, auto-save-with-debounce, split-panel-editor]
key_files:
  created: []
  modified:
    - frontend/src/components/features/profile/shared/SectionRegistry.ts
    - frontend/src/components/features/profile/shared/PublicProfileRenderer.tsx
    - frontend/src/components/settings/PersonalProfileTabContent.tsx
    - frontend/src/components/features/settings/CompanyProfileForm.tsx
    - frontend/src/components/settings/PersonalProfilePreview.tsx
decisions:
  - Kept react-hook-form in CompanyProfileForm and synced to editor context via useEffect rather than replacing
  - PersonalProfileTabContent uses direct dispatch to context (no react-hook-form) for simpler state flow
  - PersonalProfilePreview marked deprecated rather than deleted to avoid breaking any remaining imports
metrics:
  duration: 542s
  completed: "2026-03-20T05:58:00Z"
requirements: [EDITR-01, EDITR-02, EDITR-03, EDITR-04, EDITR-05, EDITR-06]
---

# Phase 12 Plan 03: Wire Editor Components Summary

Integration of Plan 01 (state/auto-save) + Plan 02 (DnD/color picker/device frames) into both profile editors with live preview via PublicProfileRenderer.

## One-liner

Both profile editors wrapped in ProfileEditorProvider with live DeviceFramePreview, DnD section reordering, gradient color picker, and debounced auto-save.

## What was done

### Task 1: Update SectionRegistry and wire both editors

**SectionRegistry.ts**: Added optional `sectionOrder?: string[]` parameter to `getSectionsForProfile`. When provided, sections are sorted by their index in the order array; sections not in the array go to the end.

**PublicProfileRenderer.tsx**: Added `sectionOrder` prop and passes it through to `getSectionsForProfile` so custom ordering is respected in the live preview.

**PersonalProfileTabContent.tsx**: Complete rewrite:
- Wrapped in `ProfileEditorProvider` with profileType='personal'
- Split layout: 60% form panel (left), 40% live preview panel (right)
- All form fields dispatch `SET_FIELD` to editor context (replaces individual useState)
- Auto-save via `useProfileAutoSave` fires 2s after last change (existing profiles only)
- `AutoSaveStatus` indicator shows "Saved", "Saving...", or "Unsaved changes"
- `DndSectionList` in collapsible "Section Order" panel
- `GradientColorPicker` for accent color in Branding section
- `DeviceFramePreview` wrapping `PublicProfileRenderer` for live preview with device toggle
- Preserved all existing features: AvatarUploader, VisibilityToggle, ThemePreviewCard, AI Assistant, categories, custom links, social platforms

**CompanyProfileForm.tsx**: Same pattern applied:
- Wrapped in `ProfileEditorProvider` with profileType='company'
- Added 40% preview panel with `DeviceFramePreview` + `PublicProfileRenderer`
- Added `DndSectionList` as a CollapsibleSection
- Added `GradientColorPicker` for brand accent color
- Added `AutoSaveStatus` indicator
- Kept react-hook-form and syncs to editor context via useEffect
- Preserved all existing features: logo upload, QR code, slug editing, theme customization, undo/redo, save confirmation modal

**PersonalProfilePreview.tsx**: Marked as `@deprecated` with JSDoc comment explaining replacement.

## Decisions Made

1. **react-hook-form coexistence**: CompanyProfileForm keeps react-hook-form (deeply integrated with field arrays, validation) and syncs to editor context via useEffect, rather than a risky full rewrite.
2. **PersonalProfileTabContent simplified**: Uses direct dispatch to context since it had simpler state (individual useState calls), making the conversion cleaner.
3. **Deprecation over deletion**: PersonalProfilePreview kept with deprecation notice to avoid breaking any imports outside the main editor flow.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compilation: PASSED (no errors in modified files; pre-existing errors in PublicProfilePage.tsx are out of scope)
- All 11 acceptance criteria grep checks: PASSED
- Checkpoint (Task 2): Auto-approved per auto_advance config

## Self-Check: PASSED

All files exist, commit 21ca2a28 verified.
