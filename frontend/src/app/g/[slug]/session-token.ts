// Session-token precedence for the public gallery SSR render.
//
// A visitor arriving on a private gallery share link (`/<slug>?share=…`) may
// already carry a `gallery_session` cookie from a DIFFERENT gallery, or an
// expired one. The backend, given the `?share=` token, mints a fresh session
// bound to THIS gallery and returns it via the `X-Gallery-Session` header.
//
// If the SSR render preferred the (stale) cookie over that fresh mint, the
// sub-fetches (assets, branding, albums) would send a token that fails
// `ValidateSession` (galleryID mismatch) → 403 → the render throws → 500. That
// was the recurring ~7% "Server Components render error / 504" on share links
// (issue #182). These two pure helpers encode the correct precedence so it
// stays testable and can't silently regress.

/**
 * The session token the SSR sub-fetches should use. The freshly-minted token is
 * bound to THIS gallery, so it is authoritative; fall back to the cookie only
 * when nothing was minted (password unlock / plain revisit / no share token).
 */
export function resolveEffectiveSessionToken(
  cookieToken: string | undefined,
  mintedToken: string | null | undefined,
): string | undefined {
  return mintedToken ?? cookieToken ?? undefined;
}

/**
 * Whether PublicGallerySessionBridge should (re)install the session cookie
 * client-side: true whenever the backend minted a token that differs from the
 * current cookie — i.e. there was no cookie, OR the cookie was stale/wrong and
 * must be overwritten so client-side navigation (Find me / People / back /
 * photo links) uses the correct, this-gallery token too.
 */
export function shouldInstallMintedSession(
  cookieToken: string | undefined,
  mintedToken: string | null | undefined,
): boolean {
  return Boolean(mintedToken && mintedToken !== cookieToken);
}
