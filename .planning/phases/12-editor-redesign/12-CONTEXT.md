# Phase 12: Editor Redesign - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign both profile editors (/workspace/profile personal, /workspace/branding company) with real-time live preview, drag-and-drop section reordering, visual theme/color picker, device frame preview, and auto-save. Editors must be consistent with existing RawDrive application design patterns.

Requirements: EDITR-01, EDITR-02, EDITR-03, EDITR-04, EDITR-05, EDITR-06

</domain>

<decisions>
## Implementation Decisions

### Editor Layout & Live Preview
- Split-pane layout: form left, preview right — consistent with existing PersonalProfileTabContent pattern
- Live preview via useReducer + React context — replaces broken singleton PreviewService, instant state sync
- Preview renders using same PublicProfileRenderer component — identical output to public page, zero desync
- Auto-save: debounced 2s after last change via TanStack Query mutation — consistent with existing data patterns

### Drag-and-Drop Section Reordering
- @dnd-kit/core + @dnd-kit/sortable — React 18 compatible, lightweight, accessible
- Section order persisted as JSON array column `section_order` in profile tables — Alembic migration needed
- DnD visual feedback: drag handle icon + drop zone highlight + Framer Motion layoutId for smooth animated reorder
- Default section order: Header → Bio → Socials → Contact → Custom Links (matches current rendering order)

### Theme Picker & Device Frames
- react-best-gradient-color-picker for visual gradient + solid color selection
- Device frame preview: CSS-scaled containers with device bezels — 3 sizes (mobile 375px, tablet 768px, desktop 1280px)
- Theme picker: grid of theme cards with live mini-preview — click to apply, shows gradient + accent colors
- Editor consistent with RawDrive: reuse existing SettingsLayout shell, TailwindCSS classes, breadcrumb navigation

### Claude's Discretion
- useReducer action types and state shape for editor form
- @dnd-kit sensor configuration (pointer vs keyboard)
- Device frame bezel styling (rounded corners, notch, etc.)
- Theme card grid layout (2, 3, or 4 columns)
- Gradient picker placement (inline vs modal)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 10/11)
- `PublicProfileRenderer.tsx` — same component used for preview (ensures parity)
- `UnifiedThemeEngine.ts` — theme resolution + CSS custom property application
- `AnimatedBackgroundRenderer.tsx` — animated backgrounds render in preview too
- `useColorScheme.ts` — dark mode hook for preview
- `PersonalProfileTabContent.tsx` — existing editor with split-pane pattern to reference
- `CompanyProfileForm.tsx` — existing company editor to reference
- `AvatarUploader.tsx` — crop/zoom modal for avatar editing

### Established Patterns
- SettingsLayout at /workspace/* routes with sidebar navigation
- TanStack Query mutations for data persistence
- Framer Motion for UI animations
- TailwindCSS responsive utilities

### Integration Points
- `/workspace/profile` route → MyProfilePage → PersonalProfileTabContent (to be enhanced)
- `/workspace/branding` route → BrandingPage → CompanyProfileForm (to be enhanced)
- Backend: PATCH endpoints for profile updates (already exist)
- Backend: need Alembic migration for `section_order` JSON column

</code_context>

<specifics>
## Specific Ideas

- Editors must feel native to RawDrive — not a separate tool
- Preview must be pixel-perfect match to public page
- DnD should feel smooth and responsive (Framer Motion layoutId)
- Color picker should support both solid colors and gradients for theme customization

</specifics>

<deferred>
## Deferred Ideas

- Gallery preview blocks and booking CTA (Phase 13)
- Custom CSS injection (v2)
- Profile A/B testing (v2)
- Undo/redo history (v2)

</deferred>
