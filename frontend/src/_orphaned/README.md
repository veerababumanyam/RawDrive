# Orphaned Files

This folder contains files that were created as part of a feature spec but were never integrated into the application. They are preserved here for reference and potential future use.

## Safe to Delete

These files are confirmed to have **zero external usage** in the production codebase. After testing confirms the app works without them, they can be safely deleted.

## Contents

### profile-editor/
Advanced profile editor components that were designed but not integrated:
- `ProfileEditorContainer.tsx` - Main container with sidebar sections
- `LivePreviewPanel.tsx` - Device preview (phone/tablet/desktop)
- `VisibilityControls.tsx` - Field visibility toggles
- `ThemeGallery.tsx` - Theme selection gallery
- `ColorPaletteBuilder.tsx` - Color customization
- `TypographyManager.tsx` - Font management
- `VersionHistory.tsx` - Version control/snapshots
- `CustomFontUpload.tsx` - Custom font upload
- `AssetUpload.tsx` - Logo/asset management
- `AnalyticsDashboard.tsx` - Profile analytics
- `CollaborationPanel.tsx` - Comments & approval workflow
- `PreviewSharing.tsx` - Preview link sharing
- `ProfileCard.tsx` - Card component used by LivePreviewPanel
- `index.ts` - Barrel exports
- `README.md` - Original documentation
- `*.test.tsx` - Test files for orphaned components

### hooks/
- `useProfileEditor.ts` - Comprehensive editor state management hook

## What's Actually Used (Production)

The production profile editing uses:
- `components/features/settings/CompanyProfileForm.tsx`
- `components/features/settings/CompanyProfilePreview.tsx`
- `components/features/profile/PublicProfileView.tsx`

## To Delete

After confirming the app works correctly:
```bash
rm -rf frontend/src/_orphaned
```
