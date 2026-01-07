/**
 * Lazy Face API Loader
 *
 * Dynamically imports face-api.js to reduce main bundle size.
 * The face-api.js library is ~1.5MB minified and should only be loaded
 * when face detection features are actually needed (e.g., PeoplePage, Lightbox).
 *
 * This module provides async access to face-api.js functionality with caching
 * to ensure the library is only loaded once per session.
 */

// Types from face-api.js (we define these to avoid importing the library at the top level)
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  box: Box;
  score: number;
  landmarks?: { x: number; y: number }[];
  descriptor?: Float32Array;
}

// Cache for the loaded face-api module
let faceapiModule: typeof import('face-api.js') | null = null;
let loadPromise: Promise<typeof import('face-api.js')> | null = null;

/**
 * Dynamically loads the face-api.js library.
 * Returns cached module if already loaded.
 */
export async function loadFaceApi(): Promise<typeof import('face-api.js')> {
  // Return cached module if available
  if (faceapiModule) {
    return faceapiModule;
  }

  // Return existing promise if already loading
  if (loadPromise) {
    return loadPromise;
  }

  // Start loading the module
  loadPromise = import('face-api.js')
    .then((module) => {
      faceapiModule = module;
      console.log('[FaceApiLoader] face-api.js loaded successfully');
      return module;
    })
    .catch((error) => {
      loadPromise = null; // Allow retry on failure
      console.error('[FaceApiLoader] Failed to load face-api.js:', error);
      throw error;
    });

  return loadPromise;
}

/**
 * Check if face-api.js is already loaded
 */
export function isFaceApiLoaded(): boolean {
  return faceapiModule !== null;
}

/**
 * Get the cached face-api module (throws if not loaded)
 */
export function getFaceApi(): typeof import('face-api.js') {
  if (!faceapiModule) {
    throw new Error('face-api.js not loaded. Call loadFaceApi() first.');
  }
  return faceapiModule;
}

/**
 * Preload face-api.js in the background (useful for anticipated usage)
 */
export function preloadFaceApi(): void {
  if (!faceapiModule && !loadPromise) {
    loadFaceApi().catch(() => {
      // Silently ignore preload errors
    });
  }
}
