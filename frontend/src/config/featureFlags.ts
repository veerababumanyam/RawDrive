export type FeatureFlagKey = 'aiFilterSimplify' | 'uploadMicroservice';

export interface FeatureFlags {
  aiFilterSimplify: boolean;
  uploadMicroservice: boolean;
}

const defaultFlags: FeatureFlags = {
  aiFilterSimplify: false,
  uploadMicroservice: false,
};

export const featureFlags: FeatureFlags = {
  aiFilterSimplify: import.meta.env.VITE_FEATURE_AI_FILTER_SIMPLIFY === 'true' || defaultFlags.aiFilterSimplify,
  uploadMicroservice: import.meta.env.VITE_FEATURE_UPLOAD_MICROSERVICE === 'true' || defaultFlags.uploadMicroservice,
};

/**
 * Get the upload service URL.
 * When uploadMicroservice flag is enabled, uses VITE_UPLOAD_SERVICE_URL.
 * Otherwise falls back to the main API URL.
 */
export function getUploadServiceUrl(): string {
  if (featureFlags.uploadMicroservice && import.meta.env.VITE_UPLOAD_SERVICE_URL) {
    return import.meta.env.VITE_UPLOAD_SERVICE_URL;
  }
  // Fall back to main API URL
  return import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:8000';
}
