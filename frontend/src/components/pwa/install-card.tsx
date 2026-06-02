"use client";

// Install card for the dedicated PWA settings page. Keeps the install
// affordance discoverable for photographers who would never notice the
// browser address-bar install icon or the auto-popup banner.
//
// Three render modes:
//   1. Prompt available (Chromium fired beforeinstallprompt + app
//      not already installed):
//        -> primary "Install RawDrive" button that calls
//           promptInstall() and opens the native dialog.
//   2. Prompt unavailable but installation is possible
//      (Safari/Firefox, or Chromium before the heuristic fires):
//        -> "Show me how" disclosure that reveals
//           browser-specific written steps. No native dialog —
//           the user follows the steps themselves.
//   3. Already installed:
//        -> returns null. The card has nothing to offer; the user
//           is already running the standalone window.

import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export function PwaInstallCard() {
  const { canInstall, isStandalone, manualInstructions, promptInstall } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  // Already running the installed app — nothing useful to show.
  // (Detected via display-mode standalone / window-controls-overlay
  // / navigator.standalone in the hook.)
  if (isStandalone) return null;

  const handleNativeInstall = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section className="surface-panel p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-headline text-base font-bold text-text-primary">Install RawDrive App</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Get the app on your computer or phone. Same login, faster access, works offline.
          </p>
        </div>
      </div>

      {canInstall ? (
        // One-click path: Chromium gave us a deferred prompt. Click
        // triggers the same native dialog as the address-bar icon.
        <button
          type="button"
          onClick={handleNativeInstall}
          disabled={installing}
          className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {installing ? "Opening installer…" : "Install RawDrive"}
        </button>
      ) : (
        // Manual path: no deferred prompt available. Show a
        // disclosure that reveals browser-specific steps. We do NOT
        // hide the card here — that's the whole point, the card is
        // the discoverable button for users who'd otherwise never
        // find install.
        <>
          <button
            type="button"
            onClick={() => setShowInstructions((open) => !open)}
            aria-expanded={showInstructions}
            className="inline-flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl border border-border-default bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-container-low"
          >
            <span>{showInstructions ? "Hide steps" : "Show me how"}</span>
            <ChevronDown
              className={`h-4 w-4 text-text-secondary transition-transform ${showInstructions ? "rotate-180" : ""}`}
            />
          </button>
          {showInstructions && (
            <div className="mt-3 rounded-xl border border-border-subtle bg-surface-sunken/60 px-4 py-3">
              <p className="text-xs font-semibold text-text-primary">
                Install on {manualInstructions.label}
              </p>
              <ol className="mt-2 space-y-1.5 text-xs text-text-secondary">
                {manualInstructions.steps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-bold text-accent">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {manualInstructions.note && (
                <p className="mt-2 border-t border-border-subtle pt-2 text-[11px] text-text-tertiary">
                  {manualInstructions.note}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
