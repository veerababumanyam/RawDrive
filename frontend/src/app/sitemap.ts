import type { MetadataRoute } from "next";
import { buildMarketingSitemap } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildMarketingSitemap();
}
