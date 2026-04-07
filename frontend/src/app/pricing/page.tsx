import type { Metadata } from "next";
import { PricingContent } from "@/components/pricing/PricingContent";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Indian photographers. Start free, scale as you grow.",
};

export default function PricingPage() {
  return <PricingContent />;
}
