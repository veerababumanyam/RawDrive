"use client";

/**
 * PublicGallerySessionBridge — installs a server-render-minted gallery session
 * into the visitor's browser (issue #156).
 *
 * A share-link landing `/g/{slug}?share=<token>` for an access-gated gallery
 * (private / invite-only / password) can unlock during the Next.js SERVER
 * render: the Go backend's tryBindShareSession validates the share token and
 * mints a durable `gallery_session`, echoing it in the X-Gallery-Session
 * response header. But that fetch is server-to-server, so the minted session
 * unlocked the SSR render ONLY — it was never installed in the browser. A
 * subsequent client navigation ("Find me" / photo-search, People, "Back to
 * gallery", result photo links) then has no `gallery_session` cookie and is
 * denied.
 *
 * The interactive gates (share-pin-gate.tsx, gallery-password-gate.tsx) already
 * persist the minted token client-side; this bridge is the equivalent step for
 * the server-render mint path. It is mounted by page.tsx ONLY when the backend
 * minted a fresh session this render (no pre-existing cookie), and it:
 *
 *   1. writes sessionStorage[`gallery_session_${slug}`] for current-tab client
 *      helpers (the `?gs=` image channel),
 *   2. writes an immediate, client-readable `gallery_session` cookie
 *      (Path=/, Max-Age=86400, SameSite=Strict, Secure on HTTPS) so the very
 *      next navigation carries the session even before the upgrade below lands,
 *   3. best-effort POSTs the token to the same-origin /api/public-gallery-session
 *      route, which replaces that cookie with an HttpOnly one. Failure is
 *      non-fatal — step 2 already grants access.
 *
 * This bridge never places the durable session token in a URL (it writes only
 * the cookie + sessionStorage); `share` stays first-touch only. Renders null
 * (no UI).
 */

import { useEffect } from "react";

interface Props {
  slug: string;
  gallerySessionToken: string | null | undefined;
}

export function PublicGallerySessionBridge({
  slug,
  gallerySessionToken,
}: Props) {
  useEffect(() => {
    if (!gallerySessionToken || typeof window === "undefined") return;
    const token = gallerySessionToken;

    // 1. Current-tab client helpers (e.g. the `?gs=` image byte channel) read
    //    sessionStorage. Private-browsing mode can throw — the cookie below
    //    still carries the session, so swallow it.
    try {
      window.sessionStorage.setItem(`gallery_session_${slug}`, token);
    } catch {
      /* private mode — the cookie path still carries the session */
    }

    // 2. Immediate same-site cookie. Secure only on HTTPS so the cookie still
    //    sticks on http://localhost during dev (mirrors gallery-password-gate).
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `gallery_session=${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Strict${secure}`;

    // 3. Best-effort upgrade to an HttpOnly cookie so the durable session is no
    //    longer JS-readable once installed. Same-origin; failure is ignored.
    void fetch("/api/public-gallery-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ slug, token }),
    }).catch(() => undefined);
  }, [slug, gallerySessionToken]);

  return null;
}
