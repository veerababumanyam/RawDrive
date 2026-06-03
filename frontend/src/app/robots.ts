import type { MetadataRoute } from "next";
import {
  AI_ALLOW_CRAWLERS,
  AI_DISALLOW_CRAWLERS,
  ROBOTS_PRIVATE_PATHS,
  SITE_URL,
} from "@/lib/seo";

// Public crawl: everything except the JWT-gated app + share surfaces.
const publicRules = {
  allow: "/",
  disallow: ROBOTS_PRIVATE_PATHS,
};

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Classic search engines (Googlebot, Bingbot, …) and Google AI Overviews,
      // which use the live search index.
      {
        userAgent: "*",
        ...publicRules,
      },
      // AI answer / live-retrieval crawlers we WANT citing us (ChatGPT search,
      // Claude, Perplexity, Copilot, Siri) — same public access as search engines.
      {
        userAgent: [...AI_ALLOW_CRAWLERS],
        ...publicRules,
      },
      // AI model-training crawlers + training opt-out tokens — disallowed so our
      // content is not ingested for training. This does NOT affect search or
      // AI-answer citation (those use the crawlers above).
      {
        userAgent: [...AI_DISALLOW_CRAWLERS],
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
