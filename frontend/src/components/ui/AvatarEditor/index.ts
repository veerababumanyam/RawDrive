/**
 * Avatar Editor Component
 *
 * A comprehensive, reusable avatar editing component with:
 * - Image cropping (circular and rectangular)
 * - Zoom, pan, rotation, and flip
 * - Brightness, contrast, and saturation filters
 * - Touch gesture support (pinch, pan, two-finger rotate)
 * - Keyboard accessibility
 * - Glassmorphism modal design
 *
 * @module @rawdrive/avatar-editor
 */

// Main Components
export { AvatarEditor } from './AvatarEditor';
export { AvatarEditorModal } from './AvatarEditorModal';
export { AvatarEditorCanvas } from './AvatarEditorCanvas';
export { AvatarEditorControls } from './AvatarEditorControls';

// Hooks
export { useAvatarEditor } from '../../../hooks/useAvatarEditor';
export { useImageTransform } from '../../../hooks/useImageTransform';
export { useTouchGestures } from '../../../hooks/useTouchGestures';

// Types
export type {
  // Core Types
  Point,
  Area,
  CropData,
  CropShape,
  OutputFormat,

  // Component Props
  AvatarEditorProps,
  AvatarEditorModalProps,
  AvatarEditorCanvasProps,
  AvatarEditorControlsProps,

  // State Types
  FilterState,
  TransformState,
  EditorState,
  EditorAction,

  // Export Types
  ExportOptions,
  ExportResult,

  // Hook Return Types
  UseAvatarEditorReturn,

  // Validation
  ValidationResult,
  SupportedImageType,
} from './types';

// Constants
export {
  SUPPORTED_IMAGE_TYPES,
  VALIDATION_CONSTRAINTS,
  EDITOR_DEFAULTS,
  CONTROL_RANGES,
  DEFAULT_EDITOR_STATE,
} from './types';
