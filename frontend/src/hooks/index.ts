/* =============================================================================
   Custom Hooks - Central Export
   ============================================================================= */

export { useTheme, ThemeProvider, useThemeContext } from './useTheme';
export type { Theme, ResolvedTheme, ThemeProviderProps } from './useTheme';

export { useReducedMotion } from './useReducedMotion';
export { useFocusTrap } from './useFocusTrap';
export { useIntersectionObserver } from './useIntersectionObserver';

export { useGallery, useGalleryList } from './useGallery';
export { useGalleryAssets } from './useGalleryAssets';
export { useUpload } from './useUpload';
export type { UseUploadOptions, UseUploadReturn, UploadFile, UploadProgress } from './useUpload';
