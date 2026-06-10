"use client";

import Link from "next/link";
import { useState } from "react";

import { Download } from "@/components/icons";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export function PwaDirectAppCard() {
  const { canInstall, isStandalone, manualInstructions, promptInstall } =
    useInstallPrompt();
  const [installing, setInstalling] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleDownload = async () => {
    if (isStandalone) {
      window.location.assign("/dashboard");
      return;
    }

    if (!canInstall) {
      setShowInstructions((open) => !open);
      return;
    }

    setInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "unavailable") {
        setShowInstructions(true);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <aside className="settings-panel">
      <div className="settings-panel__header">
        <div className="settings-panel__heading">
          <div className="settings-panel__icon">
            <Download />
          </div>
          <div className="settings-panel__copy">
            <h2 className="settings-panel__title">Direct app link</h2>
            <p className="settings-panel__description">
              Download RawDrive as an app, then open the app dashboard directly.
              If you are signed out, it takes you to login first.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={installing}
          className="btn-primary inline-flex min-h-[var(--touch-target-min)] items-center rounded-full px-6 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {installing ? "Opening installer..." : "Download app"}
        </button>
        <Link
          href="/dashboard"
          className="landing-hero__secondary inline-flex min-h-[var(--touch-target-min)] items-center rounded-full px-6 text-base"
        >
          Open RawDrive app
        </Link>
      </div>

      {showInstructions && !isStandalone && (
        <div className="settings-install-steps mt-5">
          <p className="settings-install-title">
            Install on {manualInstructions.label}
          </p>
          <ol className="settings-install-step-list">
            {manualInstructions.steps.map((step, index) => (
              <li key={step} className="settings-install-step">
                <span className="settings-install-step__index">
                  {index + 1}
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
    </aside>
  );
}
