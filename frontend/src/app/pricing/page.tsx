import type { Metadata } from "next";
import { PricingContent } from "@/components/pricing/PricingContent";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("pricing");

export default function PricingPage() {
  return <PricingContent />;
}
