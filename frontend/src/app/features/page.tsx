import type { Metadata } from "next";
import { FeaturesContent } from "@/components/features/FeaturesContent";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("features");

export default function FeaturesPage() {
  return <FeaturesContent />;
}
