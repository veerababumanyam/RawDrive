import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageContainer } from "@/components/ui/page-container";

describe("PageContainer", () => {
  it("renders children inside a centered, token-padded shell", () => {
    render(
      <PageContainer data-testid="shell">
        <p>content</p>
      </PageContainer>,
    );

    const shell = screen.getByTestId("shell");
    expect(screen.getByText("content")).toBeInTheDocument();
    // Centered + consistent gutter/rhythm — the established dashboard pattern.
    expect(shell.className).toContain("mx-auto");
    expect(shell.className).toContain("px-4");
    expect(shell.className).toContain("py-8");
    expect(shell.className).toContain("space-y-6");
    // Default width.
    expect(shell.className).toContain("max-w-6xl");
  });

  it("maps the width prop to a single max-width token, never an arbitrary value", () => {
    const { rerender } = render(
      <PageContainer width="narrow" data-testid="shell">
        x
      </PageContainer>,
    );
    expect(screen.getByTestId("shell").className).toContain("max-w-3xl");

    rerender(
      <PageContainer width="editor" data-testid="shell">
        x
      </PageContainer>,
    );
    expect(screen.getByTestId("shell").className).toContain("max-w-5xl");

    rerender(
      <PageContainer width="full" data-testid="shell">
        x
      </PageContainer>,
    );
    expect(screen.getByTestId("shell").className).toContain("max-w-none");

    // No arbitrary bracket widths must ever leak in.
    expect(screen.getByTestId("shell").className).not.toMatch(/\[[^\]]+\]/);
  });

  it("merges a caller className without dropping the base classes", () => {
    render(
      <PageContainer className="custom-extra" data-testid="shell">
        x
      </PageContainer>,
    );
    const shell = screen.getByTestId("shell");
    expect(shell.className).toContain("custom-extra");
    expect(shell.className).toContain("mx-auto");
  });
});
