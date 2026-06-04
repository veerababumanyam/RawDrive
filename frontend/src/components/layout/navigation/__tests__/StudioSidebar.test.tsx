import {
  createElement,
  type AnchorHTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StudioSidebar } from "../StudioSidebar";

const mockUsePathname = vi.fn(() => "/crm");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", { ...props, alt: props.alt ?? "" }),
}));

describe("StudioSidebar CRM grouping", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/crm");
    window.localStorage.clear();
    document.documentElement.style.removeProperty("--sidebar-width-expanded");
    document.body.style.removeProperty("--sidebar-width-expanded");
  });

  it("surfaces Studio CRM as the business umbrella instead of flat business modules", () => {
    render(<StudioSidebar userName="Priya Studio" />);

    expect(screen.getByRole("link", { name: /studio crm/i })).toHaveAttribute(
      "href",
      "/crm",
    );
    expect(
      screen.queryByRole("link", { name: /^Leads$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Deals$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Bookings$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Invoices$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Packages$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^GSTR-1$/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps dashboard-linked business pages directly discoverable in the sidebar", () => {
    render(<StudioSidebar userName="Priya Studio" />);

    expect(screen.getByRole("link", { name: /^Calendar$/i })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(screen.getByRole("link", { name: /^Billing$/i })).toHaveAttribute(
      "href",
      "/billing",
    );
  });

  it("keeps Billing active without marking Studio CRM active", () => {
    mockUsePathname.mockReturnValue("/billing");
    render(<StudioSidebar userName="Priya Studio" />);

    expect(
      screen.getByRole("link", { name: /^Billing$/i }).className,
    ).toContain("text-accent");
    expect(
      screen.getByRole("link", { name: /studio crm/i }).className,
    ).not.toContain("text-accent");
  });

  it("does not expose install app as a separate studio navigation item", () => {
    render(<StudioSidebar userName="Priya Studio" />);

    expect(
      screen.queryByRole("link", { name: /desktop app/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /install app/i }),
    ).not.toBeInTheDocument();
  });

  it("consolidates profile, business, storage, and install app into one Settings entry", () => {
    render(<StudioSidebar userName="Priya Studio" />);

    const settingsLink = screen.getByRole("link", { name: /^Settings$/i });
    expect(settingsLink).toHaveAttribute("href", "/settings/profile");
    expect(settingsLink.closest("nav")).toBeNull();
    expect(
      settingsLink.closest('[aria-label="Sidebar utilities"]'),
    ).not.toBeNull();
    expect(
      screen.queryByRole("link", { name: /^Profile$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Business Profile$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Storage$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Install App$/i }),
    ).not.toBeInTheDocument();
  });

  it("persists user-adjusted expanded sidebar width", () => {
    render(<StudioSidebar userName="Priya Studio" />);

    const resizeHandle = screen.getByRole("separator", {
      name: "Resize navigation",
    });
    fireEvent.keyDown(resizeHandle, { key: "ArrowRight" });

    expect(window.localStorage.getItem("rawdrive:sidebar:expanded-width")).toBe(
      "248",
    );
    expect(
      document.documentElement.style.getPropertyValue(
        "--sidebar-width-expanded",
      ),
    ).toBe("248px");
    expect(
      document.body.style.getPropertyValue("--sidebar-width-expanded"),
    ).toBe("248px");
  });

  it("renders the profile footer as a normal sidebar row", () => {
    render(<StudioSidebar userName="Priya Studio" />);

    const profileRow = screen
      .getByText("Priya Studio")
      .closest(".sidebar-nav-link");
    expect(profileRow).not.toBeNull();
    expect(profileRow?.className).toContain("sidebar-nav-link");
    expect(profileRow?.className).not.toContain("surface-panel");
    expect(profileRow?.className).toContain("hover:bg-surface-container-low");
  });
});
