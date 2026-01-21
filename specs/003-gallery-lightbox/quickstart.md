# Quickstart: Gallery Lightbox Implementation

**Feature Branch**: `003-gallery-lightbox`
**Date**: 2026-01-20

## Overview

This guide provides step-by-step implementation instructions for the Gallery Lightbox feature. The lightbox is a **frontend-only** feature built with React, TypeScript, and Framer Motion.

---

## Prerequisites

```bash
# Ensure you're on the feature branch
git checkout 003-gallery-lightbox

# Install dependencies (should already be available)
npm install

# Start development environment
npm run dev
```

---

## File Structure

```
apps/web/src/
├── components/
│   └── lightbox/
│       ├── index.ts                    # Public exports
│       ├── Lightbox.tsx                # Main container component
│       ├── LightboxContext.tsx         # State context provider
│       ├── LightboxImage.tsx           # Image with LQIP loading
│       ├── LightboxNavigation.tsx      # Arrow buttons + pill
│       ├── LightboxToolbar.tsx         # Action buttons (vertical sidebar)
│       ├── LightboxFilmstrip.tsx       # Thumbnail strip
│       ├── LightboxInfoPanel.tsx       # EXIF metadata panel
│       ├── LightboxCommentsPanel.tsx   # Comments panel
│       ├── LightboxSlideshow.tsx       # Slideshow controls
│       ├── LightboxCompare.tsx         # Compare mode layout
│       ├── LightboxGestures.tsx        # Gesture handler wrapper
│       ├── hooks/
│       │   ├── useLightboxState.ts     # State reducer + actions
│       │   ├── useLightboxNavigation.ts # Keyboard + swipe nav
│       │   ├── useLightboxZoom.ts      # Zoom/pan logic
│       │   ├── useLightboxSlideshow.ts # Auto-advance timer
│       │   ├── useLightboxPreload.ts   # Image preloading
│       │   └── useLightboxKeyboard.ts  # Keyboard shortcuts
│       └── styles/
│           ├── lightbox.css            # Base styles
│           └── lightbox-glass.css      # Liquid glass effects
│
├── hooks/
│   └── portal/
│       ├── useFavorite.ts              # Favorite mutation
│       └── useComments.ts              # Comments queries
│
└── types/
    └── lightbox.ts                     # TypeScript interfaces
```

---

## Implementation Order

### Phase 1: Core Viewing (P1)

**Task 1.1: Create Types**
```typescript
// apps/web/src/types/lightbox.ts
// Copy interfaces from data-model.md
export type LightboxMode = 'view' | 'slideshow' | 'compare';
export interface LightboxState { ... }
export interface LightboxAsset { ... }
```

**Task 1.2: Create Context + Reducer**
```typescript
// apps/web/src/components/lightbox/LightboxContext.tsx
import { createContext, useReducer, useContext } from 'react';
import { LightboxState, LightboxAction, defaultLightboxState } from '@/types/lightbox';

function lightboxReducer(state: LightboxState, action: LightboxAction): LightboxState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, isOpen: true, currentIndex: action.payload.index };
    case 'CLOSE':
      return { ...defaultLightboxState };
    case 'NEXT':
      return { ...state, currentIndex: Math.min(state.currentIndex + 1, state.totalAssets - 1) };
    // ... more cases
  }
}

export const LightboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(lightboxReducer, defaultLightboxState);
  return (
    <LightboxContext.Provider value={{ state, dispatch }}>
      {children}
    </LightboxContext.Provider>
  );
};
```

**Task 1.3: Create Main Component**
```tsx
// apps/web/src/components/lightbox/Lightbox.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useLightbox } from './LightboxContext';

export const Lightbox: React.FC = () => {
  const { state, dispatch } = useLightbox();

  if (!state.isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="lightbox-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <LightboxImage />
        <LightboxNavigation />
        <LightboxToolbar />
        <LightboxFilmstrip />
      </motion.div>
    </AnimatePresence>
  );
};
```

**Task 1.4: Create Image Component with LQIP**
```tsx
// apps/web/src/components/lightbox/LightboxImage.tsx
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export const LightboxImage: React.FC<{ asset: LightboxAsset }> = ({ asset }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="lightbox-image-container">
      {/* LQIP placeholder */}
      <motion.img
        src={asset.thumbnailUrl}
        alt={asset.altText || asset.filename}
        className="lightbox-placeholder"
        style={{ filter: isLoaded ? 'none' : 'blur(20px)' }}
        animate={{ opacity: isLoaded ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Full resolution */}
      <motion.img
        src={asset.displayUrl}
        alt={asset.altText || asset.filename}
        className="lightbox-full"
        onLoad={() => setIsLoaded(true)}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
};
```

**Task 1.5: Create Navigation**
```tsx
// apps/web/src/components/lightbox/LightboxNavigation.tsx
// Floating pill with prev/play/next buttons
```

### Phase 2: Interactions (P1-P2)

**Task 2.1: Keyboard Navigation Hook**
```typescript
// apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts
import { useEffect, useCallback } from 'react';
import { useLightbox } from '../LightboxContext';

export function useLightboxKeyboard() {
  const { state, dispatch } = useLightbox();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!state.isOpen) return;

    switch (e.key) {
      case 'Escape':
        dispatch({ type: 'CLOSE' });
        break;
      case 'ArrowLeft':
        dispatch({ type: 'PREV' });
        break;
      case 'ArrowRight':
        dispatch({ type: 'NEXT' });
        break;
      case ' ':
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SLIDESHOW' });
        break;
      case 'f':
      case 'F':
        // Toggle favorite (handled by parent)
        break;
      // ... more shortcuts
    }
  }, [state.isOpen, dispatch]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
```

**Task 2.2: Gesture Handler**
```tsx
// apps/web/src/components/lightbox/LightboxGestures.tsx
import { useDrag, usePinch, useWheel } from '@use-gesture/react';
import { useSpring, animated } from '@react-spring/web';

export const LightboxGestures: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, dispatch } = useLightbox();

  const [spring, api] = useSpring(() => ({
    x: 0,
    y: 0,
    scale: 1,
    config: { tension: 300, friction: 30 },
  }));

  const bindDrag = useDrag(({ movement: [mx, my], direction: [dx], velocity: [vx], last }) => {
    if (!state.isZoomed && last) {
      // Swipe navigation
      if (Math.abs(mx) > 50 && vx > 0.5) {
        dispatch({ type: dx > 0 ? 'PREV' : 'NEXT' });
      }
      // Swipe down to dismiss
      if (my > 100 && Math.abs(mx) < 50) {
        dispatch({ type: 'CLOSE' });
      }
    } else if (state.isZoomed) {
      // Pan when zoomed
      api.start({ x: state.panOffset.x + mx, y: state.panOffset.y + my });
    }
  });

  const bindPinch = usePinch(({ offset: [scale] }) => {
    const clampedScale = Math.min(Math.max(scale, 1), 4);
    dispatch({ type: 'ZOOM_TO', payload: { level: clampedScale } });
  });

  return (
    <animated.div {...bindDrag()} {...bindPinch()} style={spring}>
      {children}
    </animated.div>
  );
};
```

**Task 2.3: Zoom Hook**
```typescript
// apps/web/src/components/lightbox/hooks/useLightboxZoom.ts
export function useLightboxZoom() {
  const { state, dispatch } = useLightbox();

  const zoomIn = useCallback(() => {
    const newLevel = Math.min(state.zoomLevel + 0.5, 4);
    dispatch({ type: 'ZOOM_TO', payload: { level: newLevel } });
  }, [state.zoomLevel, dispatch]);

  const zoomOut = useCallback(() => {
    const newLevel = Math.max(state.zoomLevel - 0.5, 1);
    dispatch({ type: 'ZOOM_TO', payload: { level: newLevel } });
  }, [state.zoomLevel, dispatch]);

  const resetZoom = useCallback(() => {
    dispatch({ type: 'RESET_ZOOM' });
  }, [dispatch]);

  const handleDoubleTap = useCallback((point: { x: number; y: number }) => {
    if (state.isZoomed) {
      dispatch({ type: 'RESET_ZOOM' });
    } else {
      dispatch({ type: 'ZOOM_TO', payload: { level: 2, point } });
    }
  }, [state.isZoomed, dispatch]);

  return { zoomIn, zoomOut, resetZoom, handleDoubleTap };
}
```

### Phase 3: Engagement Features (P2)

**Task 3.1: Favorites Integration**
```tsx
// apps/web/src/components/lightbox/LightboxToolbar.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

export const LightboxToolbar: React.FC = () => {
  const { currentAsset } = useLightbox();
  const queryClient = useQueryClient();

  const favoriteMutation = useMutation({
    mutationFn: (assetId: string) => portalApi.toggleFavorite(assetId),
    // Optimistic update
    onMutate: async (assetId) => {
      await queryClient.cancelQueries(['favoriteStatus', assetId]);
      const previous = queryClient.getQueryData(['favoriteStatus', assetId]);
      queryClient.setQueryData(['favoriteStatus', assetId], (old: boolean) => !old);
      return { previous };
    },
    onError: (err, assetId, context) => {
      queryClient.setQueryData(['favoriteStatus', assetId], context?.previous);
    },
  });

  return (
    <div className="lightbox-toolbar lightbox-glass">
      <button
        onClick={() => favoriteMutation.mutate(currentAsset.id)}
        aria-label={currentAsset.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        <HeartIcon filled={currentAsset.isFavorited} />
      </button>
      {/* More action buttons */}
    </div>
  );
};
```

**Task 3.2: Slideshow with Ken Burns**
```tsx
// apps/web/src/components/lightbox/hooks/useLightboxSlideshow.ts
import { useEffect, useRef } from 'react';

export function useLightboxSlideshow() {
  const { state, dispatch } = useLightbox();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const kenBurnsRef = useRef<number>(0);

  useEffect(() => {
    if (state.slideshowPlaying) {
      timerRef.current = setInterval(() => {
        // Rotate Ken Burns direction
        const directions = ['top-left-to-bottom-right', 'top-right-to-bottom-left', 'center-zoom-in'];
        kenBurnsRef.current = (kenBurnsRef.current + 1) % directions.length;

        dispatch({ type: 'NEXT' });
      }, state.slideshowInterval * 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.slideshowPlaying, state.slideshowInterval, dispatch]);

  // Auto-hide UI after 3 seconds
  useEffect(() => {
    if (state.slideshowPlaying && state.uiAutoHideEnabled) {
      const hideTimer = setTimeout(() => {
        dispatch({ type: 'HIDE_UI' });
      }, 3000);
      return () => clearTimeout(hideTimer);
    }
  }, [state.slideshowPlaying, state.uiVisible, dispatch]);

  return {
    isPlaying: state.slideshowPlaying,
    toggle: () => dispatch({ type: 'TOGGLE_SLIDESHOW' }),
  };
}
```

### Phase 4: Advanced Features (P3)

**Task 4.1: Compare Mode**
```tsx
// apps/web/src/components/lightbox/LightboxCompare.tsx
export const LightboxCompare: React.FC = () => {
  const { state, dispatch } = useLightbox();

  if (state.mode !== 'compare') return null;

  return (
    <div className="lightbox-compare-container">
      <div className="lightbox-compare-slot">
        <LightboxImage asset={assets[state.compareIndices[0]]} />
      </div>
      <div className="lightbox-compare-divider" />
      <div className="lightbox-compare-slot">
        <LightboxImage asset={assets[state.compareIndices[1]]} />
      </div>
    </div>
  );
};
```

**Task 4.2: Info Panel**
```tsx
// apps/web/src/components/lightbox/LightboxInfoPanel.tsx
export const LightboxInfoPanel: React.FC = () => {
  const { state, currentAsset } = useLightbox();

  if (!state.infoPanelOpen) return null;

  return (
    <motion.aside
      className="lightbox-info-panel lightbox-glass"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
    >
      <h3>Photo Information</h3>
      <dl>
        <dt>Filename</dt>
        <dd>{currentAsset.filename}</dd>
        <dt>Dimensions</dt>
        <dd>{currentAsset.width} × {currentAsset.height}</dd>
        {currentAsset.exif?.cameraMake && (
          <>
            <dt>Camera</dt>
            <dd>{currentAsset.exif.cameraMake} {currentAsset.exif.cameraModel}</dd>
          </>
        )}
        {/* More EXIF fields */}
      </dl>
    </motion.aside>
  );
};
```

---

## CSS: Liquid Glass Styles

```css
/* apps/web/src/components/lightbox/styles/lightbox-glass.css */

/* Light mode glass */
.lightbox-glass {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.75) 0%,
    rgba(255, 255, 255, 0.60) 50%,
    rgba(255, 255, 255, 0.75) 100%
  );
  backdrop-filter: blur(40px) saturate(200%);
  -webkit-backdrop-filter: blur(40px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.80);
  border-radius: 24px;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.04),
    0 8px 16px rgba(0, 0, 0, 0.08),
    0 24px 48px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.90);
}

/* Dark mode glass */
[data-theme="dark"] .lightbox-glass {
  background: linear-gradient(
    135deg,
    rgba(40, 40, 45, 0.80) 0%,
    rgba(30, 30, 35, 0.75) 50%,
    rgba(40, 40, 45, 0.80) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.20),
    0 8px 16px rgba(0, 0, 0, 0.40),
    0 24px 48px rgba(0, 0, 0, 0.40),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Navigation pill */
.lightbox-nav-pill {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 9999px;
}

/* Vertical toolbar */
.lightbox-toolbar {
  position: fixed;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.lightbox-toolbar button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 150ms ease-out, background 150ms ease-out;
}

.lightbox-toolbar button:hover {
  transform: translateY(-2px);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .lightbox-glass,
  .lightbox-toolbar button {
    transition: none;
  }

  .lightbox-ken-burns {
    animation: none !important;
  }
}
```

---

## Testing

```bash
# Run lightbox tests
npm run test -- --filter=lightbox

# E2E tests with Playwright
npm run test:e2e -- --grep="lightbox"
```

**Test Cases**:
1. Open lightbox from gallery grid
2. Navigate with keyboard arrows
3. Navigate with swipe gestures
4. Zoom with pinch gesture
5. Zoom with double-tap
6. Slideshow auto-advance
7. Favorite toggle with optimistic UI
8. Compare mode layout
9. Accessibility (keyboard-only navigation)
10. Reduced motion preference

---

## Performance Verification

```bash
# Lighthouse audit
npm run lighthouse -- --url="http://localhost:3000/gallery/test?lightbox=1"

# Chrome DevTools Performance
# 1. Open DevTools > Performance
# 2. Start recording
# 3. Navigate through 10 images
# 4. Stop recording
# 5. Verify 60fps, no layout thrashing
```

---

## Deployment Checklist

- [ ] All P1 user stories pass acceptance tests
- [ ] Lighthouse accessibility score > 90
- [ ] 60fps on iOS Safari 16+
- [ ] 60fps on Chrome 100+
- [ ] Offline mode works for cached images
- [ ] Dark mode tested
- [ ] Reduced motion tested
- [ ] Touch targets verified (44x44px)
- [ ] ARIA labels verified with screen reader
