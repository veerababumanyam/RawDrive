"use client";

/**
 * OfflineStorageLauncher — reachable entry point for ManageOfflineStorage.
 *
 * The offline "manage / remove saved galleries" surface (DPDP/GDPR erasure of
 * locally-cached gallery bytes) was built + tested but unreachable. This is the
 * `/g`-scoped affordance the spec calls for: a floating GlassIconButton that
 * opens a panel rendering <ManageOfflineStorage/>.
 *
 * Client-only: it depends on navigator.storage / Cache Storage and the
 * IndexedDB offline catalog, so it only mounts in the browser. We gate the FAB
 * behind a mounted check and a navigator.storage capability probe so it never
 * renders during SSR or in a browser that can't support offline saving.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Download, XMark } from "@/components/icons";
import { ManageOfflineStorage } from "./manage-offline-storage";

// Client-only "is mounted" check via useSyncExternalStore — the offline
// capability is only knowable in the browser after hydration. getServerSnapshot
// =false (SSR renders nothing), getSnapshot=true (client). This is the project's
// established pattern (see ImpersonationBanner / ThemeToggleButton) and avoids
// the react-hooks/set-state-in-effect rule that fires on the naive
// useEffect(() => setMounted(true), []) approach.
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

function offlineStorageSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof caches !== "undefined" &&
    typeof navigator.storage !== "undefined"
  );
}

export function OfflineStorageLauncher() {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );
  const [open, setOpen] = useState(false);

  // Only surface the affordance, after hydration, where offline saving works.
  const supported = mounted && offlineStorageSupported();

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!supported) return null;

  return (
    <>
      {/* FAB — bottom-right, above the "Powered by" chip. Mirrors the
          bottom-left Photo Search FAB so both corner affordances stay clear. */}
      <div className="fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <GlassIconButton
          variant="glass"
          size="md"
          label="Manage offline storage"
          active={open}
          onClick={() => setOpen(true)}
        >
          <Download />
        </GlassIconButton>
      </div>

      {open && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 z-40 bg-surface-sunken/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-storage-title"
            className="fixed bottom-0 right-0 left-0 z-50 mx-auto max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border-subtle bg-surface-raised/95 p-5 shadow-2xl backdrop-blur-xl sm:bottom-6 sm:right-6 sm:left-auto sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="offline-storage-title" className="text-lg font-semibold text-text-primary">
                Manage offline storage
              </h2>
              <GlassIconButton
                variant="ghost"
                size="md"
                label="Close offline storage manager"
                onClick={() => setOpen(false)}
              >
                <XMark />
              </GlassIconButton>
            </div>
            <ManageOfflineStorage />
          </div>
        </>
      )}
    </>
  );
}
