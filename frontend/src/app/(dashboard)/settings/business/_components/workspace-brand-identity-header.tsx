"use client";

import { useMemo } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import type { WorkspaceProfile } from "@/lib/api/workspace-profile";
import { ArrowUpTray } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import { SettingsPanel } from "../../_components/settings-page-shell";

interface WorkspaceBrandIdentityHeaderProps {
  profile: WorkspaceProfile;
  brandName: string;
  /** DOM id of the logo upload/crop control to scroll to from the CTA. */
  logoControlId: string;
}

// WorkspaceBrandIdentityHeader renders the studio logo prominently at the TOP
// of /settings/business with the brand name — the "brand identity" surface
// other SaaS settings pages lead with. It reads the already-fetched workspace
// profile (no extra request) and, when no logo is set, shows a graceful
// placeholder + a call-to-action that jumps to the upload/crop control below.
export function WorkspaceBrandIdentityHeader({
  profile,
  brandName,
  logoControlId,
}: WorkspaceBrandIdentityHeaderProps) {
  const logoUrl = useMemo(() => {
    const source = profile.logo_url || profile.logo_metadata?.storage_key || "";
    return source ? getStorageBackedUrl(source, getStoredAccessToken()) : "";
  }, [profile.logo_url, profile.logo_metadata?.storage_key]);

  const focusLogoControl = () => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(logoControlId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <SettingsPanel className="settings-panel--flush">
      <div className="settings-brand-hero">
        <div className="settings-brand-hero__logo" role="img" aria-label={`${brandName} logo`}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="settings-brand-hero__image" />
          ) : (
            <span className="settings-brand-hero__placeholder" aria-hidden="true">
              {brandName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="settings-brand-hero__body">
          <p className="settings-brand-hero__name">{brandName}</p>
          <p className="settings-brand-hero__subtitle">
            {logoUrl
              ? "Your studio logo leads every public gallery, invoice, and client email."
              : "Add your studio logo to brand every public gallery, invoice, and client email."}
          </p>
          {!logoUrl ? (
            <div className="settings-brand-hero__cta">
              <GlassButton
                type="button"
                variant="primary"
                icon={<ArrowUpTray />}
                onClick={focusLogoControl}
              >
                Add studio logo
              </GlassButton>
            </div>
          ) : null}
        </div>
      </div>
    </SettingsPanel>
  );
}
