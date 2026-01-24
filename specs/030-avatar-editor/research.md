# Research: Shared Avatar Editor Component

**Feature**: 030-avatar-editor
**Date**: 2026-01-23

## Overview

Research findings for building a modern, reusable avatar editor component with glassmorphism design, touch gesture support, and comprehensive image manipulation features.

---

## 1. Existing Implementation Analysis

### Current Components

**AvatarCropModal** (`frontend/src/components/ui/AvatarCropModal.tsx`)
- Uses `react-easy-crop` for crop functionality
- Supports: zoom (1x-3x), pan, circular crop
- Missing: rotation, flip, filters, responsive controls
- Output: WebP blob at 0.9 quality

**AvatarUploader** (`frontend/src/components/settings/AvatarUploader.tsx`)
- Handles file selection and validation (JPEG, PNG, WebP, max 5MB)
- Uses `AvatarCropModal` for editing
- Outputs `CropData` interface for backend

### Integration Points

| Component | File | Current Usage |
|-----------|------|---------------|
| User Profile | `AvatarUploader.tsx` | Direct usage |
| Client Form | `ClientFormPage.tsx` | Direct AvatarCropModal usage |
| Client Detail | `ClientDetailPage.tsx` | Similar pattern |
| Company Profile | `CompanyProfileForm.tsx` | Needs verification |

**Decision**: Replace `AvatarCropModal` with new `AvatarEditor` component. Maintain `CropData` interface for backward compatibility.

---

## 2. react-easy-crop Integration

### Existing Dependency

- Version: ^5.5.6 (already installed)
- Provides: Cropper component with zoom, pan, crop area calculation

### Capabilities

| Feature | Supported | Notes |
|---------|-----------|-------|
| Zoom | ✅ | Built-in, 1-3x default |
| Pan | ✅ | Built-in |
| Rotation | ✅ | `rotation` prop (degrees) |
| Flip | ❌ | Must implement via CSS transform |
| Filters | ❌ | Must implement via canvas |
| Touch | ✅ | Built-in pinch-to-zoom |

### Key Props

```typescript
interface CropperProps {
  image: string;
  crop: { x: number; y: number };
  zoom: number;
  rotation?: number;  // Added for rotation support
  aspect: number;
  cropShape: 'rect' | 'round';
  showGrid?: boolean;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onRotationChange?: (rotation: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
}
```

**Decision**: Continue using react-easy-crop. Add rotation prop support, implement flip and filters as CSS/canvas overlays.

---

## 3. Touch Gesture Handling

### Existing Dependency

- `@use-gesture/react` ^10.3.1 (already installed)
- Provides: useDrag, usePinch, useGesture hooks

### react-easy-crop Touch Support

- Built-in pinch-to-zoom
- Built-in pan gestures
- Does NOT support two-finger rotation natively

### Custom Gesture Implementation

For two-finger rotation (not in react-easy-crop):

```typescript
// useTouchGestures.ts concept
import { useGesture } from '@use-gesture/react';

const useTouchGestures = (options: GestureOptions) => {
  const bind = useGesture({
    onPinch: ({ da: [distance, angle], origin, memo }) => {
      // da[1] is the angle between fingers
      // Can calculate rotation from angle delta
      const rotationDelta = angle - (memo?.prevAngle ?? angle);
      options.onRotate?.(rotationDelta);
      return { prevAngle: angle };
    },
  });
  return bind;
};
```

**Decision**: Use react-easy-crop's built-in touch for zoom/pan. Implement custom rotation gesture overlay using @use-gesture/react for two-finger rotation.

---

## 4. Glassmorphism Design Pattern

### Existing CSS Utilities

From `frontend/src/index.css`:

```css
/* Glass variables */
--blur-glass: 12px;
--blur-glass-heavy: 20px;
--blur-glass-liquid: 40px;

/* Glass utility class */
@utility glass {
  background: var(--glass-background);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
}
```

### Modal Pattern

Current Modal component uses:
- `bg-black/50 backdrop-blur-sm` for backdrop
- `bg-surface rounded-modal shadow-2xl` for content

### Liquid Glassmorphism Implementation

```css
/* Liquid glass effect for AvatarEditorModal */
.avatar-editor-modal {
  backdrop-filter: blur(var(--blur-glass-liquid)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--blur-glass-liquid)) saturate(180%);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] .avatar-editor-modal {
  background: rgba(0, 0, 0, 0.2);
}
```

**Decision**: Use existing glass utilities with enhanced blur values. Apply glassmorphism to modal wrapper, keeping controls on solid surface for usability.

---

## 5. Canvas Image Processing

### Export Pipeline

1. Load original image to hidden canvas
2. Apply transformations (scale, translate, rotate, flip)
3. Apply filters (brightness, contrast, saturation)
4. Extract crop region
5. Export as Blob (WebP/JPEG)

### Filter Implementation

```typescript
// Canvas filter application
const applyFilters = (ctx: CanvasRenderingContext2D, filters: FilterState) => {
  const { brightness, contrast, saturation } = filters;
  // brightness/contrast/saturation range: -100 to +100
  ctx.filter = `
    brightness(${100 + brightness}%)
    contrast(${100 + contrast}%)
    saturate(${100 + saturation}%)
  `;
};
```

### Flip Implementation

```typescript
// Flip via canvas transform
if (flipHorizontal) {
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
}
if (flipVertical) {
  ctx.translate(0, height);
  ctx.scale(1, -1);
}
```

**Decision**: Apply CSS filters for real-time preview (performant). Re-apply as canvas filters during export for accurate output.

---

## 6. Accessibility Requirements

### WCAG 2.1 AA Compliance

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | Tab through controls, arrow keys for sliders |
| Screen reader support | ARIA labels on all interactive elements |
| Focus management | Focus trap in modal, return focus on close |
| Color contrast | Use design system tokens (already compliant) |
| Reduced motion | Respect `prefers-reduced-motion` media query |

### Keyboard Controls

| Key | Action |
|-----|--------|
| Tab | Navigate between controls |
| Arrow Up/Down | Adjust slider values |
| Arrow Left/Right | Fine-tune values |
| Enter/Space | Activate buttons |
| Escape | Close modal (with confirmation if dirty) |
| R | Rotate 90° clockwise |
| Shift+R | Rotate 90° counter-clockwise |
| H | Flip horizontal |
| V | Flip vertical |
| 0 | Reset all transforms |

**Decision**: Implement full keyboard support. Use existing Modal focus trap pattern. Add keyboard shortcuts for power users.

---

## 7. Responsive Design

### Breakpoints (from existing system)

- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### Layout Variations

**Mobile (< 640px)**
- Full-screen modal
- Canvas takes full width, 60% height
- Controls in bottom sheet style
- Large touch targets (min 44x44px)

**Tablet (640px - 1024px)**
- Centered modal (90% width, max 600px)
- Canvas with fixed aspect
- Controls below canvas

**Desktop (> 1024px)**
- Centered modal (max 800px)
- Canvas with controls side-by-side or below
- Full control panel visible

**Decision**: Use mobile-first responsive design. Controls adapt from bottom sheet (mobile) to inline panel (desktop).

---

## 8. Component API Design

### Primary Props Interface

```typescript
interface AvatarEditorProps {
  /** Image file to edit */
  file: File | null;
  /** Image source URL (alternative to file) */
  imageSrc?: string;
  /** Aspect ratio for crop (default: 1 for circle) */
  aspectRatio?: number;
  /** Crop shape */
  cropShape?: 'round' | 'rect';
  /** Callback when save is clicked */
  onSave: (file: File, cropData?: CropData) => void;
  /** Callback when cancel is clicked */
  onCancel: () => void;
  /** Maximum output dimension in pixels */
  maxOutputSize?: number;
  /** JPEG quality (0-1) */
  quality?: number;
  /** Output format */
  outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png';
  /** Whether editor is in loading state */
  isLoading?: boolean;
  /** Enable filter controls */
  enableFilters?: boolean;
  /** Enable rotation controls */
  enableRotation?: boolean;
  /** Enable flip controls */
  enableFlip?: boolean;
}
```

### CropData Interface (backward compatible)

```typescript
interface CropData {
  crop_x: number;      // X offset percentage (0-100)
  crop_y: number;      // Y offset percentage (0-100)
  crop_scale: number;  // Zoom level
  rotation?: number;   // Rotation in degrees (new)
  flip_h?: boolean;    // Horizontal flip (new)
  flip_v?: boolean;    // Vertical flip (new)
}
```

**Decision**: Keep existing `CropData` interface, extend with optional new fields for backward compatibility.

---

## 9. State Management

### Editor State Structure

```typescript
interface EditorState {
  // Image
  imageSrc: string | null;
  imageLoaded: boolean;

  // Transform
  zoom: number;           // 0.5 - 3
  pan: { x: number; y: number };
  rotation: number;       // -180 to 180
  flipHorizontal: boolean;
  flipVertical: boolean;

  // Filters
  brightness: number;     // -100 to 100
  contrast: number;       // -100 to 100
  saturation: number;     // -100 to 100

  // Crop
  croppedAreaPixels: Area | null;

  // UI
  isDirty: boolean;
  isProcessing: boolean;
}
```

**Decision**: Single `useAvatarEditor` hook manages all state. Use `useReducer` for complex state updates.

---

## 10. Performance Optimization

### Strategies

| Technique | Application |
|-----------|-------------|
| requestAnimationFrame | Smooth canvas updates |
| Debounce | Filter slider changes (100ms) |
| Throttle | Pan/zoom during gestures (16ms) |
| Web Worker | Image processing for large files |
| Preview downsampling | Max 1024px for preview canvas |

### Large Image Handling

1. Check file size on load
2. If > 10MB, show warning about processing time
3. Downsample to max 2048px for editing
4. Maintain original quality reference for export

**Decision**: Implement preview downsampling. Use Web Worker for export processing to avoid UI blocking.

---

## Summary of Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Crop library | Keep react-easy-crop | Already integrated, supports rotation |
| Touch gestures | Custom + built-in | react-easy-crop handles zoom/pan, custom for rotation |
| Design | Glassmorphism modal | Matches spec, uses existing utilities |
| Filters | CSS preview + Canvas export | Performance vs accuracy balance |
| Accessibility | Full keyboard + ARIA | WCAG 2.1 AA requirement |
| State | Single useAvatarEditor hook | Centralized, predictable |
| Compatibility | Extend CropData | Backward compatible with backend |
| Performance | Downsample + debounce | Smooth UX on all devices |

---

## Alternatives Considered

### Alternative 1: Replace react-easy-crop with custom canvas

**Rejected because**: react-easy-crop provides well-tested crop calculations and touch handling. Building from scratch would take longer and introduce bugs.

### Alternative 2: Use a full-featured image editor library (e.g., fabric.js)

**Rejected because**: Overkill for avatar editing. Would add significant bundle size (~300KB). Our requirements are specific and limited.

### Alternative 3: Server-side image processing

**Rejected because**: Adds latency to preview. Client already handles cropping well. Backend can still validate/process if needed.
