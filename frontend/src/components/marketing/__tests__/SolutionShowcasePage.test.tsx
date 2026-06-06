import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

import { Clock3 } from "@/components/icons";
import { SolutionShowcasePage } from "@/components/marketing/SolutionShowcasePage";

const baseProps = {
  path: "/solutions/test",
  eyebrow: "Test solution",
  title: "A public solution page title",
  description: "A public solution page description.",
  previewSrc: "/marketing/rawdrive-ai-intelligence.avif",
  previewAlt: "Preview alt text",
  previewLabel: "Preview label",
  primaryCta: { href: "/register", label: "Primary action" },
  secondaryCta: { href: "/pricing", label: "Secondary action" },
  stats: [{ label: "Status", value: "Preview" }],
  features: [
    {
      icon: Clock3,
      title: "Feature title",
      description: "Feature description.",
    },
  ],
  workflow: [
    {
      title: "Workflow step",
      description: "Workflow description.",
    },
  ],
  answer: "This is the answer summary.",
  quoteTitle: "A quote title",
  quoteBody: "A quote body.",
};

describe("SolutionShowcasePage", () => {
  it("renders an availability notice when a feature is coming soon", async () => {
    const page = await SolutionShowcasePage({
      ...baseProps,
      availabilityNotice: {
        label: "Coming soon",
        title: "AI culling is not enabled yet.",
        description:
          "Current public and studio surfaces will not show culling controls until rollout is enabled.",
      },
    });

    render(page);

    const notice = screen.getByRole("status");
    expect(notice).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "AI culling is not enabled yet.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/will not show culling controls/i),
    ).toBeInTheDocument();

    const firstHeroItems = Array.from(
      document.querySelectorAll(".solution-showcase-grid > *"),
    );
    expect(firstHeroItems[0]).toBe(notice);
  });
});
