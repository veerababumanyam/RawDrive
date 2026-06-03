"use client";

/**
 * PublicGalleryOfflineGate — decides, on the client, whether to render the live
 * online gallery (`children`, produced by the /g/[slug] server component) or the
 * decrypt-capable offline renderer (<OfflineGalleryView/>).
 *
 * WHY a client gate: /g/[slug]/page.tsx is a server component — its gallery data
 * is fetched server-side and baked into the HTML the service worker caches. When
 * the visitor is offline the service worker serves that cached Next document
 * (frontend/public/service-worker.js::handleNavigation), the React app boots, and
 * this gate runs. Unlike the vanilla cold-boot shell (offline-gallery.html), the
 * React renderer reuses PublicGalleryGrid → useDecryptedAssetUrl, so E2EE
 * galleries DECRYPT cache-first from Cache Storage using the localStorage-persisted
 * media key. The vanilla shell remains the cold-boot fallback for when the app
 * document itself was never cached.
 *
 * Offline decision (robust + SSR-safe):
 *   render OfflineGalleryView  ⇔  client is offline  AND  getGalleryMeta(slug) ≠ null.
 * "Offline" = navigator.onLine === false (subscribed to the `online`/`offline`
 * events so a mid-session drop swaps the view). When offline but NO saved copy
 * exists, the online children are left in place — there is nothing to render
 * offline, and a misleading "saved copy" shell would be worse than the browser's
 * own offline affordance.
 *
 * SSR-safety: the server snapshot is always "online" and the saved-entry probe is
 * client-only (IndexedDB), so the first client commit matches the server HTML
 * (no hydration mismatch). The online rendering path is byte-for-byte unchanged
 * whenever the visitor is online — this component returns `children` untouched.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { getGalleryMeta } from "@/lib/offline/catalog";
import { OfflineGalleryView } from "./offline-gallery-view";

// Client-only "is mounted" check via useSyncExternalStore. getServerSnapshot
// returns false (SSR + first client commit render the online children → no
// hydration mismatch); the store never notifies, so the only re-render is the
// post-mount transition to true. Mirrors OfflineStorageLauncher / ImpersonationBanner.
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function PublicGalleryOfflineGate({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );
  const [offline, setOffline] = useState(false);
  const [hasSavedCopy, setHasSavedCopy] = useState(false);

  // Track connectivity. We start optimistic (online) so the first client commit
  // matches the SSR HTML; the effect below corrects it after mount and on every
  // online/offline event.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOffline(isOffline());
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Probe the offline catalog once per slug. A saved entry is the precondition
  // for swapping to OfflineGalleryView — without one there are no local bytes to
  // render, so we leave the online children in place.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const meta = await getGalleryMeta(slug);
        if (!cancelled) setHasSavedCopy(meta != null);
      } catch {
        if (!cancelled) setHasSavedCopy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (mounted && offline && hasSavedCopy) {
    return <OfflineGalleryView slug={slug} />;
  }

  return <>{children}</>;
}
