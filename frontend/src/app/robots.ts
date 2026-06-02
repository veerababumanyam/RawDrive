import type { MetadataRoute } from "next";
import { AI_SEARCH_CRAWLERS, ROBOTS_PRIVATE_PATHS, SITE_URL } from "@/lib/seo";

const publicRules = {
  allow: "/",
  disallow: ROBOTS_PRIVATE_PATHS,
};

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        ...publicRules,
      },
      {
        userAgent: [...AI_SEARCH_CRAWLERS],
        ...publicRules,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
