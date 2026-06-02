"use client";

import Link from "next/link";
import { PwaInstallCard } from "@/components/pwa/install-card";

export default function PwaSettingsPage() {
  return (
    <div className="min-h-screen bg-surface p-6 text-text-primary md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <nav className="text-xs text-text-tertiary">
          <Link href="/settings" className="hover:text-accent hover:underline">
            Settings
          </Link>
          <span className="mx-2">&rsaquo;</span>
          <span>Install App</span>
        </nav>

        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-text-primary">
            Install RawDrive
          </h1>
          <p className="mt-2 text-text-secondary">
            Add RawDrive to your computer or phone for faster access, app-style launch,
            and offline support where your browser allows it.
          </p>
        </div>

        <PwaInstallCard />

        <section className="surface-panel p-6">
          <h2 className="font-headline text-lg font-bold text-text-primary">
            Where it appears
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            The dashboard stays focused on studio work. Install controls are available
            from this settings page and the compact header install button when the
            browser exposes native installation.
          </p>
        </section>
      </div>
    </div>
  );
}
