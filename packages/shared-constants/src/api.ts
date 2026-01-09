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
  PERSONAL_PROFILE: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/personal-profiles`,
  personalProfile: (workspaceId: string) => `${API_BASE}/workspaces/${workspaceId}/personal-profiles`,
} as const;

/**
 * Public API paths (no auth required)
 */
export const PUBLIC_PATHS = {
  GALLERY: (slug: string) => `${API_BASE}/public/galleries/${slug}`,
  INVITATION: (token: string) => `${API_BASE}/public/invitations/${token}`,
  // Company profiles (legacy paths)
  PROFILES: (slug: string) => `${API_BASE}/public/profiles/${slug}`,
  VCARD: (slug: string) => `${API_BASE}/public/profiles/${slug}/vcard`,
  QR_CODE: (slug: string) => `${API_BASE}/public/profiles/${slug}/qr-code`,
  LOGO: (slug: string, size?: 'sm' | 'md' | 'lg' | number) => `${API_BASE}/public/profiles/${slug}/logo${size ? `/${size}` : ''}`,
  profiles: (slug: string) => `${API_BASE}/public/profiles/${slug}`,
  vcard: (slug: string) => `${API_BASE}/public/profiles/${slug}/vcard`,
  qrCode: (slug: string) => `${API_BASE}/public/profiles/${slug}/qr-code`,
  logo: (slug: string, size?: 'sm' | 'md' | 'lg' | number) => `${API_BASE}/public/profiles/${slug}/logo${size ? `/${size}` : ''}`,
  // Personal profiles (Digital Visiting Cards)
  PERSONAL_PROFILE: (slug: string) => `${API_BASE}/public/personal-profiles/${slug}`,
  PERSONAL_VCARD: (slug: string) => `${API_BASE}/public/personal-profiles/${slug}/vcard`,
  PERSONAL_QR_CODE: (slug: string) => `${API_BASE}/public/personal-profiles/${slug}/qr-code`,
  PERSONAL_AVATAR: (slug: string, size?: 64 | 128 | 256 | 512) => `${API_BASE}/public/personal-profiles/${slug}/avatar${size ? `/${size}` : '/256'}`,
  personalProfile: (slug: string) => `${API_BASE}/public/personal-profiles/${slug}`,
  personalVcard: (slug: string) => `${API_BASE}/public/personal-profiles/${slug}/vcard`,
  personalQrCode: (slug: string) => `${API_BASE}/public/personal-profiles/${slug}/qr-code`,
  personalAvatar: (slug: string, size?: 64 | 128 | 256 | 512) => `${API_BASE}/public/personal-profiles/${slug}/avatar${size ? `/${size}` : '/256'}`,
} as const;
