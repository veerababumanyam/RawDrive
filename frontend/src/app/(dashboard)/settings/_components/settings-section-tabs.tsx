"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Download, HardDrive, User } from "@/components/icons";
import { cn } from "@/lib/utils";

const SETTINGS_TABS = [
  {
    href: "/settings/profile",
    label: "Personal",
    mobileLabel: "Personal",
    description: "Personal account details",
    helpText: "Personal Profile: display name, phone, avatar",
    icon: User,
  },
  {
    href: "/settings/business",
    label: "Business",
    mobileLabel: "Business",
    description: "Studio identity and branding",
    helpText: "Business Profile: studio identity, GSTIN, and branding",
    icon: Briefcase,
  },
  {
    href: "/settings/storage",
    label: "Storage",
    mobileLabel: "Storage",
    description: "Usage, quota, and plan storage",
    helpText: "Storage: Usage, quota, and plan storage",
    icon: HardDrive,
  },
  {
    href: "/settings/pwa",
    label: "Install App",
    mobileLabel: "App",
    description: "Install RawDrive on this device",
    helpText: "Install App: add RawDrive to this device",
    icon: Download,
  },
] as const;

export function SettingsSectionTabs() {
  const pathname = usePathname();

  return (
    <header className="settings-tabs-shell">
      <div className="settings-tabs-copy">
        <p className="settings-tabs-kicker">Settings</p>
        <h1 className="settings-tabs-title">Settings</h1>
        <p className="settings-tabs-description">
          Manage personal, business, storage, and app install settings from one
          place.
        </p>
      </div>

      <nav aria-label="Settings sections">
        <div
          role="tablist"
          aria-orientation="horizontal"
          className="settings-tabs-list"
        >
          {SETTINGS_TABS.map((tab) => {
            const active =
              pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            const tooltipId = `settings-tab-${tab.href.split("/").pop()}-hint`;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                role="tab"
                aria-label={tab.label}
                aria-describedby={tooltipId}
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "settings-tab settings-tab-link touch-target-link",
                  active
                    ? "settings-tab-link--active"
                    : "settings-tab-link--inactive",
                )}
              >
                <Icon aria-hidden="true" className="settings-tab-icon" />
                <span className="settings-tab-label">
                  <span className="settings-tab-label--compact">
                    {tab.mobileLabel}
                  </span>
                  <span className="settings-tab-label--full">{tab.label}</span>
                </span>
                <span
                  id={tooltipId}
                  role="tooltip"
                  className="settings-tab-tooltip"
                >
                  {tab.helpText}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
