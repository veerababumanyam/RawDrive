/**
 * API version and base path
 */
export const API_VERSION = 'v1';
export const API_BASE = `/api/${API_VERSION}`;
/**
 * Workspace-scoped API paths
 */
export const WORKSPACE_PATHS = {
    GALLERIES: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/galleries`,
    ASSETS: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/assets`,
    UPLOADS: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/uploads`,
    INVITATIONS: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/digital-invitations`,
    FACE_GROUPS: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/face-groups`,
    MEMBERS: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/members`,
    ROLES: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/roles`,
    COMPANY_PROFILE: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/company-profile`,
    companyProfile: (workspaceId) => `${API_BASE}/workspaces/${workspaceId}/company-profile`,
};
/**
 * Public API paths (no auth required)
 */
export const PUBLIC_PATHS = {
    GALLERY: (slug) => `${API_BASE}/public/galleries/${slug}`,
    INVITATION: (token) => `${API_BASE}/public/invitations/${token}`,
    PROFILES: (slug) => `${API_BASE}/public/profiles/${slug}`,
    VCARD: (slug) => `${API_BASE}/public/profiles/${slug}/vcard`,
    QR_CODE: (slug) => `${API_BASE}/public/profiles/${slug}/qr-code`,
    LOGO: (slug, size) => `${API_BASE}/public/profiles/${slug}/logo${size ? `/${size}` : ''}`,
    profiles: (slug) => `${API_BASE}/public/profiles/${slug}`,
    vcard: (slug) => `${API_BASE}/public/profiles/${slug}/vcard`,
    qrCode: (slug) => `${API_BASE}/public/profiles/${slug}/qr-code`,
    logo: (slug, size) => `${API_BASE}/public/profiles/${slug}/logo${size ? `/${size}` : ''}`,
};
