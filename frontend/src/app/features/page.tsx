import type { Metadata } from "next";
import { FeaturesContent } from "@/components/features/FeaturesContent";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore all RawDrive features — gallery delivery, client proofing, AI culling, CRM, live streaming, marketplaces, and more.",
};

export default function FeaturesPage() {
  return <FeaturesContent />;
}
