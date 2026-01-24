/**
 * useAvatarEditor Hook
 *
 * Core state management hook for the Avatar Editor component.
 * Handles image loading, transforms, filters, and export.
 */

import { useReducer, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  EditorState,
  EditorAction,
  Point,
  Area,
  FilterState,
  ExportOptions,
  ExportResult,
  CropData,
  UseAvatarEditorReturn,
  DEFAULT_EDITOR_STATE,
  CONTROL_RANGES,
  SUPPORTED_IMAGE_TYPES,
  VALIDATION_CONSTRAINTS,
  DOWNSAMPLING_CONFIG,
  ValidationResult,
} from '../components/ui/AvatarEditor/types';

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate an image file
 */
export const validateImageFile = (file: File | null | undefined): ValidationResult => {
  // Validate file exists
  if (!file) {
    return {
      valid: false,
      error: 'No file selected.',
    };
  }

  // Validate file type exists and is string
  const fileType = file.type?.toString().toLowerCase() || '';
  if (!fileType) {
    return {
      valid: false,
      error: 'File type could not be determined. Please select an image file.',
    };
  }

  // Check file type
  if (!SUPPORTED_IMAGE_TYPES.includes(fileType as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
    return {
      valid: false,
      error: `Unsupported file type. Please use JPEG, PNG, WebP, or GIF.`,
    };
  }

  // Check file size
  if (!Number.isFinite(file.size) || file.size < 0) {
    return {
      valid: false,
      error: 'File size is invalid.',
    };
  }

  if (file.size > VALIDATION_CONSTRAINTS.maxFileSize) {
    const maxMB = VALIDATION_CONSTRAINTS.maxFileSize / (1024 * 1024);
    return {
      valid: false,
      error: `File is too large. Maximum size is ${maxMB}MB.`,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty.',
    };
  }

  return { valid: true };
};

/**
 * Validate image dimensions
 */
export const validateImageDimensions = (
  width: number,
  height: number
): ValidationResult => {
  const { minDimensions, maxDimensions } = VALIDATION_CONSTRAINTS;

  if (width < minDimensions.width || height < minDimensions.height) {
    return {
      valid: false,
      error: `Image is too small. Minimum size is ${minDimensions.width}x${minDimensions.height} pixels.`,
    };
  }

  if (width > maxDimensions.width || height > maxDimensions.height) {
    return {
      valid: false,
      error: `Image is too large. Maximum size is ${maxDimensions.width}x${maxDimensions.height} pixels.`,
    };
  }

  return { valid: true };
};

// =============================================================================
// Image Helpers
// =============================================================================

/**
 * Load an image and get its dimensions
 * Handles blob URLs, data URLs, and regular URLs with CORS
 */
const loadImageElement = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    // Validate input
    if (!src || typeof src !== 'string') {
      reject(new Error('Invalid image source'));
      return;
    }

    const img = new Image();

    // Only set crossOrigin for non-blob, non-data URLs
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    const onLoadSuccess = () => {
      img.onload = null;
      img.onerror = null;
      resolve(img);
    };

    const onLoadError = () => {
      img.onload = null;
      img.onerror = null;
      reject(new Error(`Failed to load image from source: ${src.substring(0, 50)}...`));
    };

    // Set handlers before src to catch immediate errors
    img.onload = onLoadSuccess;
    img.onerror = onLoadError;

    // Set src last
    img.src = src;

    // Timeout safeguard (5 seconds) in case image never loads
    const timeoutId = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      reject(new Error('Image load timeout'));
    }, 5000);
  });
};

/**
 * Convert a File to a data URL
 */
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Downsample an image to a maximum dimension while maintaining aspect ratio
 */
const downsampleImage = (
  img: HTMLImageElement,
  maxDimension: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const { naturalWidth, naturalHeight } = img;
      const scale = maxDimension / Math.max(naturalWidth, naturalHeight);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(naturalWidth * scale);
      canvas.height = Math.round(naturalHeight * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Use high-quality image scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Convert to data URL (JPEG for better performance with large images)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve(dataUrl);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Check if an image needs downsampling
 */
const needsDownsampling = (width: number, height: number): boolean => {
  return (
    width > DOWNSAMPLING_CONFIG.largeImageThreshold ||
    height > DOWNSAMPLING_CONFIG.largeImageThreshold
  );
};

// =============================================================================
// Reducer
// =============================================================================

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const normalizeRotation = (rotation: number): number => {
  let normalized = rotation % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
};

const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    // === Image Actions ===
    case 'SET_IMAGE':
      return {
        ...DEFAULT_EDITOR_STATE,
        imageSrc: action.payload.src,
        originalImageSrc: action.payload.originalSrc,
        originalDimensions: action.payload.dimensions,
        isDownsampled: action.payload.isDownsampled,
        isDownsampling: false,
        imageLoaded: true,
      };

    case 'IMAGE_LOADED':
      return { ...state, imageLoaded: true };

    case 'IMAGE_ERROR':
      return { ...state, error: action.payload, imageLoaded: false, isDownsampling: false };

    case 'CLEAR_IMAGE':
      return DEFAULT_EDITOR_STATE;

    case 'START_DOWNSAMPLING':
      return { ...state, isDownsampling: true };

    case 'FINISH_DOWNSAMPLING':
      return { ...state, isDownsampling: false };

    // === Transform Actions ===
    case 'SET_ZOOM':
      return {
        ...state,
        zoom: clamp(action.payload, CONTROL_RANGES.zoom.min, CONTROL_RANGES.zoom.max),
        isDirty: true,
      };

    case 'SET_PAN':
      return {
        ...state,
        pan: action.payload,
        isDirty: true,
      };

    case 'SET_ROTATION':
      return {
        ...state,
        rotation: clamp(
          action.payload,
          CONTROL_RANGES.rotation.min,
          CONTROL_RANGES.rotation.max
        ),
        isDirty: true,
      };

    case 'ROTATE_90': {
      const delta = action.payload === 'cw' ? 90 : -90;
      const newRotation = normalizeRotation(state.rotation + delta);
      return {
        ...state,
        rotation: newRotation,
        isDirty: true,
      };
    }

    case 'TOGGLE_FLIP_H':
      return {
        ...state,
        flipHorizontal: !state.flipHorizontal,
        isDirty: true,
      };

    case 'TOGGLE_FLIP_V':
      return {
        ...state,
        flipVertical: !state.flipVertical,
        isDirty: true,
      };

    // === Filter Actions ===
    case 'SET_BRIGHTNESS':
      return {
        ...state,
        brightness: clamp(
          action.payload,
          CONTROL_RANGES.brightness.min,
          CONTROL_RANGES.brightness.max
        ),
        isDirty: true,
      };

    case 'SET_CONTRAST':
      return {
        ...state,
        contrast: clamp(
          action.payload,
          CONTROL_RANGES.contrast.min,
          CONTROL_RANGES.contrast.max
        ),
        isDirty: true,
      };

    case 'SET_SATURATION':
      return {
        ...state,
        saturation: clamp(
          action.payload,
          CONTROL_RANGES.saturation.min,
          CONTROL_RANGES.saturation.max
        ),
        isDirty: true,
      };

    case 'SET_FILTERS':
      return {
        ...state,
        ...action.payload,
        isDirty: true,
      };

    // === Crop Actions ===
    case 'SET_CROP_AREA':
      return {
        ...state,
        croppedAreaPixels: action.payload,
      };

    // === Reset Actions ===
    case 'RESET_TRANSFORMS':
      return {
        ...state,
        zoom: CONTROL_RANGES.zoom.default,
        pan: { x: 0, y: 0 },
        rotation: CONTROL_RANGES.rotation.default,
        flipHorizontal: false,
        flipVertical: false,
        isDirty: state.brightness !== 0 || state.contrast !== 0 || state.saturation !== 0,
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        brightness: CONTROL_RANGES.brightness.default,
        contrast: CONTROL_RANGES.contrast.default,
        saturation: CONTROL_RANGES.saturation.default,
        isDirty:
          state.zoom !== 1 ||
          state.rotation !== 0 ||
          state.flipHorizontal ||
          state.flipVertical,
      };

    case 'RESET_ALL':
      return {
        ...state,
        zoom: CONTROL_RANGES.zoom.default,
        pan: { x: 0, y: 0 },
        rotation: CONTROL_RANGES.rotation.default,
        flipHorizontal: false,
        flipVertical: false,
        brightness: CONTROL_RANGES.brightness.default,
        contrast: CONTROL_RANGES.contrast.default,
        saturation: CONTROL_RANGES.saturation.default,
        isDirty: false,
      };

    // === Processing Actions ===
    case 'START_PROCESSING':
      return { ...state, isProcessing: true, error: null };

    case 'FINISH_PROCESSING':
      return { ...state, isProcessing: false };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isProcessing: false };

    default:
      return state;
  }
};

// =============================================================================
// Hook
// =============================================================================

export const useAvatarEditor = (): UseAvatarEditorReturn => {
  const [state, dispatch] = useReducer(editorReducer, DEFAULT_EDITOR_STATE);
  const blobUrlRef = useRef<string | null>(null);
  const originalBlobUrlRef = useRef<string | null>(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        try {
          URL.revokeObjectURL(blobUrlRef.current);
        } catch (e) {
          console.warn('Failed to revoke blob URL:', e);
        }
      }
      if (originalBlobUrlRef.current) {
        try {
          URL.revokeObjectURL(originalBlobUrlRef.current);
        } catch (e) {
          console.warn('Failed to revoke original blob URL:', e);
        }
      }
    };
  }, []);

  // === Image Actions ===
  const loadImage = useCallback(async (source: File | string): Promise<void> => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });

      let src: string;
      let isBlob = false;

      if (source instanceof File) {
        // Validate file
        const validation = validateImageFile(source);
        if (!validation.valid) {
          dispatch({ type: 'IMAGE_ERROR', payload: validation.error! });
          return;
        }

        // Convert to data URL (more stable than blob URLs)
        src = await fileToDataUrl(source);
      } else {
        src = source;
        isBlob = src.startsWith('blob:');
      }

      // Load image to get dimensions
      let img: HTMLImageElement;
      try {
        img = await loadImageElement(src);
      } catch (error) {
        // If blob URL failed (revoked), try to recover by creating a new blob URL if original is available
        throw error;
      }

      const { naturalWidth, naturalHeight } = img;

      // Validate dimensions
      const dimValidation = validateImageDimensions(naturalWidth, naturalHeight);
      if (!dimValidation.valid) {
        dispatch({ type: 'IMAGE_ERROR', payload: dimValidation.error! });
        return;
      }

      // Track original blob URL for later cleanup (keep it for export)
      if (isBlob) {
        // Replace previous blob reference
        if (originalBlobUrlRef.current && originalBlobUrlRef.current !== src) {
          try {
            URL.revokeObjectURL(originalBlobUrlRef.current);
          } catch (e) {
            console.warn('Failed to revoke previous blob URL:', e);
          }
        }
        originalBlobUrlRef.current = src;
      }

      // Check if image needs downsampling for preview
      let previewSrc = src;
      let isDownsampled = false;

      if (needsDownsampling(naturalWidth, naturalHeight)) {
        dispatch({ type: 'START_DOWNSAMPLING' });

        try {
          previewSrc = await downsampleImage(
            img,
            DOWNSAMPLING_CONFIG.previewMaxDimension
          );
          isDownsampled = true;

          // Store downsampled blob URL for cleanup (but not the original)
          if (previewSrc.startsWith('blob:')) {
            if (blobUrlRef.current) {
              try {
                URL.revokeObjectURL(blobUrlRef.current);
              } catch (e) {
                console.warn('Failed to revoke previous preview blob URL:', e);
              }
            }
            blobUrlRef.current = previewSrc;
          }
        } catch (error) {
          // If downsampling fails, use original (may be slow but still works)
          console.warn('Image downsampling failed, using original:', error);
          isDownsampled = false;
          previewSrc = src;
        }
      }

      dispatch({
        type: 'SET_IMAGE',
        payload: {
          src: previewSrc,
          originalSrc: src,
          dimensions: { width: naturalWidth, height: naturalHeight },
          isDownsampled,
        },
      });
    } catch (error) {
      dispatch({
        type: 'IMAGE_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load image',
      });
    }
  }, []);

  const clearImage = useCallback(() => {
    if (blobUrlRef.current) {
      try {
        URL.revokeObjectURL(blobUrlRef.current);
      } catch (e) {
        console.warn('Failed to revoke blob URL:', e);
      }
      blobUrlRef.current = null;
    }
    if (originalBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(originalBlobUrlRef.current);
      } catch (e) {
        console.warn('Failed to revoke original blob URL:', e);
      }
      originalBlobUrlRef.current = null;
    }
    dispatch({ type: 'CLEAR_IMAGE' });
  }, []);

  // === Transform Actions ===
  const setZoom = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', payload: zoom });
  }, []);

  const setPan = useCallback((pan: Point) => {
    dispatch({ type: 'SET_PAN', payload: pan });
  }, []);

  const setRotation = useCallback((rotation: number) => {
    dispatch({ type: 'SET_ROTATION', payload: rotation });
  }, []);

  const rotate90 = useCallback((direction: 'cw' | 'ccw') => {
    dispatch({ type: 'ROTATE_90', payload: direction });
  }, []);

  const toggleFlipH = useCallback(() => {
    dispatch({ type: 'TOGGLE_FLIP_H' });
  }, []);

  const toggleFlipV = useCallback(() => {
    dispatch({ type: 'TOGGLE_FLIP_V' });
  }, []);

  // === Filter Actions ===
  const setBrightness = useCallback((value: number) => {
    dispatch({ type: 'SET_BRIGHTNESS', payload: value });
  }, []);

  const setContrast = useCallback((value: number) => {
    dispatch({ type: 'SET_CONTRAST', payload: value });
  }, []);

  const setSaturation = useCallback((value: number) => {
    dispatch({ type: 'SET_SATURATION', payload: value });
  }, []);

  // === Crop Actions ===
  const setCropArea = useCallback((area: Area) => {
    dispatch({ type: 'SET_CROP_AREA', payload: area });
  }, []);

  // === Reset Actions ===
  const resetTransforms = useCallback(() => {
    dispatch({ type: 'RESET_TRANSFORMS' });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET_FILTERS' });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: 'RESET_ALL' });
  }, []);

  // === Export ===
  const exportImage = useCallback(
    async (options: ExportOptions = {}): Promise<ExportResult> => {
      // Use original image source for export (not downsampled preview)
      const exportSrc = state.originalImageSrc || state.imageSrc;
      if (!exportSrc || !state.croppedAreaPixels) {
        throw new Error('No image or crop area to export');
      }

      dispatch({ type: 'START_PROCESSING' });

      try {
        const {
          maxSize = 512,
          quality = 0.9,
          format = 'image/webp',
        } = options;

        // Load the original image for high-quality export
        let img: HTMLImageElement;
        try {
          img = await loadImageElement(exportSrc);
        } catch (error) {
          // If image fails to load, provide helpful error
          const errorMsg = error instanceof Error ? error.message : 'Failed to load image for export';
          throw new Error(`Cannot export image: ${errorMsg}`);
        }

        // If image was downsampled for preview, we need to scale the crop coordinates
        // back to the original image dimensions
        let scaleRatio = 1;
        if (state.isDownsampled && state.originalDimensions) {
          // Preview was scaled down to DOWNSAMPLING_CONFIG.previewMaxDimension
          const originalMaxDim = Math.max(
            state.originalDimensions.width,
            state.originalDimensions.height
          );
          scaleRatio = originalMaxDim / DOWNSAMPLING_CONFIG.previewMaxDimension;
        }

        // Create canvas for the final output
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          throw new Error('Could not get 2D canvas context');
        }

        const { croppedAreaPixels, rotation, flipHorizontal, flipVertical } = state;

        // Validate crop area
        if (
          croppedAreaPixels.width <= 0 ||
          croppedAreaPixels.height <= 0 ||
          !Number.isFinite(croppedAreaPixels.x) ||
          !Number.isFinite(croppedAreaPixels.y)
        ) {
          throw new Error('Invalid crop area dimensions');
        }

        // Scale crop coordinates from preview space to original image space
        const scaledCrop = {
          x: Math.round(croppedAreaPixels.x * scaleRatio),
          y: Math.round(croppedAreaPixels.y * scaleRatio),
          width: Math.round(croppedAreaPixels.width * scaleRatio),
          height: Math.round(croppedAreaPixels.height * scaleRatio),
        };

        // Clamp crop coordinates to image bounds
        scaledCrop.x = Math.max(0, Math.min(scaledCrop.x, img.naturalWidth - 1));
        scaledCrop.y = Math.max(0, Math.min(scaledCrop.y, img.naturalHeight - 1));
        scaledCrop.width = Math.min(scaledCrop.width, img.naturalWidth - scaledCrop.x);
        scaledCrop.height = Math.min(scaledCrop.height, img.naturalHeight - scaledCrop.y);

        // Calculate output dimensions (maintain aspect ratio, constrain to maxSize)
        let outputWidth = Math.max(1, scaledCrop.width);
        let outputHeight = Math.max(1, scaledCrop.height);

        if (outputWidth > maxSize || outputHeight > maxSize) {
          const scale = maxSize / Math.max(outputWidth, outputHeight);
          outputWidth = Math.round(outputWidth * scale);
          outputHeight = Math.round(outputHeight * scale);
        }

        // Ensure minimum canvas size
        outputWidth = Math.max(1, outputWidth);
        outputHeight = Math.max(1, outputHeight);

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        // Apply transformations
        ctx.save();

        try {
          // Apply filters (with error handling)
          const filterValues: string[] = [];
          if (state.brightness !== 0 && Number.isFinite(state.brightness)) {
            filterValues.push(`brightness(${100 + state.brightness}%)`);
          }
          if (state.contrast !== 0 && Number.isFinite(state.contrast)) {
            filterValues.push(`contrast(${100 + state.contrast}%)`);
          }
          if (state.saturation !== 0 && Number.isFinite(state.saturation)) {
            filterValues.push(`saturate(${100 + state.saturation}%)`);
          }
          if (filterValues.length > 0) {
            ctx.filter = filterValues.join(' ');
          }

          // Move to center for rotation
          ctx.translate(outputWidth / 2, outputHeight / 2);

          // Apply rotation
          if (rotation !== 0 && Number.isFinite(rotation)) {
            ctx.rotate((rotation * Math.PI) / 180);
          }

          // Apply flip
          const scaleX = flipHorizontal ? -1 : 1;
          const scaleY = flipVertical ? -1 : 1;
          ctx.scale(scaleX, scaleY);

          // Draw the cropped image centered (using scaled coordinates for original image)
          ctx.drawImage(
            img,
            scaledCrop.x,
            scaledCrop.y,
            scaledCrop.width,
            scaledCrop.height,
            -outputWidth / 2,
            -outputHeight / 2,
            outputWidth,
            outputHeight
          );
        } finally {
          ctx.restore();
        }

        // Convert to blob with timeout
        const blob = await new Promise<Blob>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Canvas blob conversion timeout'));
          }, 5000);

          canvas.toBlob(
            (b) => {
              clearTimeout(timeoutId);
              if (b && b.size > 0) {
                resolve(b);
              } else {
                reject(new Error('Failed to create image blob or blob is empty'));
              }
            },
            format,
            quality
          );
        });

        // Create File object with safe extension extraction
        let extension = 'webp'; // default
        try {
          const parts = format.split('/');
          if (parts.length === 2 && parts[1]) {
            extension = parts[1].toLowerCase().split(';')[0]; // Handle format strings with parameters
          }
        } catch (e) {
          console.warn('Failed to extract file extension, using default:', e);
        }

        // Ensure valid extension
        const validExtensions = ['webp', 'jpeg', 'jpg', 'png'];
        if (!validExtensions.includes(extension)) {
          extension = 'webp';
        }

        const file = new File([blob], `avatar.${extension}`, { type: format });

        // Create CropData for backend compatibility
        // Since we export a pre-cropped image, use centered values (50, 50)
        // with scale=1.0 to indicate no additional cropping needed
        const cropData: CropData = {
          crop_x: 50, // Centered - image is already cropped
          crop_y: 50, // Centered - image is already cropped
          crop_scale: 1.0, // No additional zoom - crop applied client-side
          rotation: rotation !== 0 ? rotation : undefined,
          flip_h: flipHorizontal || undefined,
          flip_v: flipVertical || undefined,
        };

        dispatch({ type: 'FINISH_PROCESSING' });

        return { file, cropData };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    [state]
  );

  // === Computed Values ===
  const cssFilters = useMemo(() => {
    const filters: string[] = [];
    if (state.brightness !== 0) {
      filters.push(`brightness(${100 + state.brightness}%)`);
    }
    if (state.contrast !== 0) {
      filters.push(`contrast(${100 + state.contrast}%)`);
    }
    if (state.saturation !== 0) {
      filters.push(`saturate(${100 + state.saturation}%)`);
    }
    return filters.length > 0 ? filters.join(' ') : 'none';
  }, [state.brightness, state.contrast, state.saturation]);

  const filters: FilterState = useMemo(
    () => ({
      brightness: state.brightness,
      contrast: state.contrast,
      saturation: state.saturation,
    }),
    [state.brightness, state.contrast, state.saturation]
  );

  const canSave = state.imageLoaded && state.croppedAreaPixels !== null && !state.isProcessing;

  return {
    // State
    imageSrc: state.imageSrc,
    imageLoaded: state.imageLoaded,
    isDownsampling: state.isDownsampling,
    isDownsampled: state.isDownsampled,
    zoom: state.zoom,
    pan: state.pan,
    rotation: state.rotation,
    flipHorizontal: state.flipHorizontal,
    flipVertical: state.flipVertical,
    filters,
    croppedAreaPixels: state.croppedAreaPixels,
    isDirty: state.isDirty,
    isProcessing: state.isProcessing,
    error: state.error,

    // Image Actions
    loadImage,
    clearImage,

    // Transform Actions
    setZoom,
    setPan,
    setRotation,
    rotate90,
    toggleFlipH,
    toggleFlipV,

    // Filter Actions
    setBrightness,
    setContrast,
    setSaturation,

    // Crop Actions
    setCropArea,

    // Reset Actions
    resetTransforms,
    resetFilters,
    resetAll,

    // Export
    exportImage,

    // Computed
    cssFilters,
    canSave,
  };
};

export default useAvatarEditor;
