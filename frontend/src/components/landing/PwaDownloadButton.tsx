"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useState } from "react";

import { Download } from "@/components/icons";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

export function PwaDownloadButton() {
  const { canInstall, isStandalone, promptInstall } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  if (isStandalone) return null;

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!canInstall) {
      return;
    }

    event.preventDefault();
    setInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "unavailable") {
        window.location.assign("/install");
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div>
      <Link
        href="/install"
        onClick={(event) => void handleClick(event)}
        aria-disabled={installing}
        className="landing-hero__secondary inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-full px-6 text-base aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        <Download className="h-5 w-5" aria-hidden="true" />
        {installing ? "Opening app installer" : "Download app"}
      </Link>
    </div>
  );
}
