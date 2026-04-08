import type { Metadata } from "next";
import { BrainCircuit, CopyCheck, Search, Sparkles } from "lucide-react";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";

export const metadata: Metadata = {
  title: "AI Intelligence & FaceID | RawDrive",
  description:
    "Smart culling, Face recognition, and AI-assisted workflows for professional photographers.",
};

export default function AIIngelligencePage() {
  return (
    <SolutionShowcasePage
      eyebrow="AI Intelligence"
      title="Cull, search, and recognize faces without losing the editorial feel of the product."
      description="The live page body is now anchored to the Stitch AI dashboard direction instead of a one-paragraph placeholder."
      previewSrc="/stitch/solution-ai.png"
      previewAlt="Stitch AI dashboard preview"
      previewLabel="AI intelligence dashboard"
      primaryCta={{ href: "/register", label: "Try AI workflows" }}
      secondaryCta={{ href: "/solutions/galleries", label: "See gallery delivery" }}
      stats={[
        { label: "Culling", value: "Thousands in one pass" },
        { label: "Search", value: "Natural language ready" },
        { label: "Face ID", value: "Client friendly" },
      ]}
      features={[
        {
          icon: Sparkles,
          title: "Smart ranking",
          description:
            "Sort images by quality, composition, and delivery readiness without a spreadsheet workflow.",
        },
        {
          icon: CopyCheck,
          title: "Duplicate detection",
          description:
            "Remove near-identical frames and simplify large wedding or event shoots before edit time starts.",
        },
        {
          icon: Search,
          title: "Semantic retrieval",
          description:
            "Find moments, scenes, and people faster with search that works on meaning, not just filenames.",
        },
        {
          icon: BrainCircuit,
          title: "Face-based discovery",
          description:
            "Group subjects and deliver person-specific experiences instead of forcing clients through folders.",
        },
      ]}
      workflow={[
        {
          title: "Import the full shoot",
          description:
            "Bring in the full take without spending the first hour manually tagging and sorting folders.",
        },
        {
          title: "Let the system surface the best frames",
          description:
            "Use ranking, duplicate detection, and face-aware workflows to shrink the editing set quickly.",
        },
        {
          title: "Push directly into delivery",
          description:
            "Move approved selections back into galleries, proofing, and client-facing experiences without extra handoff steps.",
        },
      ]}
      quoteTitle="The Stitch AI page was a real product surface, not just a marketing heading."
      quoteBody="That same principle now drives this route: it showcases operational AI tooling with a premium visual layer instead of generic AI buzzwords."
    />
  );
}
