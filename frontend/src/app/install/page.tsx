import type { Metadata } from "next";

import { PwaDirectAppCard } from "@/components/pwa/direct-app-card";
import { PwaInstallCard } from "@/components/pwa/install-card";

export const metadata: Metadata = {
  title: "Install RawDrive",
  description:
    "Install the RawDrive web app on your phone or computer for faster access and app-style launch.",
};

export default function InstallPage() {
  return (
    <div className="landing-root bg-surface text-text-primary selection:bg-accent-muted selection:text-text-primary">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-24 sm:px-8 lg:px-12">
        <div className="mb-10 max-w-2xl">
          <p className="font-headline text-xs font-semibold uppercase tracking-widest text-text-secondary">
            RawDrive app
          </p>
          <h1 className="mt-4 font-headline text-4xl font-bold leading-tight text-text-primary sm:text-5xl">
            Install RawDrive on this device.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            Use RawDrive like an app from your home screen, dock, or app
            launcher. Same secure login, same galleries, faster access.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <PwaInstallCard />
          <PwaDirectAppCard />
        </div>
      </section>
    </div>
  );
}
