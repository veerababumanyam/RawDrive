"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

const marketingRoutes = new Set([
  "/",
  "/features",
  "/pricing",
  "/legal",
  "/privacy",
  "/legal",
  "/refund",
  "/terms",
  "/dealership",
  "/about",
  "/contact",
  "/login",
  "/register",
  "/install",
]);

function isMarketingRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  if (marketingRoutes.has(pathname)) {
    return true;
  }

  if (
    pathname.startsWith("/solutions/") ||
    pathname.startsWith("/marketplaces/")
  ) {
    return true;
  }

  // NOTE: /g/[slug] (public client share route) is intentionally NOT a
  // marketing route. Clients receiving a share link expect to see ONLY the
  // photographer's gallery — exposing the platform's marketing Navbar
  // (Solutions / Marketplaces / Company / Login dropdowns) and Footer to a
  // wedding/event client is wrong on two axes: it leaks the multi-tenant
  // platform branding into a single-tenant client deliverable, and the
  // Login CTA pulls the client off the gallery. The gallery layout at
  // app/g/[slug]/layout.tsx and the PublicGalleryHero own all the chrome
  // the public viewer should see (studio brand strip in the hero, in-page
  // banners, share/proofing affordances on the grid).
  return false;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showMarketingChrome = isMarketingRoute(pathname);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.dataset.chrome = showMarketingChrome ? "marketing" : "app";

    return () => {
      delete document.body.dataset.chrome;
    };
  }, [showMarketingChrome]);

  return (
    <>
      {showMarketingChrome ? <Navbar /> : null}
      <ServiceWorkerRegister />
      <main className="flex-1">{children}</main>
      {showMarketingChrome ? <Footer /> : null}
    </>
  );
}
