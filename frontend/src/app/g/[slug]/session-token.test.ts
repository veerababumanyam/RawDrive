import { describe, expect, it } from "vitest";
import {
  resolveEffectiveSessionToken,
  shouldInstallMintedSession,
} from "./session-token";

// Regression coverage for issue #182: a STALE `gallery_session` cookie (from a
// different gallery or an expired session) used to win over the freshly-minted,
// this-gallery-scoped token, poisoning the SSR sub-fetches → 403 → 500 on share
// links. The render must always prefer the minted token, and the bridge must
// overwrite a stale cookie.
describe("resolveEffectiveSessionToken", () => {
  it("prefers the freshly-minted token over a stale cookie (the #182 fix)", () => {
    // Before the fix this returned "stale-cross-gallery-cookie" → assets 403 → 500.
    expect(
      resolveEffectiveSessionToken("stale-cross-gallery-cookie", "fresh-mint"),
    ).toBe("fresh-mint");
  });

  it("uses the minted token when there is no cookie", () => {
    expect(resolveEffectiveSessionToken(undefined, "fresh-mint")).toBe(
      "fresh-mint",
    );
  });

  it("falls back to the cookie when nothing was minted (password unlock / revisit)", () => {
    expect(resolveEffectiveSessionToken("valid-cookie", null)).toBe(
      "valid-cookie",
    );
    expect(resolveEffectiveSessionToken("valid-cookie", undefined)).toBe(
      "valid-cookie",
    );
  });

  it("is undefined when neither a cookie nor a mint exists", () => {
    expect(resolveEffectiveSessionToken(undefined, null)).toBeUndefined();
    expect(resolveEffectiveSessionToken(undefined, undefined)).toBeUndefined();
  });
});

describe("shouldInstallMintedSession", () => {
  it("installs the mint when there is no cookie", () => {
    expect(shouldInstallMintedSession(undefined, "fresh-mint")).toBe(true);
  });

  it("installs the mint when it differs from a stale cookie (corrects it client-side)", () => {
    expect(shouldInstallMintedSession("stale-cookie", "fresh-mint")).toBe(true);
  });

  it("does not re-install when the cookie already equals the mint", () => {
    expect(shouldInstallMintedSession("same-token", "same-token")).toBe(false);
  });

  it("does not install when nothing was minted", () => {
    expect(shouldInstallMintedSession("valid-cookie", null)).toBe(false);
    expect(shouldInstallMintedSession("valid-cookie", undefined)).toBe(false);
    expect(shouldInstallMintedSession(undefined, null)).toBe(false);
  });
});
