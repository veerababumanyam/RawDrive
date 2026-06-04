import { describe, it, expect } from "vitest";

import { routeTemplateFromPathname } from "./route-template";

describe("routeTemplateFromPathname", () => {
  it("collapses the gallery detail route to its template", () => {
    expect(routeTemplateFromPathname("/galleries/abc-123-def")).toBe(
      "/galleries/[id]",
    );
  });

  it("collapses the public gallery share route to its template", () => {
    expect(routeTemplateFromPathname("/g/some-slug")).toBe("/g/[slug]");
  });

  it("collapses nested public gallery sub-routes (most specific first)", () => {
    expect(routeTemplateFromPathname("/g/slug/photo/asset-xyz")).toBe(
      "/g/[slug]/photo/[assetId]",
    );
    expect(routeTemplateFromPathname("/g/slug/people/person-1")).toBe(
      "/g/[slug]/people/[personId]",
    );
    expect(routeTemplateFromPathname("/g/slug/people")).toBe("/g/[slug]/people");
  });

  it("collapses the studio profile route to its template", () => {
    expect(routeTemplateFromPathname("/p/my-studio")).toBe("/p/[slug]");
  });

  it("keeps static dashboard routes verbatim", () => {
    expect(routeTemplateFromPathname("/dashboard")).toBe("/dashboard");
    expect(routeTemplateFromPathname("/galleries")).toBe("/galleries");
  });

  it("returns '/' for root, empty, null or undefined", () => {
    expect(routeTemplateFromPathname("/")).toBe("/");
    expect(routeTemplateFromPathname("")).toBe("/");
    expect(routeTemplateFromPathname(null)).toBe("/");
    expect(routeTemplateFromPathname(undefined)).toBe("/");
  });

  it("strips a query string so no token leaks into the label (PII guard)", () => {
    expect(routeTemplateFromPathname("/g/slug?token=secret")).toBe("/g/[slug]");
    expect(routeTemplateFromPathname("/dashboard?ref=email#top")).toBe(
      "/dashboard",
    );
  });

  it("normalises a trailing slash", () => {
    expect(routeTemplateFromPathname("/galleries/abc/")).toBe("/galleries/[id]");
  });
});
