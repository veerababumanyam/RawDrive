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
  const marketingRoute = isMarketingRoute(pathname);
  const showMarketingChrome = marketingRoute;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.dataset.chrome = showMarketingChrome ? "marketing" : "app";
    document.body.dataset.theme = marketingRoute ? "midnight" : "liquid-glass-dark";

    return () => {
      delete document.body.dataset.chrome;
      delete document.body.dataset.theme;
    };
  }, [marketingRoute, showMarketingChrome]);

  return (
    <>
      {showMarketingChrome ? <Navbar /> : null}
      <ServiceWorkerRegister />
      <main className="flex-1">{children}</main>
      {showMarketingChrome ? <Footer /> : null}
    </>
  );
}
