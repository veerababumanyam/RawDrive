import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/ui/page-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  usePathname: () => "/galleries/abc/settings",
}));

describe("PageHeader", () => {
  it("renders the title as a single h1 with the token type scale", () => {
    render(<PageHeader title="Gallery Settings" />);
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Gallery Settings",
    });
    expect(heading.className).toContain("text-2xl");
    expect(heading.className).toContain("text-text-primary");
  });

  it("renders an optional eyebrow + description and forwards titleId", () => {
    render(
      <PageHeader
        title="Delivery"
        eyebrow="Delivery"
        description="Track downloads and continuity."
        titleId="page-title"
      />,
    );
    expect(
      screen.getByText("Track downloads and continuity."),
    ).toBeInTheDocument();
    // Eyebrow uses a built-in tracking token, never an arbitrary tracking-[...] value.
    const eyebrow = screen.getByText("Delivery", { selector: "p" });
    expect(eyebrow.className).toContain("uppercase");
    expect(eyebrow.className).not.toMatch(/tracking-\[[^\]]+\]/);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "id",
      "page-title",
    );
  });

  it("renders a back link via the shared BackButton when backHref is set", () => {
    render(
      <PageHeader
        title="Cover & Design"
        backHref="/galleries/abc"
        backLabel="Back to gallery"
      />,
    );
    const back = screen.getByRole("link", { name: /back to gallery/i });
    expect(back).toHaveAttribute("href", "/galleries/abc");
  });

  it("omits the back link when no backHref is given", () => {
    render(<PageHeader title="Galleries" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an actions slot for header controls", () => {
    render(
      <PageHeader
        title="Sales"
        actions={<button type="button">Save</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders compact metadata beside the title", () => {
    render(
      <PageHeader
        title="Galleries"
        titleAccessory={<span>2 galleries</span>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Galleries" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 galleries")).toBeInTheDocument();
  });
});
