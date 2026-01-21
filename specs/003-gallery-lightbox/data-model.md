# Data Model: Gallery Lightbox

**Feature Branch**: `003-gallery-lightbox`
**Date**: 2026-01-20

## Overview

The Gallery Lightbox is a frontend-only feature. This document defines TypeScript interfaces for client-side state management. No database schema changes required.

---

## Frontend Types

### Core Lightbox State

```typescript
// packages/types/src/lightbox.ts

/**
 * Lightbox viewing modes
 */
export type LightboxMode = 'view' | 'slideshow' | 'compare';

/**
 * Slideshow transition effects
 */
export type SlideshowTransition = 'fade' | 'slide' | 'zoom' | 'kenburns';

/**
 * Ken Burns animation directions
 */
export type KenBurnsDirection =
  | 'top-left-to-bottom-right'
  | 'top-right-to-bottom-left'
  | 'center-zoom-in'
  | 'center-zoom-out';

/**
 * Main lightbox state
 */
export interface LightboxState {
  // Navigation
  isOpen: boolean;
  currentIndex: number;
  totalAssets: number;

  // Mode
  mode: LightboxMode;

  // Zoom/Pan
  zoomLevel: number;
  panOffset: { x: number; y: number };
  isZoomed: boolean;

  // Slideshow
  slideshowPlaying: boolean;
  slideshowInterval: number; // seconds: 3, 5, 8, 10, 15, 30
  slideshowLoop: boolean;
  slideshowShuffle: boolean;
  slideshowTransition: SlideshowTransition;
  kenBurnsDirection: KenBurnsDirection;

  // Compare Mode
  compareIndices: [number, number];
  compareSyncEnabled: boolean;

  // UI State
  uiVisible: boolean;
  uiAutoHideEnabled: boolean;
  infoPanelOpen: boolean;
  commentsPanelOpen: boolean;
  filmstripVisible: boolean;

  // Loading
  isImageLoading: boolean;
  loadingError: string | null;
}

/**
 * Default lightbox state
 */
export const defaultLightboxState: LightboxState = {
  isOpen: false,
  currentIndex: 0,
  totalAssets: 0,
  mode: 'view',
  zoomLevel: 1,
  panOffset: { x: 0, y: 0 },
  isZoomed: false,
  slideshowPlaying: false,
  slideshowInterval: 5,
  slideshowLoop: true,
  slideshowShuffle: false,
  slideshowTransition: 'kenburns',
  kenBurnsDirection: 'center-zoom-in',
  compareIndices: [0, 1],
  compareSyncEnabled: true,
  uiVisible: true,
  uiAutoHideEnabled: true,
  infoPanelOpen: false,
  commentsPanelOpen: false,
  filmstripVisible: true,
  isImageLoading: false,
  loadingError: null,
};
```

### Lightbox Actions

```typescript
/**
 * Lightbox action types (for useReducer)
 */
export type LightboxAction =
  | { type: 'OPEN'; payload: { index: number; total: number } }
  | { type: 'CLOSE' }
  | { type: 'NAVIGATE'; payload: { index: number } }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SET_MODE'; payload: { mode: LightboxMode } }
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' }
  | { type: 'ZOOM_TO'; payload: { level: number; point?: { x: number; y: number } } }
  | { type: 'RESET_ZOOM' }
  | { type: 'PAN'; payload: { x: number; y: number } }
  | { type: 'TOGGLE_SLIDESHOW' }
  | { type: 'SET_SLIDESHOW_INTERVAL'; payload: { interval: number } }
  | { type: 'SET_SLIDESHOW_TRANSITION'; payload: { transition: SlideshowTransition } }
  | { type: 'TOGGLE_COMPARE_SYNC' }
  | { type: 'SET_COMPARE_INDEX'; payload: { slot: 0 | 1; index: number } }
  | { type: 'SWAP_COMPARE' }
  | { type: 'TOGGLE_UI' }
  | { type: 'SHOW_UI' }
  | { type: 'HIDE_UI' }
  | { type: 'TOGGLE_INFO_PANEL' }
  | { type: 'TOGGLE_COMMENTS_PANEL' }
  | { type: 'TOGGLE_FILMSTRIP' }
  | { type: 'SET_LOADING'; payload: { loading: boolean; error?: string } };
```

### Asset Display Types

```typescript
/**
 * Extended asset for lightbox display
 */
export interface LightboxAsset {
  id: string;
  index: number;

  // URLs
  thumbnailUrl: string;
  displayUrl: string;
  originalUrl?: string;
  downloadUrl?: string;

  // Metadata
  filename: string;
  caption?: string;
  altText?: string;
  width: number;
  height: number;
  mimeType: string;

  // EXIF data (from photo.metadata)
  exif?: {
    cameraMake?: string;
    cameraModel?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
    shutterSpeed?: string;
    iso?: number;
    dateTaken?: string;
    gps?: { lat: number; lng: number };
  };

  // Engagement stats
  viewCount: number;
  favoriteCount: number;
  downloadCount: number;
  commentCount: number;

  // User state (visitor-specific)
  isFavorited: boolean;
  isSelected: boolean;
}

/**
 * Preload queue item
 */
export interface PreloadItem {
  index: number;
  url: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'loading' | 'loaded' | 'error';
}
```

### Slideshow Configuration

```typescript
/**
 * Slideshow settings
 */
export interface SlideshowConfig {
  interval: number;
  transition: SlideshowTransition;
  loop: boolean;
  shuffle: boolean;

  // Ken Burns specific
  kenBurns: {
    enabled: boolean;
    zoomRange: [number, number]; // [1.0, 1.15]
    panDistance: number; // 5%
    directions: KenBurnsDirection[];
  };

  // UI behavior
  autoHideUI: boolean;
  autoHideDelay: number; // 3000ms
}

/**
 * Default slideshow config
 */
export const defaultSlideshowConfig: SlideshowConfig = {
  interval: 5,
  transition: 'kenburns',
  loop: true,
  shuffle: false,
  kenBurns: {
    enabled: true,
    zoomRange: [1.0, 1.15],
    panDistance: 5,
    directions: [
      'top-left-to-bottom-right',
      'top-right-to-bottom-left',
      'center-zoom-in',
      'center-zoom-out',
    ],
  },
  autoHideUI: true,
  autoHideDelay: 3000,
};
```

### Zoom Configuration

```typescript
/**
 * Zoom constraints
 */
export interface ZoomConfig {
  minZoom: number;     // 1 (fit to screen)
  maxZoom: number;     // 4
  zoomStep: number;    // 0.5
  doubleTapZoom: number; // 2

  // Animation
  zoomDuration: number; // 300ms
  zoomEasing: string;   // 'ease-out'

  // Boundaries
  constrainPan: boolean;
}

/**
 * Default zoom config
 */
export const defaultZoomConfig: ZoomConfig = {
  minZoom: 1,
  maxZoom: 4,
  zoomStep: 0.5,
  doubleTapZoom: 2,
  zoomDuration: 300,
  zoomEasing: 'ease-out',
  constrainPan: true,
};
```

### Gesture Configuration

```typescript
/**
 * Gesture thresholds and settings
 */
export interface GestureConfig {
  // Swipe
  swipeThreshold: number;      // 50px
  swipeVelocity: number;       // 0.5

  // Pinch
  pinchThreshold: number;      // 0.1 scale change

  // Tap
  doubleTapDelay: number;      // 300ms
  longPressDelay: number;      // 500ms

  // Pan
  panThreshold: number;        // 10px

  // Dismiss
  dismissThreshold: number;    // 100px vertical
  dismissVelocity: number;     // 0.3
}

/**
 * Default gesture config
 */
export const defaultGestureConfig: GestureConfig = {
  swipeThreshold: 50,
  swipeVelocity: 0.5,
  pinchThreshold: 0.1,
  doubleTapDelay: 300,
  longPressDelay: 500,
  panThreshold: 10,
  dismissThreshold: 100,
  dismissVelocity: 0.3,
};
```

### Compare Mode Types

```typescript
/**
 * Compare mode layout
 */
export type CompareLayout = '2-up' | '4-up';

/**
 * Compare mode state
 */
export interface CompareState {
  layout: CompareLayout;
  slots: {
    index: number;
    zoomLevel: number;
    panOffset: { x: number; y: number };
  }[];
  syncZoom: boolean;
  syncPan: boolean;
  activeSlot: number;
}
```

### Annotation Types (P3 Feature)

```typescript
/**
 * Annotation tool types
 */
export type AnnotationTool = 'rectangle' | 'circle' | 'arrow' | 'text';

/**
 * Annotation shape
 */
export interface Annotation {
  id: string;
  tool: AnnotationTool;
  color: string;

  // Position (percentage of image dimensions)
  x: number;
  y: number;
  width?: number;
  height?: number;

  // Arrow specific
  endX?: number;
  endY?: number;

  // Text specific
  text?: string;
  fontSize?: number;

  // Metadata
  createdAt: Date;
  createdBy: string;
}

/**
 * Annotation state
 */
export interface AnnotationState {
  enabled: boolean;
  activeTool: AnnotationTool;
  activeColor: string;
  annotations: Annotation[];
  isDrawing: boolean;
}
```

---

## Entity Relationships (Existing)

```
┌─────────────────┐     ┌─────────────────┐
│   GalleryAsset  │────▶│      Photo      │
│   (Backend)     │     │   (Backend)     │
└─────────────────┘     └─────────────────┘
        │
        │ API Response
        ▼
┌─────────────────┐
│  LightboxAsset  │
│   (Frontend)    │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│  LightboxState  │
│   (Frontend)    │
└─────────────────┘
```

---

## State Persistence

| State | Storage | TTL |
|-------|---------|-----|
| Slideshow settings | localStorage | Permanent |
| Recent galleries | localStorage | 30 days |
| Gesture preferences | localStorage | Permanent |
| Current position | URL hash | Session |
| Zoom/pan state | Memory | Ephemeral |
| Favorites | React Query + API | Real-time |
| Comments | React Query + API | Real-time |

---

## Validation Rules

```typescript
// Zod schemas for frontend validation

import { z } from 'zod';

export const lightboxOpenSchema = z.object({
  assetId: z.string().uuid(),
  galleryId: z.string().uuid(),
});

export const slideshowConfigSchema = z.object({
  interval: z.number().int().min(3).max(30),
  transition: z.enum(['fade', 'slide', 'zoom', 'kenburns']),
  loop: z.boolean(),
  shuffle: z.boolean(),
});

export const zoomSchema = z.object({
  level: z.number().min(1).max(4),
  point: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
});
```
