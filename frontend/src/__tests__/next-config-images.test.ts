import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config images", () => {
  it("allows the landing hero image quality used by next/image", () => {
    expect(nextConfig.images?.qualities).toEqual(
      expect.arrayContaining([75, 94]),
    );
  });
});
