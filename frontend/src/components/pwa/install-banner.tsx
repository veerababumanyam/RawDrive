"use client";

// PWA install banner. Mounted once at the dashboard layout level so
// every authenticated route surfaces the same install prompt. Renders
// nothing when the browser hasn't emitted beforeinstallprompt, when
// the user is already running the installed app, or when they've
// dismissed within the 30-day cooldown.
//
// Coexistence with the browser address-bar install icon: this banner
// uses the SAME deferred BeforeInstallPromptEvent that powers the
// address-bar affordance. If the user clicks the address-bar icon
// instead, the browser fires `appinstalled`, our hook clears the
// deferred prompt, and this banner unmounts. Either path works.

import { useState } from "react";
import { Download, XMark } from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export function PwaInstallBanner() {
  // The auto-popup gates on bannerVisible (canInstall + not in
  // dismiss cooldown). The dashboard install card and the header
  // pill use canInstall instead, so an "I'll install later" dismiss
  // from this banner doesn't hide the manual surfaces.
  const { bannerVisible, promptInstall, dismiss } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  if (!bannerVisible) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  // Bottom-anchored card. Sits above the dashboard content so the
  // install affordance is always reachable without scrolling. On
  // mobile the card spans full width with side padding; on desktop
  // it's anchored bottom-right at a fixed width so it doesn't cover
  // primary content.
  return (
    <div
      role="dialog"
      aria-label="Install RawDrive"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-border-default bg-surface-raised p-4 shadow-glass glass-blur-soft sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary">
            Install RawDrive
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Get faster access, an app-style window, and offline support. Same
            login, same data.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex min-h-[var(--touch-target-min)] items-center justify-center rounded-xl bg-accent-primary px-4 text-xs font-medium text-text-inverse transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {installing ? "Installing…" : "Install"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-[var(--touch-target-min)] items-center justify-center rounded-xl px-3 text-xs font-medium text-text-secondary hover:bg-surface-container-low hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Not now
            </button>
          </div>
        </div>
        <GlassIconButton
          label="Dismiss install prompt"
          variant="ghost"
          onClick={dismiss}
          className="shrink-0"
        >
          <XMark />
        </GlassIconButton>
      </div>
    </div>
  );
}

// Lightweight header-bar variant. Sits next to the bell icon and
// renders an icon-only "Install" trigger when the deferred prompt is
// available. Hidden whenever the banner conditions fail, so the
// header doesn't show a button the user can't act on.
export function PwaInstallHeaderButton() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  if (!canInstall) return null;

  const handleClick = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <GlassIconButton
      type="button"
      onClick={handleClick}
      disabled={installing}
      label={installing ? "Installing RawDrive app" : "Install RawDrive app"}
      size="md"
      variant="ghost"
      className="shrink-0 bg-accent-subtle text-accent hover:bg-accent-subtle/80"
    >
      <Download className="h-4 w-4" />
    </GlassIconButton>
  );
}
