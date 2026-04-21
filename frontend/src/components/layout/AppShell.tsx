"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { CreditPill } from "@/components/streams/CreditPill";
import { UploadCreditPill } from "@/components/streams/UploadCreditPill";

const marketingRoutes = new Set([
  "/",
  "/features",
  "/pricing",
  "/privacy",
  "/refund",
  "/terms",
  "/dealership",
  "/about",
  "/contact",
  "/login",
  "/register",
]);

function isMarketingRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  if (marketingRoutes.has(pathname)) {
    return true;
  }

  if (pathname.startsWith("/solutions/") || pathname.startsWith("/marketplaces/")) {
    return true;
  }

  return pathname.startsWith("/g/");
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
      {!showMarketingChrome ? (
        <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
          {/* M41 FR-UCRT-10 follow-up: upload credits pill sits next to
              the streaming minutes pill. Each pill self-hides when its
              backing balance endpoint 404s (feature flag off), so
              deployments with one or neither feature enabled don't show
              a perpetual "—" placeholder. */}
          <UploadCreditPill />
          <CreditPill />
        </div>
      ) : null}
      <ServiceWorkerRegister />
      <main className="flex-1">{children}</main>
      {showMarketingChrome ? <Footer /> : null}
    </>
  );
}
