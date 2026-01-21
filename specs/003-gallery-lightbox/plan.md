# Implementation Plan: Gallery Lightbox Enhancement

**Branch**: `003-gallery-lightbox` | **Date**: 2026-01-21 | **Spec**: [spec.md](./spec.md)
**Status**: Enhancement of existing implementation (code review completed)

## Summary

Enhance the existing 947-line Lightbox component with slideshow mode (Ken Burns effects), compare mode (2-up view), filmstrip navigation, LQIP blur-up, and image preloading. **Incremental enhancement** approach preserving all existing functionality.

## Code Review Findings

### Current Implementation Status

**Location**: `frontend/src/components/features/gallery/Lightbox.tsx` (947 lines)

| Feature | Status | Lines | Notes |
|---------|--------|-------|-------|
| Full-screen viewing | ✅ Done | 473-942 | Portal rendering with backdrop blur |
| Keyboard navigation | ✅ Done | 282-339 | Escape, Arrows, Home, End, +/-, M, R |
| Mouse wheel zoom | ✅ Done | 354-360 | Ctrl/Cmd + scroll |
| Touch pinch-to-zoom | ✅ Done | 384-408 | Native touch events |
| Pan/drag when zoomed | ✅ Done | 363-381 | Mouse-based panning |
| Image rotation | ✅ Done | 330-333 | 90° increments |
| Favorites toggle | ✅ Done | 672-688 | With visual feedback |
| Selections toggle | ✅ Done | 689-708 | Proofing workflow |
| Download (policy) | ✅ Done | 730-740 | Respects download_policy |
| Delete with undo | ✅ Done | 741-755 | Close + delete callback |
| EXIF metadata panel | ✅ Done | 805-853 | Info tab with EXIF display |
| Comments integration | ✅ Done | 862-869 | CommentSection component |
| Tags management | ✅ Done | 856-860 | TagInput component |
| Face tagging | ✅ Done | 873-935 | People tab with auto-detect |
| Signed URL fallback | ✅ Done | 89-123 | preview → original → thumbnail |
| Multi-tab metadata | ✅ Done | 764-801 | Info, Tags, Comments, People |

### Gaps to Implement

| Feature | Priority | Spec Stories | Complexity | Effort |
|---------|----------|--------------|------------|--------|
| Filmstrip navigation | P1 | US-1, US-2 | Medium | 2-3 days |
| LQIP blur-up | P1 | US-1 | Low | 1 day |
| Image preloading | P1 | US-2 | Medium | 1-2 days |
| Slideshow mode | P2 | US-4 | High | 3-4 days |
| Enhanced gestures | P2 | US-5 | Medium | 2 days |
| Compare mode | P3 | US-6 | High | 3-4 days |
| Offline caching | P3 | Edge cases | Medium | 2 days |

## Technical Context

**Language/Version**: TypeScript 5.3+, React 18.3, Node.js 20+
**Primary Dependencies**:
- framer-motion ^11.0.0 (installed)
- @use-gesture/react ^10.3.1 (ADDED to package.json)
- @tanstack/react-query ^5.90.16 (installed)
- react-window ^2.2.4 (installed)
**Storage**: Browser localStorage (settings), React Query cache (API data)
**Testing**: Vitest (unit), Playwright (E2E), Testing Library (components)
**Target Platform**: Web (Chrome 100+, Safari 16+, Firefox 115+, Edge 100+)
**Project Type**: Web application (frontend monorepo)
**Performance Goals**: <200ms lightbox open, 60fps animations, <2s image load
**Constraints**: <150MB memory for 50 images, WCAG 2.1 AA compliance

## Constitution Check

*GATE: Passed - Enhancement aligns with existing architecture*

| Gate | Status | Notes |
|------|--------|-------|
| Existing API reuse | ✅ Pass | All endpoints exist in gallery-service |
| No backend changes | ✅ Pass | Frontend-only enhancement |
| Design system alignment | ✅ Pass | Extends existing glassmorphism patterns |
| Accessibility | ✅ Pass | Existing ARIA, keyboard nav in place |
| Performance | ✅ Pass | Targets match Core Web Vitals |

## Project Structure

### Existing Files (to enhance)

```text
frontend/src/
├── components/features/gallery/
│   ├── Lightbox.tsx             # Main component (947 lines) - ENHANCE
│   ├── LightboxMetadata.tsx     # Metadata display (EXISTS)
│   ├── CommentSection.tsx       # Comments (EXISTS)
│   ├── TagInput.tsx             # Tags (EXISTS)
│   ├── FaceOverlay.tsx          # Face tagging (EXISTS)
│   ├── PhotoCard.tsx            # Gallery card (EXISTS)
│   └── PhotoGrid.tsx            # Gallery grid (EXISTS)
│
├── hooks/
│   └── useSignedUrl.ts          # Signed URL hook (EXISTS)
│
├── types/
│   └── gallery.ts               # Types with LQIP field (EXISTS)
│
└── pages/workspace/
    └── GalleryDetailPage.tsx    # Integration point (EXISTS)
```

### New Files (to create)

```text
frontend/src/
├── hooks/lightbox/
│   ├── index.ts                 # Public exports
│   ├── useLightboxZoom.ts       # Extract from Lightbox.tsx
│   ├── useLightboxNavigation.ts # Extract from Lightbox.tsx
│   ├── useLightboxGestures.ts   # @use-gesture integration
│   ├── useLightboxSlideshow.ts  # Slideshow timer + Ken Burns
│   ├── useLightboxCompare.ts    # Compare mode sync
│   └── useImagePreloader.ts     # Adjacent image preloading
│
├── contexts/
│   └── LightboxContext.tsx      # State reducer for modes
│
└── components/features/gallery/
    ├── LightboxFilmstrip.tsx    # Thumbnail strip (virtualized)
    ├── LightboxSlideshow.tsx    # Ken Burns animation
    ├── LightboxCompare.tsx      # 2-up comparison view
    └── LightboxImage.tsx        # LQIP blur-up component
```

## Implementation Phases

### Phase 1: Foundation (P1 Features)

**Goal**: Extract hooks, add filmstrip, LQIP, and preloading

| Task | File | Description | Status |
|------|------|-------------|--------|
| 1.1 | `package.json` | Add `@use-gesture/react@^10.3.1` | ✅ Done |
| 1.2 | `hooks/lightbox/useLightboxZoom.ts` | Extract zoom logic (lines 75-77, 354-428) | Pending |
| 1.3 | `hooks/lightbox/useLightboxNavigation.ts` | Extract nav logic (lines 282-339, 431-441) | Pending |
| 1.4 | `LightboxImage.tsx` | LQIP blur-up using `asset.lqip` field | Pending |
| 1.5 | `hooks/lightbox/useImagePreloader.ts` | Preload 2 adjacent images | Pending |
| 1.6 | `LightboxFilmstrip.tsx` | Virtualized thumbnail strip | Pending |
| 1.7 | `Lightbox.tsx` | Integrate new components | Pending |

**Acceptance**: US-1, US-2 scenarios pass

### Phase 2: Slideshow Mode (P2 Features)

**Goal**: Auto-advancing slideshow with Ken Burns effects

| Task | File | Description |
|------|------|-------------|
| 2.1 | `contexts/LightboxContext.tsx` | State reducer for mode management |
| 2.2 | `hooks/lightbox/useLightboxSlideshow.ts` | Timer, auto-advance, UI auto-hide |
| 2.3 | `LightboxSlideshow.tsx` | Ken Burns animation (10-15% zoom) |
| 2.4 | `hooks/lightbox/useLightboxGestures.ts` | Enhanced gestures with @use-gesture |
| 2.5 | `Lightbox.tsx` | Slideshow mode toggle, controls |

**Acceptance**: US-4 scenarios pass (play, pause, intervals, loop)

### Phase 3: Compare Mode (P3 Features)

**Goal**: Side-by-side photo comparison

| Task | File | Description |
|------|------|-------------|
| 3.1 | `LightboxCompare.tsx` | 2-up CSS Grid layout |
| 3.2 | `hooks/lightbox/useLightboxCompare.ts` | Synchronized zoom/pan |
| 3.3 | `LightboxContext.tsx` | Compare mode state |
| 3.4 | `Lightbox.tsx` | Compare mode integration |

**Acceptance**: US-6 scenarios pass (sync zoom, swap, selection)

### Phase 4: Polish & Offline (P3)

**Goal**: Offline support, performance optimization

| Task | File | Description |
|------|------|-------------|
| 4.1 | `vite.config.ts` | Workbox cache for lightbox images |
| 4.2 | `Lightbox.tsx` | Offline indicator |
| 4.3 | All components | Accessibility audit |
| 4.4 | E2E tests | Full coverage |

## API Endpoints Used (Existing)

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /galleries/:id/assets` | Asset listing with LQIP | ✅ In use |
| `POST /galleries/:id/assets/:id/favorite` | Toggle favorite | ✅ In use |
| `POST /galleries/:id/assets/:id/selection` | Toggle selection | ✅ In use |
| `GET /assets/:id/signed-url/:variant` | Signed URL generation | ✅ In use |
| `GET /galleries/:id/assets/:id/comments` | Asset comments | ✅ In use |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Incremental enhance | Low risk, preserves 947 lines of working code |
| State | Context + Reducer | Complex modes (view/slideshow/compare) need centralized state |
| Gestures | @use-gesture/react | Physics-based swipe, pinch momentum, better UX |
| Animations | framer-motion | Already installed ^11.x, GPU-accelerated |
| Filmstrip | react-window | Already installed, virtualized for 5000+ images |
| LQIP | asset.lqip field | Already available in AssetInfo type |

## Verification

### Unit Tests
```bash
cd frontend && pnpm test -- --filter=lightbox
```

### E2E Tests
```bash
cd frontend && pnpm test:e2e -- --grep="lightbox"
```

### Performance Audit
```bash
cd frontend && pnpm lighthouse -- --url="http://localhost:5173/workspace/galleries/:id"
```

### Manual Testing Checklist
- [ ] Open lightbox from gallery grid (<200ms)
- [ ] Navigate with arrow keys
- [ ] Navigate with swipe gestures (mobile)
- [ ] Zoom with pinch (mobile)
- [ ] Zoom with double-tap
- [ ] Zoom with scroll wheel (Ctrl+scroll)
- [ ] View filmstrip, click to navigate
- [ ] LQIP blur-up visible on slow connections
- [ ] Start/pause slideshow
- [ ] Ken Burns effect visible during slideshow
- [ ] Enter compare mode (2-up)
- [ ] Sync zoom in compare mode
- [ ] Toggle favorite (visual feedback)
- [ ] View metadata panel (Info tab)
- [ ] Test reduced motion preference
- [ ] Test keyboard-only navigation
- [ ] Test screen reader (VoiceOver/NVDA)

## Dependencies

| Package | Version | Status |
|---------|---------|--------|
| framer-motion | ^11.0.0 | Already installed |
| @use-gesture/react | ^10.3.1 | **Added to package.json** |
| react-window | ^2.2.4 | Already installed |
| @tanstack/react-query | ^5.90.16 | Already installed |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Preserve all existing props/callbacks, add-only changes |
| iOS Safari gesture conflicts | Test matrix, event.stopPropagation, @use-gesture handles this |
| Memory with large galleries | Virtual filmstrip (react-window), preload only 5 images |
| Signed URL expiry | Existing auto-refresh on 403 already implemented |
| State complexity | Feature flags for slideshow/compare modes |

## Critical File Paths

1. **Enhance**: [frontend/src/components/features/gallery/Lightbox.tsx](../../frontend/src/components/features/gallery/Lightbox.tsx)
2. **Types**: [frontend/src/types/gallery.ts](../../frontend/src/types/gallery.ts) (has `lqip` field)
3. **Hooks**: [frontend/src/hooks/useSignedUrl.ts](../../frontend/src/hooks/useSignedUrl.ts)
4. **Integration**: [frontend/src/pages/workspace/GalleryDetailPage.tsx](../../frontend/src/pages/workspace/GalleryDetailPage.tsx)
5. **Animation presets**: [frontend/src/components/landing/animations/presets.ts](../../frontend/src/components/landing/animations/presets.ts)
