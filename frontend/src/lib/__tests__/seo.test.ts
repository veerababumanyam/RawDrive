import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildLlmsTxt,
  buildMarketingSitemap,
  createPageMetadata,
  PUBLIC_PAGES,
} from "@/lib/seo";

describe("public SEO metadata", () => {
  it("keeps brand suffixes out of route titles that use the root template", () => {
    for (const page of PUBLIC_PAGES) {
      if ("absoluteTitle" in page && page.absoluteTitle) continue;
      expect(page.title).not.toMatch(/\|\s*RawDrive/i);
    }
  });

  it("builds canonical metadata for public marketing pages", () => {
    const metadata = createPageMetadata("pricing");
    expect(metadata.title).toBe("Pricing for Indian Photography Studios");
    expect(metadata.description).toMatch(/Compare RawDrive plans/i);
    expect(metadata.alternates?.canonical).toBe(absoluteUrl("/pricing"));
  });

  it("keeps conversion-only pages out of the sitemap", () => {
    const sitemap = buildMarketingSitemap();
    const urls = sitemap.map((entry) => entry.url);

    expect(urls).toContain(absoluteUrl("/"));
    expect(urls).toContain(absoluteUrl("/pricing"));
    expect(urls).toContain(absoluteUrl("/solutions/galleries"));
    expect(urls).not.toContain(absoluteUrl("/register"));
  });

  it("publishes an AI-readable public page summary without private share routes", () => {
    const llms = buildLlmsTxt();

    expect(llms).toContain("## Public pages");
    expect(llms).toContain(absoluteUrl("/features"));
    expect(llms).toContain("Dashboard routes, auth routes, shortlinks, streams, and client gallery share links");
    expect(llms).not.toContain("https://rawdrive.in/g/");
  });
});
