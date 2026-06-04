"use client";

import { Smartphone } from "@/components/icons";
import { PwaInstallCard } from "@/components/pwa/install-card";
import {
  SettingsPageHeader,
  SettingsPageShell,
  SettingsPanel,
} from "../_components/settings-page-shell";

export default function PwaSettingsPage() {
  return (
    <SettingsPageShell>
      <SettingsPageHeader
        eyebrow="Install App"
        title="Install RawDrive"
        badge={<span className="status-badge status-badge--accent">PWA</span>}
        description="Add RawDrive to your computer or phone for faster access, app-style launch, and offline support where your browser allows it."
        meta={
          <>
            <span className="status-badge status-badge--neutral">
              Desktop and mobile
            </span>
            <span className="status-badge status-badge--success">
              Same secure login
            </span>
          </>
        }
      />

      <PwaInstallCard />

      <SettingsPanel
        title="Where it appears"
        description="The dashboard stays focused on studio work. Install controls are available from this settings page and the compact header install button when the browser exposes native installation."
        icon={<Smartphone />}
      >
        <p className="settings-panel-copy">
          Browser support varies by device, so RawDrive keeps both the native
          install prompt and manual steps available from one predictable place.
        </p>
      </SettingsPanel>
    </SettingsPageShell>
  );
}
