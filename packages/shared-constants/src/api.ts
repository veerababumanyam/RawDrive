/**
 * API version and base path
 */
export const API_VERSION = 'v1';
export const API_BASE = `/api/${API_VERSION}`;

/**
 * Workspace-scoped API paths
 */
export const WORKSPACE_PATHS = {
  GALLERIES: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/galleries`,
  ASSETS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/assets`,
  UPLOADS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/uploads`,
  INVITATIONS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/digital-invitations`,
  FACE_GROUPS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/face-groups`,
  MEMBERS: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/members`,
  ROLES: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/roles`,
  COMPANY_PROFILE: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/company-profile`,
  companyProfile: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/company-profile`,
} as const;

/**
 * Public API paths (no auth required)
 */
export const PUBLIC_PATHS = {
  GALLERY: (slug: string) => `${API_BASE}/public/galleries/${slug}`,
  INVITATION: (token: string) => `${API_BASE}/public/invitations/${token}`,
  PROFILES: (slug: string) => `${API_BASE}/public/profiles/${slug}`,
  VCARD: (slug: string) => `${API_BASE}/public/profiles/${slug}/vcard`,
  QR_CODE: (slug: string) => `${API_BASE}/public/profiles/${slug}/qr-code`,
  LOGO: (slug: string, size?: 'sm' | 'md' | 'lg' | number) => `${API_BASE}/public/profiles/${slug}/logo${size ? `/${size}` : ''}`,
  profiles: (slug: string) => `${API_BASE}/public/profiles/${slug}`,
  vcard: (slug: string) => `${API_BASE}/public/profiles/${slug}/vcard`,
  qrCode: (slug: string) => `${API_BASE}/public/profiles/${slug}/qr-code`,
  logo: (slug: string, size?: 'sm' | 'md' | 'lg' | number) => `${API_BASE}/public/profiles/${slug}/logo${size ? `/${size}` : ''}`,
} as const;
