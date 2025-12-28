/**
 * API Route Constants
 * Centralized API path definitions to avoid hardcoded strings throughout the codebase
 */

// Base paths
export const API_BASE = '/api/v1';

// Workspace paths
export const WORKSPACE_PATHS = {
    base: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}`,
    galleries: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/galleries`,
    gallery: (workspaceId: string, galleryId: string) => `${API_BASE}/workspaces/${workspaceId}/galleries/${galleryId}`,
    galleryCredentials: (workspaceId: string, galleryId: string) => `${API_BASE}/workspaces/${workspaceId}/galleries/${galleryId}/credentials`,
    companyProfile: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/company-profile`,
    settings: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/settings`,
    members: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/members`,
    clients: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/clients`,
} as const;

// Public paths
export const PUBLIC_PATHS = {
    profiles: (slug: string) => `${API_BASE}/public/profiles/${slug}`,
    galleries: (galleryId: string) => `${API_BASE}/public/galleries/${galleryId}`,
    vcard: (slug: string) => `${API_BASE}/public/profiles/${slug}/vcard`,
    qrCode: (slug: string) => `${API_BASE}/public/profiles/${slug}/qr-code`,
    logo: (slug: string, size: number = 256) => `${API_BASE}/public/profiles/${slug}/logo/${size}`,
} as const;

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

// Storage constants
export const STORAGE = {
    GB: 1024 ** 3,
    MB: 1024 ** 2,
    KB: 1024,
    FREE_TIER_LIMIT: 5 * (1024 ** 3), // 5GB
} as const;
