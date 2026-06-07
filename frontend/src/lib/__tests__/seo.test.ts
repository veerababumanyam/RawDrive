import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  AI_ALLOW_CRAWLERS,
  AI_DISALLOW_CRAWLERS,
  AI_SEARCH_CRAWLERS,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildLlmsTxt,
  buildMarketingSitemap,
  buildSiteJsonLd,
  createPageMetadata,
  PUBLIC_PAGES,
} from "@/lib/seo";
import robots from "@/app/robots";

// Bots that must NEVER appear in the allow group: training crawlers + the
// directive-only training opt-out tokens. Allowing an opt-out token opts you IN.
const TRAINING_OR_OPTOUT = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
];

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
    expect(llms).toContain(
      "Dashboard routes, auth routes, shortlinks, streams, and client gallery share links",
    );
    expect(llms).not.toContain("https://rawdrive.in/g/");
  });
});

describe("AI crawler policy", () => {
  it("allows search/answer + user bots (citation eligibility)", () => {
    for (const bot of [
      "OAI-SearchBot",
      "Claude-SearchBot",
      "PerplexityBot",
      "Bingbot",
      "Applebot",
    ]) {
      expect(AI_ALLOW_CRAWLERS as readonly string[]).toContain(bot);
    }
  });

  it("disallows training crawlers and training opt-out tokens", () => {
    for (const bot of [
      "GPTBot",
      "ClaudeBot",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
    ]) {
      expect(AI_DISALLOW_CRAWLERS as readonly string[]).toContain(bot);
    }
  });

  it("never leaks a training/opt-out bot into the allow group", () => {
    for (const bot of TRAINING_OR_OPTOUT) {
      expect(AI_ALLOW_CRAWLERS as readonly string[]).not.toContain(bot);
    }
  });

  it("keeps allow and disallow groups disjoint", () => {
    const overlap = (AI_ALLOW_CRAWLERS as readonly string[]).filter((b) =>
      (AI_DISALLOW_CRAWLERS as readonly string[]).includes(b),
    );
    expect(overlap).toEqual([]);
  });

  it("keeps the back-compat AI_SEARCH_CRAWLERS alias free of training bots", () => {
    expect(AI_SEARCH_CRAWLERS).toBe(AI_ALLOW_CRAWLERS);
    for (const bot of TRAINING_OR_OPTOUT) {
      expect(AI_SEARCH_CRAWLERS as readonly string[]).not.toContain(bot);
    }
  });

  it("emits robots groups: '*' + allow bots get public access, training bots get disallow:'/'", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

    const star = rules.find((r) => r.userAgent === "*");
    expect(star?.allow).toBe("/");

    const allowGroup = rules.find(
      (r) =>
        Array.isArray(r.userAgent) && r.userAgent.includes("OAI-SearchBot"),
    );
    expect(allowGroup?.allow).toBe("/");

    const trainGroup = rules.find(
      (r) => Array.isArray(r.userAgent) && r.userAgent.includes("GPTBot"),
    );
    expect(trainGroup?.disallow).toBe("/");
    // training group must NOT grant access
    expect(trainGroup?.allow).toBeUndefined();

    expect(result.sitemap).toBe(`${absoluteUrl("/")}sitemap.xml`);
  });
});

describe("structured-data builders", () => {
  it("builds a BreadcrumbList with absolute, positioned items", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Solutions", path: "/solutions/galleries" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[0]).toMatchObject({ position: 1, name: "Home" });
    expect(ld.itemListElement[1].item).toBe(
      absoluteUrl("/solutions/galleries"),
    );
  });

  it("builds a FAQPage with Question/Answer entities", () => {
    const ld = buildFaqJsonLd([{ question: "How much?", answer: "From ₹0." }]);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "How much?",
      acceptedAnswer: { "@type": "Answer", text: "From ₹0." },
    });
  });

  it("keeps site JSON-LD free of literal RawDrive emails", () => {
    const json = JSON.stringify(buildSiteJsonLd());

    expect(json).toContain(absoluteUrl("/contact"));
    expect(json).not.toMatch(/[A-Za-z0-9._%+-]+@rawdrive\.in/);
    expect(json).not.toMatch(/mailto:/i);
  });
});
