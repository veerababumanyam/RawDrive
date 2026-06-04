"use client";

import { useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  ArrowUpTray,
  Banknote,
  Building2,
  CheckCircle,
  Palette,
  ReceiptText,
  Trash,
} from "@/components/icons";
import {
  EMPTY_WORKSPACE_PROFILE,
  getWorkspaceProfile,
  updateWorkspaceProfile,
  uploadWorkspaceLogo,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { viewportThemeColors } from "@/lib/tokens";
import { GlassButton } from "@/components/ui/glass-button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  SettingsAlert,
  SettingsPageHeader,
  SettingsPageShell,
  SettingsPanel,
} from "../_components/settings-page-shell";

const inputClass = "input-base settings-input";

export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<WorkspaceProfile>(
    EMPTY_WORKSPACE_PROFILE,
  );
  const [loading, setLoading] = useState(() => Boolean(getStoredAccessToken()));
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
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
      setSavedNotice(
        "Saved. Gallery, invoice, email, and share previews now use this studio identity.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const setText =
    (key: keyof WorkspaceProfile) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProfile((current) => ({ ...current, [key]: event.target.value }));

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
      setProfile((current) => ({
        ...current,
        logo_asset_id: "",
        logo_url: "",
        logo_metadata: {},
      }));
      setSavedNotice("Studio logo removed from public branding.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoUploading(false);
    }
  };

  const studioBrandName = profile.brand_name || profile.name || "Your Studio";
  const accentColor =
    profile.brand_accent_color || viewportThemeColors.publicGallery;
  const logoFilename =
    profile.logo_metadata?.filename ||
    (profile.logo_asset_id ? "Uploaded logo" : "");
  const logoPreviewSource =
    profile.logo_url || profile.logo_metadata?.storage_key || "";
  const logoPreviewUrl = logoPreviewSource
    ? getStorageBackedUrl(logoPreviewSource, getStoredAccessToken())
    : "";
  const businessSubdomain =
    profile.business_profile_slug && profile.business_unique_code
      ? `${profile.business_profile_slug}-${profile.business_unique_code}.rawdrive.in`
      : "";
  const businessSubdomainUrl = businessSubdomain
    ? `https://${businessSubdomain}`
    : "";

  if (loading) {
    return (
      <SettingsPageShell>
        <div className="settings-panel settings-loading-panel settings-loading-panel--large" />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        eyebrow="Business"
        title="Business Profile"
        badge={
          <span
            className={
              profile.public_branding_enabled
                ? "status-badge status-badge--success"
                : "status-badge status-badge--neutral"
            }
          >
            {profile.public_branding_enabled ? "Branding visible" : "Private"}
          </span>
        }
        description="Keep one studio identity for CRM, galleries, invoices, email, and share links."
        actions={
          <GlassButton
            type="button"
            variant="primary"
            icon={<CheckCircle />}
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving" : "Save"}
          </GlassButton>
        }
      />

      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {savedNotice && (
        <SettingsAlert tone="success">{savedNotice}</SettingsAlert>
      )}

      <SettingsPanel
        title="Studio Identity"
        description="These details travel into public galleries, invoices, client emails, and share previews."
        icon={<Building2 />}
      >
        <div className="settings-form-grid settings-form-grid--two">
          <label className="settings-form-field">
            Studio name
            <input
              type="text"
              value={profile.name}
              onChange={setText("name")}
              className={inputClass}
              placeholder="e.g. Pho Pro Studio"
            />
          </label>
          <label className="settings-form-field">
            GSTIN
            <input
              type="text"
              value={profile.gstin}
              onChange={setText("gstin")}
              className={inputClass}
              placeholder="15-char GSTIN"
              maxLength={15}
            />
          </label>
          <label className="settings-form-field">
            Address line 1
            <input
              type="text"
              value={profile.address_line1}
              onChange={setText("address_line1")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field">
            Address line 2
            <input
              type="text"
              value={profile.address_line2}
              onChange={setText("address_line2")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field">
            City / State
            <input
              type="text"
              value={profile.city}
              onChange={setText("city")}
              className={inputClass}
              placeholder="Hyderabad, Telangana"
            />
          </label>
          <label className="settings-form-field">
            Postal code
            <input
              type="text"
              value={profile.postal_code}
              onChange={setText("postal_code")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field">
            Phone
            <input
              type="tel"
              value={profile.phone}
              onChange={setText("phone")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field">
            Billing email
            <input
              type="email"
              value={profile.email}
              onChange={setText("email")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field settings-form-field--full">
            Website
            <input
              type="url"
              value={profile.website}
              onChange={setText("website")}
              className={inputClass}
              placeholder="https://example.com"
            />
          </label>
          {businessSubdomainUrl && (
            <div className="settings-inset-panel settings-form-field--full">
              <p className="settings-panel-label">Public subdomain address</p>
              <div className="settings-control-row settings-control-row--compact">
                <a
                  href={businessSubdomainUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="settings-link"
                >
                  {businessSubdomainUrl}
                </a>
                <span className="settings-panel-caption">
                  Published galleries appear under this address.
                </span>
              </div>
            </div>
          )}
          <label className="settings-form-field">
            Public brand name
            <input
              type="text"
              value={profile.brand_name}
              onChange={setText("brand_name")}
              className={inputClass}
              placeholder={profile.name || "Studio name shown to clients"}
            />
          </label>
          <label className="settings-form-field">
            Brand accent color
            <input
              type="text"
              value={profile.brand_accent_color}
              onChange={setText("brand_accent_color")}
              className={inputClass}
              placeholder={viewportThemeColors.publicGallery}
            />
          </label>
          <div className="settings-inset-panel settings-control-row settings-form-field--full">
            <div>
              <p className="settings-panel-label settings-panel-label--sm">
                Public gallery branding
              </p>
              <p className="settings-panel-note settings-panel-note--compact">
                Show the studio identity on public gallery headers and shares.
              </p>
            </div>
            <ToggleSwitch
              checked={profile.public_branding_enabled}
              label="Show studio branding on public galleries"
              checkedLabel="Visible"
              uncheckedLabel="Hidden"
              onCheckedChange={(enabled) =>
                setProfile((current) => ({
                  ...current,
                  public_branding_enabled: enabled,
                }))
              }
            />
          </div>
          <div className="settings-inset-panel settings-form-field--full">
            <div className="settings-control-row">
              <div className="settings-business-logo-row">
                <div className="settings-logo-preview">
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt={`${studioBrandName} logo preview`}
                      className="settings-logo-image"
                    />
                  ) : (
                    <span
                      className="settings-logo-placeholder"
                      aria-hidden="true"
                    >
                      {studioBrandName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <p className="settings-panel-label">Studio logo</p>
                  <p className="settings-panel-note settings-panel-note--compact">
                    {logoFilename ||
                      "Upload a transparent PNG, JPEG, WebP, or SVG logo. It is stored as an authenticated asset."}
                  </p>
                </div>
              </div>
              <div className="settings-action-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="settings-file-input"
                  onChange={(event) => void uploadLogo(event.target.files?.[0])}
                />
                <GlassButton
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  variant="surface"
                  icon={<ArrowUpTray />}
                >
                  {logoUploading ? "Uploading..." : "Upload studio logo"}
                </GlassButton>
                {profile.logo_asset_id && (
                  <GlassButton
                    type="button"
                    onClick={() => void removeLogo()}
                    disabled={logoUploading}
                    variant="danger"
                    icon={<Trash />}
                  >
                    Remove logo
                  </GlassButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Brand Preview"
        description="One identity propagates to the client-facing gallery workspace and transactional surfaces."
        icon={<Palette />}
      >
        <div className="settings-card-grid settings-card-grid--two">
          {[
            [
              "Gallery preview",
              `${studioBrandName} presents a polished public gallery header.`,
            ],
            [
              "Invoice preview",
              `${studioBrandName} appears above GST, terms, and payment instructions.`,
            ],
            [
              "Email signature",
              `Delivery emails sign off as ${studioBrandName}.`,
            ],
            [
              "Share card",
              `WhatsApp and email shares inherit the gallery cover and studio name.`,
            ],
          ].map(([title, body]) => (
            <article key={title} className="settings-preview-card">
              <div
                className="settings-preview-accent"
                style={{ backgroundColor: accentColor }}
              />
              <p className="settings-preview-title">{title}</p>
              <p className="settings-preview-body">{body}</p>
            </article>
          ))}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Bank Details"
        description="Shown on invoices only. These private tax and banking fields never appear in public gallery branding."
        icon={<Banknote />}
      >
        <div className="settings-form-grid settings-form-grid--two">
          <label className="settings-form-field">
            Bank name
            <input
              type="text"
              value={profile.bank_name}
              onChange={setText("bank_name")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field">
            Account holder
            <input
              type="text"
              value={profile.bank_account_holder}
              onChange={setText("bank_account_holder")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field">
            Account number
            <input
              type="text"
              value={profile.bank_account_number}
              onChange={setText("bank_account_number")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field">
            IFSC
            <input
              type="text"
              value={profile.bank_ifsc}
              onChange={setText("bank_ifsc")}
              className={inputClass}
            />
          </label>
          <label className="settings-form-field settings-form-field--full">
            Branch
            <input
              type="text"
              value={profile.bank_branch}
              onChange={setText("bank_branch")}
              className={inputClass}
            />
          </label>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Invoice Customization"
        description="Tune the private invoice copy that clients see after bookings and payments."
        icon={<ReceiptText />}
      >
        <div className="settings-form-grid">
          <label className="settings-form-field">
            Signature name
            <input
              type="text"
              value={profile.signature_name}
              onChange={setText("signature_name")}
              className={inputClass}
              placeholder="Authorized Signatory"
            />
          </label>
          <label className="settings-form-field">
            Terms & conditions
            <textarea
              value={profile.invoice_terms}
              onChange={setText("invoice_terms")}
              className={`${inputClass} settings-textarea`}
              placeholder={
                "Payment due within 15 days.\n18% GST applicable.\nDisputes subject to local jurisdiction."
              }
            />
          </label>
          <label className="settings-form-field">
            Invoice footer note
            <input
              type="text"
              value={profile.invoice_footer}
              onChange={setText("invoice_footer")}
              className={inputClass}
              placeholder="Thank you for your business."
            />
          </label>
        </div>
      </SettingsPanel>

      <div className="settings-action-row settings-action-row--end">
        <GlassButton
          type="button"
          onClick={save}
          disabled={saving}
          variant="primary"
          icon={<CheckCircle />}
        >
          {saving ? "Saving..." : "Save business profile"}
        </GlassButton>
      </div>
    </SettingsPageShell>
  );
}
