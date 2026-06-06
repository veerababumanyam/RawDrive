import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

import StudioLandingPage from "@/app/studio/page";

describe("/studio retired public landing page", () => {
  it("fails closed instead of rendering deprecated subdomain-backed studio URLs", () => {
    expect(() => StudioLandingPage()).toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});
