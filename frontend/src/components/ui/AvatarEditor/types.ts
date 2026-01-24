/**
 * Avatar Editor Component Types
 *
 * TypeScript interfaces for the AvatarEditor component.
 * Backward-compatible with existing CropData interface.
 *
 * @module @rawdrive/avatar-editor
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * 2D coordinate point
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Rectangular area definition (from react-easy-crop)
 */
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Output crop metadata - backward compatible with existing backend API
 */
export interface CropData {
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

// =============================================================================
// Component Props
// =============================================================================

/**
 * Shape of the crop area
 */
export type CropShape = 'round' | 'rect';

/**
 * Supported output image formats
 */
export type OutputFormat = 'image/webp' | 'image/jpeg' | 'image/png';

/**
 * AvatarEditor component props
 */
export interface AvatarEditorProps {
  /**
   * Image file to edit.
   * Mutually exclusive with `imageSrc`.
   */
  file?: File | null;

  /**
   * Image source URL to edit.
   * Mutually exclusive with `file`.
   */
  imageSrc?: string;

  /**
   * Aspect ratio for the crop area.
   * @default 1 (square/circle)
   */
  aspectRatio?: number;

  /**
   * Shape of the crop area.
   * @default 'round'
   */
  cropShape?: CropShape;

  /**
   * Callback when user saves the edited image.
   */
  onSave: (file: File, cropData?: CropData) => void;

  /**
   * Callback when user cancels editing.
   */
  onCancel: () => void;

  /**
   * Maximum output dimension in pixels.
   * @default 512
   */
  maxOutputSize?: number;

  /**
   * Output image quality (0-1).
   * @default 0.9
   */
  quality?: number;

  /**
   * Output image format.
   * @default 'image/webp'
   */
  outputFormat?: OutputFormat;

  /**
   * External loading state (e.g., during upload to server).
   * @default false
   */
  isLoading?: boolean;

  /**
   * Enable brightness/contrast/saturation filter controls.
   * @default true
   */
  enableFilters?: boolean;

  /**
   * Enable rotation controls.
   * @default true
   */
  enableRotation?: boolean;

  /**
   * Enable horizontal/vertical flip controls.
   * @default true
   */
  enableFlip?: boolean;

  /**
   * Custom class name for the editor container.
   */
  className?: string;
}

// =============================================================================
// Modal Props
// =============================================================================

/**
 * AvatarEditorModal component props.
 */
export interface AvatarEditorModalProps extends AvatarEditorProps {
  /**
   * Whether the modal is visible.
   */
  isOpen: boolean;

  /**
   * Modal title.
   * @default "Edit Photo"
   */
  title?: string;

  /**
   * Show confirmation dialog when closing with unsaved changes.
   * @default true
   */
  confirmOnClose?: boolean;
}

// =============================================================================
// Internal State Types
// =============================================================================

/**
 * Filter state values
 */
export interface FilterState {
  /** Brightness adjustment (-100 to 100) */
  brightness: number;
  /** Contrast adjustment (-100 to 100) */
  contrast: number;
  /** Saturation adjustment (-100 to 100) */
  saturation: number;
}

/**
 * Transform state values
 */
export interface TransformState {
  /** Zoom level (0.5 to 3.0) */
  zoom: number;
  /** Pan position */
  pan: Point;
  /** Rotation angle in degrees (-180 to 180) */
  rotation: number;
  /** Horizontal flip state */
  flipHorizontal: boolean;
  /** Vertical flip state */
  flipVertical: boolean;
}

/**
 * Complete internal state of the editor
 */
export interface EditorState {
  // === Image State ===
  /** Data URL or blob URL of the image being edited (may be downsampled for preview) */
  imageSrc: string | null;
  /** Original full-resolution image source for export */
  originalImageSrc: string | null;
  /** Whether the image has finished loading */
  imageLoaded: boolean;
  /** Whether the image was downsampled for preview */
  isDownsampled: boolean;
  /** Whether downsampling is in progress */
  isDownsampling: boolean;
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
  /** Pixel coordinates of cropped area */
  croppedAreaPixels: Area | null;

  // === UI State ===
  /** Whether any changes have been made */
  isDirty: boolean;
  /** Whether image is being processed (export) */
  isProcessing: boolean;
  /** Error message if any */
  error: string | null;
}

// =============================================================================
// Action Types
// =============================================================================

export type EditorAction =
  // Image actions
  | { type: 'SET_IMAGE'; payload: { src: string; originalSrc: string; dimensions: { width: number; height: number }; isDownsampled: boolean } }
  | { type: 'IMAGE_LOADED' }
  | { type: 'IMAGE_ERROR'; payload: string }
  | { type: 'CLEAR_IMAGE' }
  | { type: 'START_DOWNSAMPLING' }
  | { type: 'FINISH_DOWNSAMPLING' }

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

// =============================================================================
// Export Options
// =============================================================================

/**
 * Options for image export
 */
export interface ExportOptions {
  /** Maximum output dimension */
  maxSize?: number;
  /** JPEG/WebP quality (0-1) */
  quality?: number;
  /** Output format */
  format?: OutputFormat;
}

/**
 * Result of image export
 */
export interface ExportResult {
  /** Processed image file */
  file: File;
  /** Crop/transform metadata */
  cropData: CropData;
}

// =============================================================================
// Hook Return Types
// =============================================================================

/**
 * Return type for useAvatarEditor hook
 */
export interface UseAvatarEditorReturn {
  // === State ===
  imageSrc: string | null;
  imageLoaded: boolean;
  isDownsampling: boolean;
  isDownsampled: boolean;
  zoom: number;
  pan: Point;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  filters: FilterState;
  croppedAreaPixels: Area | null;
  isDirty: boolean;
  isProcessing: boolean;
  error: string | null;

  // === Image Actions ===
  loadImage: (source: File | string) => Promise<void>;
  clearImage: () => void;

  // === Transform Actions ===
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setRotation: (rotation: number) => void;
  rotate90: (direction: 'cw' | 'ccw') => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;

  // === Filter Actions ===
  setBrightness: (value: number) => void;
  setContrast: (value: number) => void;
  setSaturation: (value: number) => void;

  // === Crop Actions ===
  setCropArea: (area: Area) => void;

  // === Reset Actions ===
  resetTransforms: () => void;
  resetFilters: () => void;
  resetAll: () => void;

  // === Export ===
  exportImage: (options?: ExportOptions) => Promise<ExportResult>;

  // === Computed ===
  cssFilters: string;
  canSave: boolean;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Supported image MIME types
 */
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/**
 * File validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validation constraints
 */
export const VALIDATION_CONSTRAINTS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  minDimensions: { width: 100, height: 100 },
  maxDimensions: { width: 8000, height: 8000 },
} as const;

/**
 * Image downsampling thresholds
 */
export const DOWNSAMPLING_CONFIG = {
  /** Images larger than this dimension will be downsampled for preview */
  largeImageThreshold: 4096,
  /** Maximum dimension for preview canvas */
  previewMaxDimension: 2048,
} as const;

// =============================================================================
// Constants
// =============================================================================

/**
 * Default values for editor props
 */
export const EDITOR_DEFAULTS = {
  aspectRatio: 1,
  cropShape: 'round' as CropShape,
  maxOutputSize: 512,
  quality: 0.9,
  outputFormat: 'image/webp' as OutputFormat,
  enableFilters: true,
  enableRotation: true,
  enableFlip: true,
} as const;

/**
 * Value ranges for controls
 */
export const CONTROL_RANGES = {
  zoom: { min: 0.5, max: 3, step: 0.01, default: 1 },
  rotation: { min: -180, max: 180, step: 1, default: 0 },
  brightness: { min: -100, max: 100, step: 1, default: 0 },
  contrast: { min: -100, max: 100, step: 1, default: 0 },
  saturation: { min: -100, max: 100, step: 1, default: 0 },
} as const;

/**
 * Default editor state
 */
export const DEFAULT_EDITOR_STATE: EditorState = {
  // Image
  imageSrc: null,
  originalImageSrc: null,
  imageLoaded: false,
  isDownsampled: false,
  isDownsampling: false,
  originalDimensions: null,

  // Transform
  zoom: CONTROL_RANGES.zoom.default,
  pan: { x: 0, y: 0 },
  rotation: CONTROL_RANGES.rotation.default,
  flipHorizontal: false,
  flipVertical: false,

  // Filters
  brightness: CONTROL_RANGES.brightness.default,
  contrast: CONTROL_RANGES.contrast.default,
  saturation: CONTROL_RANGES.saturation.default,

  // Crop
  croppedAreaPixels: null,

  // UI
  isDirty: false,
  isProcessing: false,
  error: null,
};

// =============================================================================
// Component Sub-Props
// =============================================================================

/**
 * AvatarEditorCanvas component props
 */
export interface AvatarEditorCanvasProps {
  imageSrc: string;
  crop: Point;
  zoom: number;
  rotation: number;
  aspect: number;
  cropShape: CropShape;
  cssFilters: string;
  flipHorizontal: boolean;
  flipVertical: boolean;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onRotationGesture?: (angleDelta: number) => void;
}

/**
 * AvatarEditorControls component props
 */
export interface AvatarEditorControlsProps {
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
