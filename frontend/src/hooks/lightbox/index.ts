/**
 * Lightbox Hooks
 * Reusable, auth-agnostic hooks for lightbox functionality.
 * Designed for use by both workspace Lightbox and public GalleryPlayer.
 */

export { useLightboxZoom, type UseLightboxZoomOptions, type UseLightboxZoomReturn, type ZoomState } from './useLightboxZoom';
export { useLightboxNavigation, type UseLightboxNavigationOptions, type UseLightboxNavigationReturn } from './useLightboxNavigation';
export { useImagePreloader, type UseImagePreloaderOptions } from './useImagePreloader';
export { useLightboxSlideshow, type SlideshowSettings, type KenBurnsTransform, type UseLightboxSlideshowOptions, type UseLightboxSlideshowReturn } from './useLightboxSlideshow';
export { useLightboxGestures, type UseLightboxGesturesOptions, type UseLightboxGesturesReturn } from './useLightboxGestures';
export { useLightboxCompare, type CompareZoomState, type UseLightboxCompareOptions, type UseLightboxCompareReturn } from './useLightboxCompare';
