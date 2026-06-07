import { getApiBaseUrl } from "@/lib/api/base-url";
import type { Asset } from "./assets";
import { authFetch } from "./authFetch";

const API_BASE = getApiBaseUrl();

// WorkspaceLogoCropPosition is the persisted crop contract for the free-aspect
// (fit-to-contain) business logo. x/y are normalized offsets in -1..1; zoom
// starts at 1 (the whole logo). Mirrors the backend service.LogoCropPosition.
export interface WorkspaceLogoCropPosition {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkspaceLogoMetadata {
  asset_id?: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  storage_key?: string;
  storage_driver?: "r2" | string;
  // Set by the server-side crop pipeline: the kept original (re-cropped without
  // re-upload) and the last applied crop position.
  original_storage_key?: string;
  crop?: WorkspaceLogoCropPosition;
}

export type GalleryLogoPlacement =
  | "hidden"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type GalleryWatermarkStyle =
  | "none"
  | "subtle-corner"
  | "center-mark"
  | "tiled";

export interface GalleryBrandingDefaults {
  logo_placement: GalleryLogoPlacement;
  monogram: string;
  watermark_style: GalleryWatermarkStyle;
  logo_size: number;
  logo_opacity: number;
  watermark_text: string;
  watermark_opacity: number;
}

export const EMPTY_GALLERY_BRANDING_DEFAULTS: GalleryBrandingDefaults = {
  logo_placement: "top-left",
  monogram: "",
  watermark_style: "none",
  logo_size: 40,
  logo_opacity: 100,
  watermark_text: "",
  watermark_opacity: 70,
};

export interface WorkspaceProfile {
  name: string;
  gstin: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  brand_name: string;
  brand_accent_color: string;
  public_branding_enabled: boolean;
  logo_asset_id: string;
  logo_metadata: WorkspaceLogoMetadata;
  gallery_branding_defaults: GalleryBrandingDefaults;
  bank_name: string;
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_branch: string;
  signature_name: string;
  invoice_terms: string;
  invoice_footer: string;
  // Deprecated internal identity fields from migration 121. Backend-populated,
  // read-only on the dashboard, and no longer used to build public gallery URLs.
  business_profile_slug?: string;
  business_unique_code?: string;
}

export const EMPTY_WORKSPACE_PROFILE: WorkspaceProfile = {
  name: "",
  gstin: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: "",
  phone: "",
  email: "",
  website: "",
  logo_url: "",
  brand_name: "",
  brand_accent_color: "",
  public_branding_enabled: true,
  logo_asset_id: "",
  logo_metadata: {},
  gallery_branding_defaults: EMPTY_GALLERY_BRANDING_DEFAULTS,
  bank_name: "",
  bank_account_holder: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_branch: "",
  signature_name: "",
  invoice_terms: "",
  invoice_footer: "",
};

function normalizeWorkspaceProfile(body: Partial<WorkspaceProfile>): WorkspaceProfile {
  return {
    ...EMPTY_WORKSPACE_PROFILE,
    ...body,
    gallery_branding_defaults: {
      ...EMPTY_GALLERY_BRANDING_DEFAULTS,
      ...(body.gallery_branding_defaults ?? {}),
    },
    logo_metadata: {
      ...EMPTY_WORKSPACE_PROFILE.logo_metadata,
      ...(body.logo_metadata ?? {}),
    },
  };
}

export async function getWorkspaceProfile(
  token: string,
): Promise<WorkspaceProfile> {
  const res = await fetch(`${API_BASE}/api/v1/workspaces/current/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(`Failed to load workspace profile: ${res.status}`);
  const body = await res.json();
  return normalizeWorkspaceProfile(body);
}

export async function updateWorkspaceProfile(
  token: string,
  profile: Partial<WorkspaceProfile>,
): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE}/api/v1/workspaces/current/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Failed to save workspace profile: ${res.status}`);
  }
  return res.json();
}

export async function uploadWorkspaceLogo(
  token: string,
  file: File,
): Promise<Asset> {
  void token;
  const form = new FormData();
  form.append("file", file);

  const res = await authFetch("/api/v1/assets", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to upload studio logo: ${res.status}`);
  const body = await res.json();
  return body.asset ?? body.Asset ?? body;
}

// uploadWorkspaceLogoCrop uploads a raw logo image and asks the backend to
// render a free-aspect WebP brand mark at the given crop, returning the updated
// workspace profile (logo_asset_id / logo_url / logo_metadata pointed at the
// rendered mark). This is the crop-on-upload path that supersedes the raw
// uploadWorkspaceLogo + updateWorkspaceProfile two-step for the settings UI.
export async function uploadWorkspaceLogoCrop(
  token: string,
  file: File,
  position: WorkspaceLogoCropPosition,
): Promise<WorkspaceProfile> {
  void token;
  const form = new FormData();
  form.append("logo", file);
  form.append("x", String(position.x));
  form.append("y", String(position.y));
  form.append("zoom", String(position.zoom));

  const res = await authFetch("/api/v1/workspaces/current/logo/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to upload studio logo: ${res.status}`);
  }
  const body = await res.json();
  return normalizeWorkspaceProfile(body);
}

// cropWorkspaceLogo re-renders the workspace's stored ORIGINAL logo at a new
// crop position without requiring a re-upload, returning the updated profile.
export async function cropWorkspaceLogo(
  token: string,
  position: WorkspaceLogoCropPosition,
): Promise<WorkspaceProfile> {
  void token;
  const res = await authFetch("/api/v1/workspaces/current/logo/crop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(position),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to crop studio logo: ${res.status}`);
  }
  const body = await res.json();
  return normalizeWorkspaceProfile(body);
}
