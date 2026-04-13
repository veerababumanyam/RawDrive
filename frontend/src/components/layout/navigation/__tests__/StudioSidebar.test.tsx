import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioSidebar } from "../StudioSidebar";

const mockUsePathname = vi.fn(() => "/crm");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", { ...props, alt: props.alt ?? "" }),
}));

describe("StudioSidebar CRM grouping", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/crm");
  });

  it("surfaces Studio CRM as the business umbrella instead of flat business modules", () => {
    render(<StudioSidebar userName="Priya Studio" />);

    expect(screen.getByRole("link", { name: /studio crm/i })).toHaveAttribute("href", "/crm");
    expect(screen.queryByRole("link", { name: /^Leads$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Deals$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Bookings$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Invoices$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Packages$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^GSTR-1$/i })).not.toBeInTheDocument();
  });

  it("keeps Studio CRM active for legacy business routes", () => {
    mockUsePathname.mockReturnValue("/billing");
    render(<StudioSidebar userName="Priya Studio" />);

    expect(screen.getByRole("link", { name: /studio crm/i }).className).toContain("text-accent");
  });
});
