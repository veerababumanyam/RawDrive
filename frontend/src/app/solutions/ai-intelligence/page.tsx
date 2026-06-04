import type { Metadata } from "next";
import { BrainCircuit, CopyCheck, Search, Sparkles } from "@/components/icons";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("ai");

export default function AIIngelligencePage() {
  return (
    <SolutionShowcasePage
      path="/solutions/ai-intelligence"
      eyebrow="AI Intelligence"
      title="Cull, search, and recognize faces without losing the editorial feel of the product."
      description="Shortlist large wedding and event shoots faster with quality ranking, duplicate detection, semantic search, and face-aware discovery connected to delivery."
      previewSrc="/stitch/solution-ai.png"
      previewAlt="RawDrive AI culling and face recognition dashboard preview"
      previewLabel="AI intelligence dashboard"
      primaryCta={{ href: "/register", label: "Try AI workflows" }}
      secondaryCta={{
        href: "/solutions/galleries",
        label: "See gallery delivery",
      }}
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
      answer="RawDrive AI Intelligence is best for photographers who need to reduce culling time, find strong frames, group people, and move shortlisted photos into proofing without turning the studio into a generic AI dashboard."
      quoteTitle="AI should shorten the edit, not replace the photographer."
      quoteBody="RawDrive keeps AI assistance inside the real studio workflow: import the shoot, surface the best frames, review decisions, and move the work into client-facing delivery."
    />
  );
}
