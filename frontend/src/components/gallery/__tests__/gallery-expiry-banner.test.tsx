import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryExpiryBanner } from "../gallery-expiry-banner";

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (msFromNow: number) =>
  new Date(Date.now() + msFromNow).toISOString();

async function renderBanner(props: {
  expiresAt?: string | null;
  thresholdDays?: number;
}) {
  let container!: HTMLElement;
  await act(async () => {
    ({ container } = render(<GalleryExpiryBanner {...props} />));
    await Promise.resolve();
  });
  return container;
}

describe("GalleryExpiryBanner", () => {
  it("shows the countdown when expiry is within the threshold", async () => {
    const container = await renderBanner({ expiresAt: iso(5 * DAY_MS) });
    expect(container.textContent).toMatch(/Available until/i);
    expect(container.textContent).toMatch(/5 days left/i);
  });

  it("renders nothing when the gallery has no expiry", async () => {
    const container = await renderBanner({ expiresAt: null });
    expect(container.textContent).toBe("");
  });

  it("renders nothing when expiry is far beyond the threshold", async () => {
    const container = await renderBanner({
      expiresAt: iso(60 * DAY_MS),
      thresholdDays: 14,
    });
    expect(container.textContent).toBe("");
  });

  it("renders nothing once the gallery has already expired", async () => {
    const container = await renderBanner({ expiresAt: iso(-1 * DAY_MS) });
    expect(container.textContent).toBe("");
  });
});
