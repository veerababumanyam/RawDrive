/**
 * API Route Constants
 * Centralized API path definitions to avoid hardcoded strings throughout the codebase
 */

import {
    API_BASE as SHARED_API_BASE,
    API_VERSION as SHARED_API_VERSION,
    WORKSPACE_PATHS as SHARED_WORKSPACE_PATHS,
    PUBLIC_PATHS as SHARED_PUBLIC_PATHS,
    STORAGE as SHARED_STORAGE,
    FILE_LIMITS,
    STORAGE_KEYS,
    AI_THRESHOLDS,
    PAGINATION,
    RATE_LIMITS,
} from '@rawdrive/shared-constants';

/**
 * @deprecated Prefer importing directly from @rawdrive/shared-constants.
 * These exports alias the shared package for backward compatibility.
 */
export const API_VERSION = SHARED_API_VERSION;
export const API_BASE = SHARED_API_BASE;
export const WORKSPACE_PATHS = SHARED_WORKSPACE_PATHS;
export const PUBLIC_PATHS = SHARED_PUBLIC_PATHS;
export const STORAGE = { ...SHARED_STORAGE, FREE_TIER_LIMIT: 5 * SHARED_STORAGE.GB };
export { FILE_LIMITS, STORAGE_KEYS, AI_THRESHOLDS, PAGINATION, RATE_LIMITS };

// Auth paths
export const AUTH_PATHS = {
    login: `${API_BASE}/auth/login`,
    signup: `${API_BASE}/auth/signup`,
    logout: `${API_BASE}/auth/logout`,
    refresh: `${API_BASE}/auth/refresh`,
} as const;

// Frontend route constants
export const ROUTE_PATHS = {
    workspace: {
        dashboard: '/workspace',
        galleries: '/workspace/galleries',
        settings: '/workspace/settings',
        profile: '/workspace/settings/profile',
        help: '/workspace/help',
    },
    public: {
        profile: (slug: string) => `/p/${slug}`,
        gallery: (galleryId: string) => `/g/${galleryId}`,
    },
    auth: {
        signin: '/signin',
        signup: '/signup',
    },
} as const;
