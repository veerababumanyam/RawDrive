/**
 * Avatar Editor Component API Contract
 *
 * This file defines the public TypeScript interfaces for the AvatarEditor component.
 * These contracts should be stable and backward-compatible.
 *
 * @module @rawdrive/avatar-editor
 * @version 1.0.0
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
 * Rectangular area definition
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
   * @example 1 for square, 4/3 for landscape, 3/4 for portrait
   */
  aspectRatio?: number;

  /**
   * Shape of the crop area.
   * @default 'round'
   */
  cropShape?: CropShape;

  /**
   * Callback when user saves the edited image.
   * @param file - The processed image file
   * @param cropData - Optional metadata about the crop/transform
   */
  onSave: (file: File, cropData?: CropData) => void;

  /**
   * Callback when user cancels editing.
   */
  onCancel: () => void;

  /**
   * Maximum output dimension in pixels (applies to both width and height).
   * @default 512
   * @minimum 64
   * @maximum 2048
   */
  maxOutputSize?: number;

  /**
   * Output image quality (0-1).
   * Only applies to JPEG and WebP formats.
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
   * When true, disables save button and shows loading indicator.
   * @default false
   */
  isLoading?: boolean;

  /**
   * Enable brightness/contrast/saturation filter controls.
   * @default true
   */
  enableFilters?: boolean;

  /**
   * Enable rotation controls (90° buttons and free rotation slider).
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
 * Wraps AvatarEditor in a glassmorphism modal dialog.
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
// Hook Return Types
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

/**
 * Return type for useAvatarEditor hook
 */
export interface UseAvatarEditorReturn {
  // === State ===
  /** Current image source URL */
  imageSrc: string | null;
  /** Whether image has loaded */
  imageLoaded: boolean;
  /** Current zoom level */
  zoom: number;
  /** Current pan position */
  pan: Point;
  /** Current rotation angle */
  rotation: number;
  /** Horizontal flip state */
  flipHorizontal: boolean;
  /** Vertical flip state */
  flipVertical: boolean;
  /** Current filter values */
  filters: FilterState;
  /** Current crop area in pixels */
  croppedAreaPixels: Area | null;
  /** Whether any changes have been made */
  isDirty: boolean;
  /** Whether export is in progress */
  isProcessing: boolean;
  /** Error message if any */
  error: string | null;

  // === Image Actions ===
  /** Load an image from File or URL */
  loadImage: (source: File | string) => Promise<void>;
  /** Clear the current image */
  clearImage: () => void;

  // === Transform Actions ===
  /** Set zoom level (0.5 - 3.0) */
  setZoom: (zoom: number) => void;
  /** Set pan position */
  setPan: (pan: Point) => void;
  /** Set rotation angle (-180 to 180) */
  setRotation: (rotation: number) => void;
  /** Rotate by 90 degrees */
  rotate90: (direction: 'cw' | 'ccw') => void;
  /** Toggle horizontal flip */
  toggleFlipH: () => void;
  /** Toggle vertical flip */
  toggleFlipV: () => void;

  // === Filter Actions ===
  /** Set brightness (-100 to 100) */
  setBrightness: (value: number) => void;
  /** Set contrast (-100 to 100) */
  setContrast: (value: number) => void;
  /** Set saturation (-100 to 100) */
  setSaturation: (value: number) => void;

  // === Crop Actions ===
  /** Update crop area (called by Cropper component) */
  setCropArea: (area: Area) => void;

  // === Reset Actions ===
  /** Reset all transforms to defaults */
  resetTransforms: () => void;
  /** Reset all filters to defaults */
  resetFilters: () => void;
  /** Reset everything to initial state */
  resetAll: () => void;

  // === Export ===
  /** Export the edited image */
  exportImage: (options?: ExportOptions) => Promise<ExportResult>;

  // === Computed ===
  /** CSS filter string for preview */
  cssFilters: string;
  /** Whether save is possible */
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

export type SupportedImageType = typeof SUPPORTED_IMAGE_TYPES[number];

/**
 * File validation result
 */
export interface ValidationResult {
  /** Whether the file is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Validation constraints
 */
export const VALIDATION_CONSTRAINTS = {
  /** Maximum file size in bytes (10MB) */
  maxFileSize: 10 * 1024 * 1024,
  /** Minimum image dimensions */
  minDimensions: { width: 100, height: 100 },
  /** Maximum image dimensions */
  maxDimensions: { width: 8000, height: 8000 },
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
