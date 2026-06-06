import { getApiBaseUrl } from "@/lib/api/base-url";
import type { Asset } from "./assets";
import { authFetch } from "./authFetch";

const API_BASE = getApiBaseUrl();

export interface WorkspaceLogoMetadata {
  asset_id?: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  storage_key?: string;
  storage_driver?: "r2" | string;
}

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
  bank_name: "",
  bank_account_holder: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_branch: "",
  signature_name: "",
  invoice_terms: "",
  invoice_footer: "",
};

export async function getWorkspaceProfile(
  token: string,
): Promise<WorkspaceProfile> {
  const res = await fetch(`${API_BASE}/api/v1/workspaces/current/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(`Failed to load workspace profile: ${res.status}`);
  const body = await res.json();
  return { ...EMPTY_WORKSPACE_PROFILE, ...body };
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
