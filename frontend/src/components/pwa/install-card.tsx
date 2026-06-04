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

import { useState } from "react";
import { ChevronDown, Download } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export function PwaInstallCard() {
  const { canInstall, isStandalone, manualInstructions, promptInstall } =
    useInstallPrompt();
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
    <section className="settings-panel">
      <div className="settings-panel__header">
        <div className="settings-panel__heading">
          <div className="settings-panel__icon">
            <Download />
          </div>
          <div className="settings-panel__copy">
            <h2 className="settings-panel__title">Install RawDrive App</h2>
            <p className="settings-panel__description">
              Get the app on your computer or phone. Same login, faster access,
              works offline.
            </p>
          </div>
        </div>
      </div>

      {canInstall ? (
        // One-click path: Chromium gave us a deferred prompt. Click
        // triggers the same native dialog as the address-bar icon.
        <GlassButton
          type="button"
          onClick={handleNativeInstall}
          disabled={installing}
          variant="primary"
          className="settings-button-full"
          icon={<Download />}
        >
          {installing ? "Opening installer…" : "Install RawDrive"}
        </GlassButton>
      ) : (
        // Manual path: no deferred prompt available. Show a
        // disclosure that reveals browser-specific steps. We do NOT
        // hide the card here — that's the whole point, the card is
        // the discoverable button for users who'd otherwise never
        // find install.
        <>
          <GlassButton
            type="button"
            onClick={() => setShowInstructions((open) => !open)}
            aria-expanded={showInstructions}
            variant="surface"
            className="settings-button-full"
            icon={
              <ChevronDown
                className={`settings-disclosure-icon ${showInstructions ? "settings-disclosure-icon--open" : ""}`}
              />
            }
          >
            {showInstructions ? "Hide steps" : "Show me how"}
          </GlassButton>
          {showInstructions && (
            <div className="settings-install-steps">
              <p className="settings-install-title">
                Install on {manualInstructions.label}
              </p>
              <ol className="settings-install-step-list">
                {manualInstructions.steps.map((step, i) => (
                  <li key={i} className="settings-install-step">
                    <span className="settings-install-step__index">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {manualInstructions.note && (
                <p className="settings-install-note">
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
