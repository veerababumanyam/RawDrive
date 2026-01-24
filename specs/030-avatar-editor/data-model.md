# Data Model: Shared Avatar Editor Component

**Feature**: 030-avatar-editor
**Date**: 2026-01-23

## Overview

This document defines the data structures and state management for the Avatar Editor component. As a frontend-only component, there are no database entities - all data is transient and exists only during the editing session.

---

## 1. Core Types

### AvatarEditorProps

The public API for the AvatarEditor component.

```typescript
interface AvatarEditorProps {
  /** Image file to edit (mutually exclusive with imageSrc) */
  file?: File | null;

  /** Image source URL (mutually exclusive with file) */
  imageSrc?: string;

  /** Aspect ratio for crop area (default: 1 for square/circle) */
  aspectRatio?: number;

  /** Shape of the crop area */
  cropShape?: 'round' | 'rect';

  /** Callback when user saves the edited image */
  onSave: (file: File, cropData?: CropData) => void;

  /** Callback when user cancels editing */
  onCancel: () => void;

  /** Maximum output dimension in pixels (default: 512) */
  maxOutputSize?: number;

  /** Output image quality 0-1 (default: 0.9) */
  quality?: number;

  /** Output image format (default: 'image/webp') */
  outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png';

  /** External loading state (e.g., during upload) */
  isLoading?: boolean;

  /** Enable brightness/contrast/saturation controls */
  enableFilters?: boolean;

  /** Enable rotation controls */
  enableRotation?: boolean;

  /** Enable flip controls */
  enableFlip?: boolean;
}
```

### CropData

Output metadata for the cropped image. Maintains backward compatibility with existing backend API.

```typescript
interface CropData {
  /** X offset percentage (0-100) */
  crop_x: number;

  /** Y offset percentage (0-100) */
  crop_y: number;

  /** Zoom/scale level */
  crop_scale: number;

  /** Rotation in degrees (-180 to 180) - optional for backward compatibility */
  rotation?: number;

  /** Whether image was flipped horizontally */
  flip_h?: boolean;

  /** Whether image was flipped vertically */
  flip_v?: boolean;
}
```

---

## 2. Internal State Types

### EditorState

Complete internal state of the editor, managed by `useAvatarEditor` hook.

```typescript
interface EditorState {
  // === Image State ===
  /** Data URL or blob URL of the image being edited */
  imageSrc: string | null;

  /** Whether the image has finished loading */
  imageLoaded: boolean;

  /** Original image dimensions */
  originalDimensions: { width: number; height: number } | null;

  // === Transform State ===
  /** Zoom level (0.5 to 3.0) */
  zoom: number;

  /** Pan/offset position */
  pan: Point;

  /** Rotation angle in degrees (-180 to 180) */
  rotation: number;

  /** Horizontal flip state */
  flipHorizontal: boolean;

  /** Vertical flip state */
  flipVertical: boolean;

  // === Filter State ===
  /** Brightness adjustment (-100 to 100) */
  brightness: number;

  /** Contrast adjustment (-100 to 100) */
  contrast: number;

  /** Saturation adjustment (-100 to 100) */
  saturation: number;

  // === Crop State ===
  /** Pixel coordinates of cropped area (from react-easy-crop) */
  croppedAreaPixels: Area | null;

  // === UI State ===
  /** Whether any changes have been made */
  isDirty: boolean;

  /** Whether image is being processed (export) */
  isProcessing: boolean;

  /** Error message if any */
  error: string | null;
}
```

### Point

2D coordinate representation.

```typescript
interface Point {
  x: number;
  y: number;
}
```

### Area

Rectangular area definition (from react-easy-crop).

```typescript
interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### FilterState

Grouped filter values for easier manipulation.

```typescript
interface FilterState {
  brightness: number;  // -100 to 100, default 0
  contrast: number;    // -100 to 100, default 0
  saturation: number;  // -100 to 100, default 0
}
```

### TransformState

Grouped transform values for calculations.

```typescript
interface TransformState {
  zoom: number;
  pan: Point;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}
```

---

## 3. Action Types

Actions for the editor state reducer.

```typescript
type EditorAction =
  // Image actions
  | { type: 'SET_IMAGE'; payload: { src: string; dimensions: { width: number; height: number } } }
  | { type: 'IMAGE_LOADED' }
  | { type: 'IMAGE_ERROR'; payload: string }
  | { type: 'CLEAR_IMAGE' }

  // Transform actions
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_PAN'; payload: Point }
  | { type: 'SET_ROTATION'; payload: number }
  | { type: 'ROTATE_90'; payload: 'cw' | 'ccw' }
  | { type: 'TOGGLE_FLIP_H' }
  | { type: 'TOGGLE_FLIP_V' }

  // Filter actions
  | { type: 'SET_BRIGHTNESS'; payload: number }
  | { type: 'SET_CONTRAST'; payload: number }
  | { type: 'SET_SATURATION'; payload: number }
  | { type: 'SET_FILTERS'; payload: Partial<FilterState> }

  // Crop actions
  | { type: 'SET_CROP_AREA'; payload: Area }

  // Reset actions
  | { type: 'RESET_TRANSFORMS' }
  | { type: 'RESET_FILTERS' }
  | { type: 'RESET_ALL' }

  // Processing actions
  | { type: 'START_PROCESSING' }
  | { type: 'FINISH_PROCESSING' }
  | { type: 'SET_ERROR'; payload: string | null };
```

---

## 4. Default Values

```typescript
const DEFAULT_EDITOR_STATE: EditorState = {
  // Image
  imageSrc: null,
  imageLoaded: false,
  originalDimensions: null,

  // Transform
  zoom: 1,
  pan: { x: 0, y: 0 },
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,

  // Filters
  brightness: 0,
  contrast: 0,
  saturation: 0,

  // Crop
  croppedAreaPixels: null,

  // UI
  isDirty: false,
  isProcessing: false,
  error: null,
};

const ZOOM_RANGE = { min: 0.5, max: 3, step: 0.01 };
const ROTATION_RANGE = { min: -180, max: 180, step: 1 };
const FILTER_RANGE = { min: -100, max: 100, step: 1 };
```

---

## 5. Hook Interfaces

### useAvatarEditor

Main hook that manages editor state and provides actions.

```typescript
interface UseAvatarEditorReturn {
  // State
  state: EditorState;

  // Image actions
  loadImage: (file: File | string) => Promise<void>;
  clearImage: () => void;

  // Transform actions
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setRotation: (rotation: number) => void;
  rotate90: (direction: 'cw' | 'ccw') => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;

  // Filter actions
  setBrightness: (value: number) => void;
  setContrast: (value: number) => void;
  setSaturation: (value: number) => void;

  // Crop actions
  setCropArea: (area: Area) => void;

  // Reset actions
  resetTransforms: () => void;
  resetFilters: () => void;
  resetAll: () => void;

  // Export
  exportImage: (options: ExportOptions) => Promise<{ file: File; cropData: CropData }>;

  // Computed
  isDirty: boolean;
  canSave: boolean;
  cssFilters: string;  // CSS filter string for preview
}

interface ExportOptions {
  maxSize?: number;
  quality?: number;
  format?: 'image/webp' | 'image/jpeg' | 'image/png';
}
```

### useImageTransform

Hook for transform matrix calculations.

```typescript
interface UseImageTransformReturn {
  /** Calculate CSS transform string for preview */
  getPreviewTransform: (transform: TransformState) => string;

  /** Apply transforms to canvas context */
  applyToCanvas: (
    ctx: CanvasRenderingContext2D,
    transform: TransformState,
    imageSize: { width: number; height: number }
  ) => void;

  /** Get bounding box after transforms */
  getTransformedBounds: (
    transform: TransformState,
    imageSize: { width: number; height: number }
  ) => { width: number; height: number };
}
```

### useTouchGestures

Hook for custom touch gesture handling.

```typescript
interface UseTouchGesturesOptions {
  /** Callback when rotation gesture detected */
  onRotate?: (angleDelta: number) => void;

  /** Whether gestures are enabled */
  enabled?: boolean;
}

interface UseTouchGesturesReturn {
  /** Bind props for the gesture target element */
  bind: () => React.HTMLAttributes<HTMLElement>;
}
```

---

## 6. Component Props

### AvatarEditorCanvasProps

```typescript
interface AvatarEditorCanvasProps {
  /** Image source URL */
  imageSrc: string;

  /** Crop/transform state */
  crop: Point;
  zoom: number;
  rotation: number;

  /** Aspect ratio */
  aspect: number;

  /** Crop shape */
  cropShape: 'round' | 'rect';

  /** CSS filter string for preview */
  cssFilters: string;

  /** Flip states (applied via CSS transform) */
  flipHorizontal: boolean;
  flipVertical: boolean;

  /** Callbacks */
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;

  /** Optional rotation gesture callback */
  onRotationGesture?: (angleDelta: number) => void;
}
```

### AvatarEditorControlsProps

```typescript
interface AvatarEditorControlsProps {
  // Current values
  zoom: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  brightness: number;
  contrast: number;
  saturation: number;

  // Feature flags
  enableRotation: boolean;
  enableFlip: boolean;
  enableFilters: boolean;

  // Callbacks
  onZoomChange: (zoom: number) => void;
  onRotationChange: (rotation: number) => void;
  onRotate90: (direction: 'cw' | 'ccw') => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
  onResetTransforms: () => void;
  onResetFilters: () => void;
  onResetAll: () => void;

  // State
  isDirty: boolean;
}
```

### AvatarEditorModalProps

```typescript
interface AvatarEditorModalProps {
  /** Whether modal is visible */
  isOpen: boolean;

  /** Close callback */
  onClose: () => void;

  /** Modal title */
  title?: string;

  /** Whether to show close confirmation when dirty */
  confirmOnClose?: boolean;

  /** Children (editor content) */
  children: React.ReactNode;

  /** Footer content (buttons) */
  footer?: React.ReactNode;
}
```

---

## 7. Validation Rules

### File Validation

```typescript
const VALIDATION = {
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  minDimensions: { width: 100, height: 100 },
  maxDimensions: { width: 8000, height: 8000 },
};

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateImageFile(file: File): ValidationResult;
function validateImageDimensions(width: number, height: number): ValidationResult;
```

### Value Constraints

| Property | Min | Max | Default |
|----------|-----|-----|---------|
| zoom | 0.5 | 3.0 | 1.0 |
| rotation | -180 | 180 | 0 |
| brightness | -100 | 100 | 0 |
| contrast | -100 | 100 | 0 |
| saturation | -100 | 100 | 0 |
| quality | 0.1 | 1.0 | 0.9 |
| maxOutputSize | 64 | 2048 | 512 |

---

## 8. State Transitions

```
┌─────────────┐
│   Initial   │
│  (no image) │
└──────┬──────┘
       │ loadImage()
       ▼
┌─────────────┐
│   Loading   │
│  (loading)  │
└──────┬──────┘
       │ image loaded
       ▼
┌─────────────┐     edit actions     ┌─────────────┐
│    Ready    │ ◄──────────────────► │    Dirty    │
│ (pristine)  │                      │  (changed)  │
└──────┬──────┘                      └──────┬──────┘
       │ resetAll()                         │ exportImage()
       └────────────────────────────────────┤
                                            ▼
                                   ┌─────────────┐
                                   │ Processing  │
                                   │ (exporting) │
                                   └──────┬──────┘
                                          │ complete
                                          ▼
                                   ┌─────────────┐
                                   │  Complete   │
                                   │ (file ready)│
                                   └─────────────┘
```

---

## 9. Event Flow

```
User Action          Hook/Component              Side Effect
───────────────────────────────────────────────────────────────
File selected    →   loadImage()             →   Create blob URL
                                             →   Load into Image element
                                             →   Get dimensions
                                             →   Update state

Zoom slider      →   setZoom()               →   Update state
                                             →   Trigger re-render
                                             →   react-easy-crop updates

Drag image       →   onCropChange()          →   Update pan state
                                             →   Update crop area

Pinch gesture    →   onZoomChange()          →   Update zoom state

Rotate button    →   rotate90('cw')          →   Add 90° to rotation
                                             →   Mark as dirty

Filter slider    →   setBrightness()         →   Update filter state
                 →   (debounced)             →   Update CSS filter string

Save button      →   exportImage()           →   Create canvas
                                             →   Apply transforms
                                             →   Apply filters
                                             →   Extract crop region
                                             →   Convert to Blob/File
                                             →   Call onSave callback

Cancel button    →   onCancel()              →   Show confirm if dirty
                                             →   Cleanup blob URLs
                                             →   Call onCancel callback
```
