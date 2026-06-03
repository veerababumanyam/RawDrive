"use client";
import { useEffect } from "react";
import { revalidateSavedGalleries } from "@/lib/offline/sync";
import { getApiBaseUrl } from "@/lib/api/base-url";

export function OfflineRevalidator() {
  useEffect(() => {
    const run = () =>
      void revalidateSavedGalleries(async (slug, ws) => {
        const base = getApiBaseUrl();
        const path = ws
          ? `/api/v1/public/galleries/${slug}?ws=${encodeURIComponent(ws)}`
          : `/api/v1/public/galleries/${slug}`;
        try {
          const res = await fetch(`${base}${path}`, { credentials: "include" });
          return { ok: res.ok, status: res.status, etag: res.headers.get("etag") };
        } catch {
          return { ok: false, status: 0, etag: null };
        }
      });
    window.addEventListener("online", run);
    if (typeof navigator !== "undefined" && navigator.onLine) run();
    return () => window.removeEventListener("online", run);
  }, []);
  return null;
}
