import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config images", () => {
  it("serves optimized public images as AVIF/WebP at the default quality", () => {
    expect(nextConfig.images?.formats).toEqual(["image/avif", "image/webp"]);
    expect(nextConfig.images?.qualities).toEqual([75]);
  });
});
