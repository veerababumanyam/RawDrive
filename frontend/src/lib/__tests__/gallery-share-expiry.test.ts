import { describe, expect, it } from "vitest";
import { galleryShareExpiryDays } from "../gallery-share-expiry";

describe("galleryShareExpiryDays", () => {
  const now = new Date("2026-06-03T00:00:00.000Z");

  it("leaves no-expiry galleries as no-expiry share links", () => {
    expect(galleryShareExpiryDays({ expires_at: null }, now)).toBeUndefined();
    expect(galleryShareExpiryDays({}, now)).toBeUndefined();
  });

  it("rounds a future gallery expiry up to whole share-token days", () => {
    expect(
      galleryShareExpiryDays(
        { expires_at: "2026-07-03T00:00:00.000Z" },
        now,
      ),
    ).toBe(30);
    expect(
      galleryShareExpiryDays(
        { expires_at: "2026-06-03T12:00:00.000Z" },
        now,
      ),
    ).toBe(1);
  });

  it("never returns zero because the backend treats non-positive days as no expiry", () => {
    expect(
      galleryShareExpiryDays(
        { expires_at: "2026-06-02T00:00:00.000Z" },
        now,
      ),
    ).toBe(1);
  });
});
