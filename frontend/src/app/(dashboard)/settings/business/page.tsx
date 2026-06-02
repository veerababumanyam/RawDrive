"use client";

import { useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  EMPTY_WORKSPACE_PROFILE,
  getWorkspaceProfile,
  updateWorkspaceProfile,
  uploadWorkspaceLogo,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";

const inputClass = "input-base w-full";

export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<WorkspaceProfile>(EMPTY_WORKSPACE_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getWorkspaceProfile(token)
      .then((data) => setProfile({ ...EMPTY_WORKSPACE_PROFILE, ...data }))
      .catch(() => setProfile(EMPTY_WORKSPACE_PROFILE))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const token = getStoredAccessToken();
      if (!token) throw new Error("Your session expired. Please log in again.");
      await updateWorkspaceProfile(token, profile);
      setSavedNotice("Saved. Gallery, invoice, email, and share previews now use this studio identity.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const setText = (key: keyof WorkspaceProfile) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setProfile((current) => ({ ...current, [key]: event.target.value }));

  const setBool = (key: keyof WorkspaceProfile) => (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => setProfile((current) => ({ ...current, [key]: event.target.checked }));

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    const token = getStoredAccessToken();
    if (!token) {
      setError("Your session expired. Please log in again.");
      return;
    }
    setLogoUploading(true);
    setError(null);
    setSavedNotice(null);
    try {
      const asset = await uploadWorkspaceLogo(token, file);
      await updateWorkspaceProfile(token, { logo_asset_id: asset.id });
      const nextProfile = await getWorkspaceProfile(token);
      setProfile(nextProfile);
      setSavedNotice("Studio logo uploaded and linked to your public brand.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setLogoUploading(true);
    setError(null);
    try {
      await updateWorkspaceProfile(token, { logo_asset_id: "" });
      setProfile((current) => ({ ...current, logo_asset_id: "", logo_url: "", logo_metadata: {} }));
      setSavedNotice("Studio logo removed from public branding.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const studioBrandName = profile.brand_name || profile.name || "Your Studio";
  const accentColor = profile.brand_accent_color || "#2563EB";
  const logoFilename = profile.logo_metadata?.filename || (profile.logo_asset_id ? "Uploaded logo" : "");
  const logoPreviewSource = profile.logo_url || profile.logo_metadata?.storage_key || "";
  const logoPreviewUrl = logoPreviewSource ? getStorageBackedUrl(logoPreviewSource, getStoredAccessToken()) : "";
  const businessSubdomain = profile.business_profile_slug && profile.business_unique_code
    ? `${profile.business_profile_slug}-${profile.business_unique_code}.rawdrive.in`
    : "";
  const businessSubdomainUrl = businessSubdomain ? `https://${businessSubdomain}` : "";

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="h-96 animate-pulse rounded-xl bg-surface-sunken" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {savedNotice && (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {savedNotice}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Business Profile</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Keep one studio identity for CRM, galleries, invoices, email, and share links.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border-default bg-surface-raised p-6">
        <h2 className="text-lg font-semibold text-text-primary">Studio Identity</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Studio name
            <input type="text" value={profile.name} onChange={setText("name")} className={inputClass} placeholder="e.g. Pho Pro Studio" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            GSTIN
            <input type="text" value={profile.gstin} onChange={setText("gstin")} className={inputClass} placeholder="15-char GSTIN" maxLength={15} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Address line 1
            <input type="text" value={profile.address_line1} onChange={setText("address_line1")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Address line 2
            <input type="text" value={profile.address_line2} onChange={setText("address_line2")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            City / State
            <input type="text" value={profile.city} onChange={setText("city")} className={inputClass} placeholder="Hyderabad, Telangana" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Postal code
            <input type="text" value={profile.postal_code} onChange={setText("postal_code")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Phone
            <input type="tel" value={profile.phone} onChange={setText("phone")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Billing email
            <input type="email" value={profile.email} onChange={setText("email")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
            Website
            <input type="url" value={profile.website} onChange={setText("website")} className={inputClass} placeholder="https://example.com" />
          </label>
          {businessSubdomainUrl && (
            <div className="rounded-2xl border border-border-default bg-surface-sunken px-4 py-3 sm:col-span-2">
              <p className="text-xs font-medium text-text-primary">Public subdomain address</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <a
                  href={businessSubdomainUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sm font-medium text-accent hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-border-focus"
                >
                  {businessSubdomainUrl}
                </a>
                <span className="text-xs text-text-tertiary">
                  Published galleries appear under this address.
                </span>
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Public brand name
            <input type="text" value={profile.brand_name} onChange={setText("brand_name")} className={inputClass} placeholder={profile.name || "Studio name shown to clients"} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Brand accent color
            <input type="text" value={profile.brand_accent_color} onChange={setText("brand_accent_color")} className={inputClass} placeholder="#B7791F" />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-sunken px-4 py-3 text-xs text-text-secondary sm:col-span-2">
            <input
              type="checkbox"
              checked={profile.public_branding_enabled}
              onChange={setBool("public_branding_enabled")}
              className="h-4 w-4 accent-primary"
            />
            Show studio branding on public galleries
          </label>
          <div className="rounded-2xl border border-border-default bg-surface-sunken p-4 sm:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border-default bg-surface-raised">
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt={`${studioBrandName} logo preview`}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-2xl font-semibold text-text-tertiary" aria-hidden="true">
                      {studioBrandName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-primary">Studio logo</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {logoFilename || "Upload a transparent PNG, JPEG, WebP, or SVG logo. It is stored as an authenticated asset."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(event) => void uploadLogo(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  className="btn-tertiary px-4 py-2 text-sm"
                >
                  {logoUploading ? "Uploading..." : "Upload studio logo"}
                </button>
                {profile.logo_asset_id && (
                  <button
                    type="button"
                    onClick={() => void removeLogo()}
                    disabled={logoUploading}
                    className="btn-tertiary px-4 py-2 text-sm text-danger"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border-default bg-surface-raised p-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Brand Preview</h2>
          <p className="text-xs text-text-secondary">
            One identity propagates to the client-facing gallery workspace and transactional surfaces.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["Gallery preview", `${studioBrandName} presents a polished public gallery header.`],
            ["Invoice preview", `${studioBrandName} appears above GST, terms, and payment instructions.`],
            ["Email signature", `Delivery emails sign off as ${studioBrandName}.`],
            ["Share card", `WhatsApp and email shares inherit the gallery cover and studio name.`],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-border-default bg-surface-sunken p-4">
              <div className="mb-3 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
              <p className="text-sm font-semibold text-text-primary">{title}</p>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border-default bg-surface-raised p-6">
        <h2 className="text-lg font-semibold text-text-primary">Bank Details</h2>
        <p className="text-xs text-text-secondary">
          Shown on invoices only. These private tax and banking fields never appear in public gallery branding.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Bank name
            <input type="text" value={profile.bank_name} onChange={setText("bank_name")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Account holder
            <input type="text" value={profile.bank_account_holder} onChange={setText("bank_account_holder")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Account number
            <input type="text" value={profile.bank_account_number} onChange={setText("bank_account_number")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            IFSC
            <input type="text" value={profile.bank_ifsc} onChange={setText("bank_ifsc")} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
            Branch
            <input type="text" value={profile.bank_branch} onChange={setText("bank_branch")} className={inputClass} />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border-default bg-surface-raised p-6">
        <h2 className="text-lg font-semibold text-text-primary">Invoice Customization</h2>
        <div className="grid grid-cols-1 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Signature name
            <input type="text" value={profile.signature_name} onChange={setText("signature_name")} className={inputClass} placeholder="Authorized Signatory" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Terms & conditions
            <textarea
              value={profile.invoice_terms}
              onChange={setText("invoice_terms")}
              className={`${inputClass} min-h-32 resize-y`}
              placeholder={"Payment due within 15 days.\n18% GST applicable.\nDisputes subject to local jurisdiction."}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Invoice footer note
            <input type="text" value={profile.invoice_footer} onChange={setText("invoice_footer")} className={inputClass} placeholder="Thank you for your business." />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary px-6 py-3 text-sm"
        >
          {saving ? "Saving..." : "Save business profile"}
        </button>
      </div>
    </div>
  );
}
