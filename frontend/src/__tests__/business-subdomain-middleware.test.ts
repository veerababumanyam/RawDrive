import { describe, expect, it } from "vitest";
import {
  config,
  resolveBusinessSubdomainRewrite,
  shouldPassThroughBusinessSubdomainPath,
} from "@/middleware";

describe("business subdomain middleware routing", () => {
  it("rewrites the root business subdomain to the public studio landing page", () => {
    const rewrite = resolveBusinessSubdomainRewrite("/", "", "kaveri-stories-a1b2c3d4");

    expect(rewrite).toEqual({
      pathname: "/studio",
      search: "?ws=kaveri-stories-a1b2c3d4",
    });
  });

  it("continues routing gallery slugs under the same business subdomain", () => {
    const rewrite = resolveBusinessSubdomainRewrite(
      "/wedding-veera",
      "?album=family",
      "kaveri-stories-a1b2c3d4",
    );

    expect(rewrite).toEqual({
      pathname: "/g/wedding-veera",
      search: "?album=family&ws=kaveri-stories-a1b2c3d4",
    });
  });

  it("passes public static assets through instead of treating them as gallery slugs", () => {
    expect(shouldPassThroughBusinessSubdomainPath("/theme-init.js")).toBe(true);
    expect(shouldPassThroughBusinessSubdomainPath("/manifest.json")).toBe(true);
    expect(shouldPassThroughBusinessSubdomainPath("/service-worker.js")).toBe(true);
    expect(shouldPassThroughBusinessSubdomainPath("/logo/favicon-32x32.png")).toBe(true);
    expect(shouldPassThroughBusinessSubdomainPath("/CoBolt/CoBolt_Name_Logo.png")).toBe(true);
  });

  it("still rewrites normal business-subdomain gallery paths", () => {
    expect(shouldPassThroughBusinessSubdomainPath("/")).toBe(false);
    expect(shouldPassThroughBusinessSubdomainPath("/wedding-veera")).toBe(false);
    expect(shouldPassThroughBusinessSubdomainPath("/wedding-veera/photo/asset-123")).toBe(false);
  });

  it("keeps public static assets out of the middleware matcher entirely", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test("/theme-init.js")).toBe(false);
    expect(matcher.test("/manifest.json")).toBe(false);
    expect(matcher.test("/service-worker.js")).toBe(false);
    expect(matcher.test("/logo/favicon-32x32.png")).toBe(false);
    expect(matcher.test("/CoBolt/CoBolt_Name_Logo.png")).toBe(false);

    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/wedding-veera")).toBe(true);
    expect(matcher.test("/wedding-veera/photo/asset-123")).toBe(true);
  });
});
