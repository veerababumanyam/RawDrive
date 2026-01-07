/**
 * API version and base path
 */
export declare const API_VERSION = "v1";
export declare const API_BASE = "/api/v1";
/**
 * Workspace-scoped API paths
 */
export declare const WORKSPACE_PATHS: {
    readonly GALLERIES: (workspaceId: string) => string;
    readonly ASSETS: (workspaceId: string) => string;
    readonly UPLOADS: (workspaceId: string) => string;
    readonly INVITATIONS: (workspaceId: string) => string;
    readonly FACE_GROUPS: (workspaceId: string) => string;
    readonly MEMBERS: (workspaceId: string) => string;
    readonly ROLES: (workspaceId: string) => string;
    readonly COMPANY_PROFILE: (workspaceId: string) => string;
    readonly companyProfile: (workspaceId: string) => string;
};
/**
 * Public API paths (no auth required)
 */
export declare const PUBLIC_PATHS: {
    readonly GALLERY: (slug: string) => string;
    readonly INVITATION: (token: string) => string;
    readonly PROFILES: (slug: string) => string;
    readonly VCARD: (slug: string) => string;
    readonly QR_CODE: (slug: string) => string;
    readonly LOGO: (slug: string, size?: "sm" | "md" | "lg" | number) => string;
    readonly profiles: (slug: string) => string;
    readonly vcard: (slug: string) => string;
    readonly qrCode: (slug: string) => string;
    readonly logo: (slug: string, size?: "sm" | "md" | "lg" | number) => string;
};
//# sourceMappingURL=api.d.ts.map