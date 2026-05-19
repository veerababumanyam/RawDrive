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

// Recognised browser families for the "How to install" fallback.
// We only sniff coarsely — enough to give the right written
// instructions when beforeinstallprompt isn't going to fire. Each
// detection result drives one entry in the manualInstructions map
// below; "unknown" gets a generic fallback so we never render an
// empty state.
export type InstallBrowser =
  | "chromium-desktop"
  | "chromium-android"
  | "safari-ios"
  | "safari-macos"
  | "firefox-android"
  | "firefox-desktop"
  | "unknown";

export interface ManualInstallInstructions {
  browser: InstallBrowser;
  // User-facing label of the detected browser ("Safari on iPhone",
  // "Chrome on Windows", etc.) so the card heading can address the
  // user directly.
  label: string;
  // Ordered numbered steps the user follows in their browser chrome.
  // Short, imperative. Localised strings should land here in a
  // future i18n pass.
  steps: string[];
  // Optional note rendered below the steps for context that doesn't
  // fit a step ("Firefox desktop currently lacks PWA install
  // support" etc.).
  note?: string;
}

export interface UseInstallPromptResult {
  // True iff a deferred BeforeInstallPromptEvent is in hand AND the
  // app isn't already running as a standalone PWA. Independent of
  // dismiss state — used by surfaces that want a manual install
  // affordance available even after the user closed the auto-popup.
  canInstall: boolean;
  // canInstall AND user hasn't dismissed within the cooldown. Used
  // by the auto-popup banner only, so an accidental dismiss doesn't
  // permanently kill the banner but ALSO doesn't tickle the user a
  // second time within the cooldown window.
  bannerVisible: boolean;
  // True when the page is already running as the installed PWA.
  // Surfaces should hide install affordances entirely in this case.
  isStandalone: boolean;
  // Browser-specific manual install instructions for surfaces that
  // want to show a "How to install" fallback when canInstall is
  // false (Safari, Firefox, or Chromium before the heuristic fires).
  // Never null — always returns at least the generic fallback.
  manualInstructions: ManualInstallInstructions;
  // Open the native install dialog. Returns the outcome so callers
  // can surface a toast. Calling when canInstall=false is a no-op
  // that resolves to "unavailable".
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  // User-initiated dismissal. Sets the cooldown and hides the
  // auto-popup banner; does NOT consume the deferred prompt, so the
  // header pill and dashboard card stay clickable.
  dismiss: () => void;
}

function detectBrowser(): ManualInstallInstructions {
  if (typeof navigator === "undefined") {
    return {
      browser: "unknown",
      label: "your browser",
      steps: [
        "Look for an 'Install' option in your browser menu or address bar.",
        "If you don't see one, try opening RawDrive in Chrome, Edge, or Brave for the full app experience.",
      ],
    };
  }
  const ua = navigator.userAgent;
  // iOS / iPadOS: every browser is WebKit. iPad on iPadOS 13+ reports
  // a Mac UA but exposes touch points, so check that too.
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (ua.includes("Macintosh") && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    return {
      browser: "safari-ios",
      label: "Safari on iPhone / iPad",
      steps: [
        "Tap the Share button at the bottom of the screen.",
        "Scroll down and tap 'Add to Home Screen'.",
        "Tap 'Add' in the top-right corner.",
      ],
      note: "On iOS the Share menu is the only way to install — there's no install button in the address bar.",
    };
  }
  const isAndroid = /Android/i.test(ua);
  const isFirefox = /Firefox\//i.test(ua) && !/Seamonkey\//i.test(ua);
  if (isFirefox && isAndroid) {
    return {
      browser: "firefox-android",
      label: "Firefox on Android",
      steps: [
        "Tap the menu (⋮) in the address bar.",
        "Tap 'Install' or 'Add to Home screen'.",
        "Confirm by tapping 'Add'.",
      ],
    };
  }
  if (isFirefox) {
    return {
      browser: "firefox-desktop",
      label: "Firefox on desktop",
      steps: [
        "Open Chrome, Edge, or Brave to install the RawDrive app.",
        "Sign in with the same email there — your galleries and settings stay synced.",
      ],
      note: "Firefox on desktop doesn't currently support installing web apps as standalone windows.",
    };
  }
  // Treat Edge / Brave / Opera as Chromium for instruction purposes.
  const isChromiumLike = /Chrome|Chromium|Edg|OPR|Brave/i.test(ua);
  if (isChromiumLike && isAndroid) {
    return {
      browser: "chromium-android",
      label: "Chrome on Android",
      steps: [
        "Tap the menu (⋮) in the top-right of the browser.",
        "Tap 'Install app' or 'Add to Home screen'.",
        "Tap 'Install' to confirm.",
      ],
    };
  }
  if (isChromiumLike) {
    return {
      browser: "chromium-desktop",
      label: "Chrome / Edge / Brave on desktop",
      steps: [
        "Look for the install icon (a small monitor with a down-arrow) on the right side of the address bar.",
        "If you don't see it, open the browser menu and choose 'Install RawDrive…' or 'Apps → Install this site as an app'.",
        "Click 'Install' to confirm.",
      ],
      note: "Browsers wait until you've used the site a bit before offering the address-bar install icon. The button above will light up the moment it's available.",
    };
  }
  const isSafariMac = ua.includes("Safari") && ua.includes("Macintosh") && !ua.includes("Chrome");
  if (isSafariMac) {
    return {
      browser: "safari-macos",
      label: "Safari on Mac",
      steps: [
        "Click 'Share' in the toolbar (the icon with the arrow).",
        "Choose 'Add to Dock'.",
        "Click 'Add'.",
      ],
      note: "Requires macOS Sonoma or newer. On older macOS, use Chrome or Edge instead.",
    };
  }
  return {
    browser: "unknown",
    label: "your browser",
    steps: [
      "Look for an 'Install' option in your browser menu or address bar.",
      "If you don't see one, try opening RawDrive in Chrome, Edge, or Brave for the full app experience.",
    ],
  };
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

  // canInstall is the raw "we have a deferred prompt and the app
  // isn't already installed" gate — used by the dashboard card and
  // header pill so they stay clickable even after the user dismisses
  // the auto-popup banner.
  const canInstall = Boolean(deferredPromptCache) && !isStandalone;
  // bannerVisible additionally suppresses while the dismiss cooldown
  // is active — used ONLY by the auto-popup banner so we don't tickle
  // the user repeatedly within a single 30-day window.
  const bannerVisible = canInstall && !dismissedActive;

  // Memoise the browser-detection result so dependent components
  // don't re-render on every state tick. Detection is pure and
  // depends on navigator only, so first-call caching is safe.
  const manualInstructions = detectBrowser();

  return { canInstall, bannerVisible, isStandalone, manualInstructions, promptInstall, dismiss };
}
