import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import DashboardLayout from "../layout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/galleries"),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", { ...props, alt: props.alt ?? "" }),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  getStoredAccessTokenClaims: vi.fn(() => ({ workspace_id: "workspace-123", platform_role: "photographer" })),
}));

function renderDashboardLayout() {
  return render(
    <ThemeProvider>
      <DashboardLayout>
        <div>Dashboard content</div>
      </DashboardLayout>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardLayout header", () => {
  it("renders quick navigation links with workspace-specific hover copy", async () => {
    renderDashboardLayout();

    const quickNav = await screen.findByRole("navigation", { name: "Workspace quick navigation" });
    const homeLink = within(quickNav).getByRole("link", { name: "Open your studio dashboard" });
    const projectsLink = within(quickNav).getByRole("link", { name: "Browse gallery projects and client deliveries" });

    expect(homeLink).toHaveAttribute("href", "/dashboard");
    expect(homeLink).toHaveAttribute("title", "Open your studio dashboard");
    expect(projectsLink).toHaveAttribute("href", "/galleries");
    expect(projectsLink).toHaveAttribute("title", "Browse gallery projects and client deliveries");
    expect(within(quickNav).getByText("Home")).toBeInTheDocument();
    expect(within(quickNav).getByText("Projects")).toBeInTheDocument();
  });

  it("keeps the search field in the centered desktop slot", async () => {
    renderDashboardLayout();

    const searchInput = await screen.findByRole("textbox", {
      name: "Search galleries, clients, or files",
    });

    expect(searchInput).toHaveAttribute("placeholder", "Search galleries, clients, or files...");

    const header = searchInput.closest("header");
    expect(header).not.toBeNull();
    expect(header?.className).toContain("md:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)_minmax(0,1fr)]");
  });

  it("renders authenticated content after the layout auth check completes", async () => {
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    });
  });
});
