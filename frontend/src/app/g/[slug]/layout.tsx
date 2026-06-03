import type { Metadata, Viewport } from "next";
import { createNoIndexMetadata } from "@/lib/seo";
import { OfflineRevalidator } from "@/components/offline/offline-revalidator";

// Service worker registration is handled globally by AppShell
// (frontend/src/components/layout/AppShell.tsx) which mounts
// <ServiceWorkerRegister /> from @/components/pwa/sw-register in the root
// layout — that already runs on every route, including /g/[slug]. We
// previously also registered here, which installed a different SW
// (/sw.js) at the same scope as the global one (/service-worker.js) and
// created a register-order race where guest pages could end up with the
// less-capable shim instead of the M15 SW. Removed 2026-05-18.

export const viewport: Viewport = {
  // Brand-accent override of the root #0b1326 navy specifically for the
  // public guest-gallery PWA chrome (Android address bar, iOS status
  // bar). Studio owners share these galleries with clients, so the
  // installed/standalone surface should read as a brand experience, not
  // the dashboard.
  themeColor: "#3B82F6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  ...createNoIndexMetadata(
    "RawDrive gallery",
    "Private client gallery viewer for invited recipients.",
  ),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RawDrive Gallery",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OfflineRevalidator />
      {children}
    </>
  );
}
