"use client";

// PWA install prompt hook.
//
// Wraps the BeforeInstallPromptEvent that Chromium browsers fire when
// they decide the site is installable (manifest + service worker + the
// engagement heuristic Chrome doesn't document). The event must be
// captured the moment it fires; if no listener is attached at dispatch
// time, the install affordance is lost until the next pageview. We
// attach in this hook so any component (banner, header button) can
// share the deferred prompt via the same module-scope state.
//
// Browser coverage:
//   - Chrome / Edge / Brave / Opera (desktop + Android): fire
//     beforeinstallprompt → canInstall flips to true; calling
//     promptInstall() opens the native install dialog.
//   - Firefox / Safari: do not fire beforeinstallprompt. canInstall
//     stays false. Firefox shows an install icon in the address bar
//     on Android only; Safari surfaces "Add to Home Screen" via the
//     share sheet on iOS / iPadOS 16.4+. Our banner stays hidden
//     there — the browser-native affordance is the only path.
//
// Dismissal:
//   - Explicit dismiss writes an ISO timestamp to localStorage.
//     We suppress the banner for `DISMISS_COOLDOWN_DAYS` days after
//     dismissal so an accidental close doesn't kill the banner
//     forever. The cooldown resets if the install eventually
//     succeeds (we clear the key on `appinstalled`).
//
// Standalone detection:
//   - If the user is already running the installed PWA (display-mode
//     standalone or window-controls-overlay), canInstall stays false
//     and isStandalone is true.

import { useCallback, useEffect, useState } from "react";

// Same type Chrome exposes; not in the standard DOM lib yet.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "rawdrive:pwa-install-dismissed";
const DISMISS_COOLDOWN_DAYS = 30;

// Module-scope cache. Two hook consumers (the banner + the header
// button) read the same deferred prompt, and the second mount must
// not race-clear what the first captured. The cache survives unmount/
// remount during route transitions within the same SPA session.
let deferredPromptCache: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function readDismissedAt(): number | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(DISMISS_KEY) : null;
    if (!raw) return null;
    const ts = Date.parse(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function withinDismissCooldown(): boolean {
  const ts = readDismissedAt();
  if (ts === null) return false;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays < DISMISS_COOLDOWN_DAYS;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // matchMedia covers Chromium standalone + window-controls-overlay
  // installations. The legacy navigator.standalone is iOS-Safari
  // specific — kept as a fallback because iOS doesn't fire
  // beforeinstallprompt but DOES expose this property when running
  // from the home-screen icon.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (window.matchMedia?.("(display-mode: window-controls-overlay)").matches) return true;
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export interface UseInstallPromptResult {
  // True iff the browser has emitted beforeinstallprompt AND the user
  // has neither dismissed within the cooldown nor already installed.
  // This is what UI surfaces should gate "Install" buttons on.
  canInstall: boolean;
  // True when the page is already running as the installed PWA.
  // Surfaces should hide install affordances entirely in this case
  // — a user who already has the app installed seeing "Install" is
  // confusing.
  isStandalone: boolean;
  // Open the native install dialog. Returns the outcome so callers
  // can surface a toast. Calling when canInstall=false is a no-op
  // that resolves to "unavailable".
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  // User-initiated dismissal. Sets the cooldown and hides the banner;
  // does NOT consume the deferred prompt, so the header "Install App"
  // button can still trigger installation later within the same
  // session.
  dismiss: () => void;
}

export function useInstallPrompt(): UseInstallPromptResult {
  // useState forces re-render when the module-scope cache changes; the
  // value itself is read from the cache, not from local state, so two
  // mounted consumers see the same deferred prompt.
  const [, setTick] = useState(0);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [dismissedActive, setDismissedActive] = useState<boolean>(false);

  useEffect(() => {
    setIsStandalone(detectStandalone());
    setDismissedActive(withinDismissCooldown());

    const onBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome's default mini-infobar so we own the UX.
      e.preventDefault();
      deferredPromptCache = e as BeforeInstallPromptEvent;
      notify();
    };

    const onAppInstalled = () => {
      // App was installed via either our prompt or the browser's own
      // address-bar affordance. Either way, kill the deferred prompt
      // and clear any prior dismissal so a fresh re-install (rare,
      // but possible after uninstall) starts from a clean slate.
      deferredPromptCache = null;
      try {
        window.localStorage.removeItem(DISMISS_KEY);
      } catch {
        // localStorage can throw in private-mode Safari; safe to ignore.
      }
      setIsStandalone(detectStandalone());
      setDismissedActive(false);
      notify();
    };

    // Listen on the SHARED notifier so two hook consumers update in
    // lockstep when either receives a new event.
    const onCacheChanged = () => setTick((n) => n + 1);
    listeners.add(onCacheChanged);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", onAppInstalled);

    // Cover the case where the event fired BEFORE this hook mounted
    // (e.g. on a route where the layout was lazy-loaded). The cache
    // holds the prior dispatch; trigger a render so the consumer
    // picks it up immediately.
    if (deferredPromptCache) setTick((n) => n + 1);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", onAppInstalled);
      listeners.delete(onCacheChanged);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const dp = deferredPromptCache;
    if (!dp) return "unavailable";
    try {
      await dp.prompt();
      const choice = await dp.userChoice;
      // The spec says a deferred prompt can only be used ONCE — calling
      // .prompt() again throws InvalidStateError. Drop it from the
      // cache so subsequent UI gates evaluate to !canInstall.
      deferredPromptCache = null;
      notify();
      return choice.outcome;
    } catch {
      deferredPromptCache = null;
      notify();
      return "dismissed";
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
      // localStorage unavailable (private mode); fall back to the
      // in-memory dismissedActive flag below — banner stays hidden
      // for the current tab session even without persistence.
    }
    setDismissedActive(true);
    notify();
  }, []);

  const canInstall = Boolean(deferredPromptCache) && !isStandalone && !dismissedActive;

  return { canInstall, isStandalone, promptInstall, dismiss };
}
