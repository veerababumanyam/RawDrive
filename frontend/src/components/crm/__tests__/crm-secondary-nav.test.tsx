import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { CRMSecondaryNav } from "../crm-secondary-nav";

const mockUsePathname = vi.fn(() => "/crm/projects");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("CRMSecondaryNav project route", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/crm/projects");
  });

  it("points Projects at the Studio Project board", () => {
    render(<CRMSecondaryNav />);

    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/crm/projects");
    expect(screen.getByRole("link", { name: "Projects" }).className).toContain("bg-accent-primary");
  });

  it("keeps Projects active on project detail routes", () => {
    mockUsePathname.mockReturnValue("/crm/projects/project-1");
    render(<CRMSecondaryNav />);

    expect(screen.getByRole("link", { name: "Projects" }).className).toContain("bg-accent-primary");
  });
});
