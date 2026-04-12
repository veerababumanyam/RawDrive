import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import DashboardLayout from "../layout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

const mockUsePathname = vi.fn(() => "/galleries");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
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

const mockGetStoredPlatformRole = vi.fn(() => "photographer");
const mockGetStoredAccessTokenClaims = vi.fn(() => ({
  workspace_id: "workspace-123",
  platform_role: "photographer",
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  getStoredAccessTokenClaims: () => mockGetStoredAccessTokenClaims(),
  getStoredPlatformRole: () => mockGetStoredPlatformRole(),
  refreshAuthSession: vi.fn(async () => "test-token"),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function setRole(role: string) {
  mockGetStoredPlatformRole.mockReturnValue(role);
  mockGetStoredAccessTokenClaims.mockReturnValue({
    workspace_id: "workspace-123",
    platform_role: role,
  });
}

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
  mockUsePathname.mockReturnValue("/galleries");
  setRole("photographer");
});

/* ------------------------------------------------------------------ */
/*  Existing header tests (preserved)                                 */
/* ------------------------------------------------------------------ */

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
      name: "Search galleries, clients, or files...",
    });

    expect(searchInput).toHaveAttribute("placeholder", "Search galleries, clients, or files...");

    const header = searchInput.closest("header");
    expect(header).not.toBeNull();
    expect(header?.className).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)_minmax(0,1fr)]");
  });

  it("renders authenticated content after the layout auth check completes", async () => {
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    });
  });

  it("notification bell has aria-label for screen readers", async () => {
    renderDashboardLayout();
    const bell = await screen.findByRole("button", { name: "Notifications" });
    expect(bell).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Role-based sidebar switching                                      */
/* ------------------------------------------------------------------ */

describe("DashboardLayout role-based sidebar", () => {
  it("renders StudioSidebar with grouped nav for photographer", async () => {
    setRole("photographer");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Creative Studio")).toBeInTheDocument();
    });
    // Grouped section headers
    expect(screen.getByText("Creative")).toBeInTheDocument();
    expect(screen.getByText("Business")).toBeInTheDocument();
    // Key nav items
    expect(screen.getByRole("link", { name: /Galleries/i })).toHaveAttribute("href", "/galleries");
    expect(screen.getByRole("link", { name: /AI Studio/i })).toHaveAttribute("href", "/ai");
    expect(screen.getByRole("link", { name: /Invoices/i })).toHaveAttribute("href", "/billing");
  });

  it("renders AdminSidebar with 8 items for admin", async () => {
    setRole("admin");
    mockUsePathname.mockReturnValue("/admin/users");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Admin Console")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Users/i })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: /Moderation/i })).toHaveAttribute("href", "/admin/moderation");
    expect(screen.getByRole("link", { name: /System Health/i })).toHaveAttribute("href", "/admin/system");
    expect(screen.getByRole("link", { name: /Audit Logs/i })).toHaveAttribute("href", "/admin/audit-logs");
    expect(screen.getByRole("link", { name: /Revenue/i })).toHaveAttribute("href", "/admin/revenue");
    expect(screen.getByRole("link", { name: /Analytics/i })).toHaveAttribute("href", "/admin/analytics");
    expect(screen.getByRole("link", { name: /Workspaces/i })).toHaveAttribute("href", "/admin/workspaces");
  });

  it("shows Super Admin badge for super_admin role", async () => {
    setRole("super_admin");
    mockUsePathname.mockReturnValue("/admin/dashboard");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Admin Console")).toBeInTheDocument();
    });
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
  });

  it("renders DealerSidebar with 6 items for dealer", async () => {
    setRole("dealer");
    mockUsePathname.mockReturnValue("/dealer");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dealer Portal")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /My Territory/i })).toHaveAttribute("href", "/dealer/territory");
    expect(screen.getByRole("link", { name: /Registrations/i })).toHaveAttribute("href", "/dealer/registrations");
    expect(screen.getByRole("link", { name: /Coupons/i })).toHaveAttribute("href", "/dealer/coupons");
    expect(screen.getByRole("link", { name: /Revenue Share/i })).toHaveAttribute("href", "/dealer/revenue-share");
    expect(screen.getByRole("link", { name: /Payouts/i })).toHaveAttribute("href", "/dealer/payouts");
  });

  it("renders ClientSidebar with 4 items for client", async () => {
    setRole("client");
    mockUsePathname.mockReturnValue("/galleries");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("My Photos")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Proofing/i })).toHaveAttribute("href", "/proofing");
    expect(screen.getByRole("link", { name: /Favorites/i })).toHaveAttribute("href", "/favorites");
    expect(screen.getByRole("link", { name: /Downloads/i })).toHaveAttribute("href", "/downloads");
  });

  it("renders StudioSidebar for team_member (explicit case)", async () => {
    setRole("team_member");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Creative Studio")).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Role-specific header nav and search placeholder                   */
/* ------------------------------------------------------------------ */

describe("DashboardLayout role-specific header", () => {
  it("admin header shows Overview link to /admin/dashboard", async () => {
    setRole("admin");
    mockUsePathname.mockReturnValue("/admin/users");
    renderDashboardLayout();

    const quickNav = await screen.findByRole("navigation", { name: "Workspace quick navigation" });
    expect(within(quickNav).getByText("Overview")).toBeInTheDocument();
    expect(within(quickNav).getByRole("link")).toHaveAttribute("href", "/admin/dashboard");
  });

  it("admin search placeholder is role-specific", async () => {
    setRole("admin");
    mockUsePathname.mockReturnValue("/admin/users");
    renderDashboardLayout();

    const searchInput = await screen.findByRole("textbox", {
      name: "Search users, workspaces, or logs...",
    });
    expect(searchInput).toHaveAttribute("placeholder", "Search users, workspaces, or logs...");
  });

  it("dealer search placeholder is role-specific", async () => {
    setRole("dealer");
    mockUsePathname.mockReturnValue("/dealer");
    renderDashboardLayout();

    const searchInput = await screen.findByRole("textbox", {
      name: "Search registrations or coupons...",
    });
    expect(searchInput).toBeInTheDocument();
  });

  it("client search placeholder is role-specific", async () => {
    setRole("client");
    mockUsePathname.mockReturnValue("/galleries");
    renderDashboardLayout();

    const searchInput = await screen.findByRole("textbox", {
      name: "Search your photos...",
    });
    expect(searchInput).toBeInTheDocument();
  });
});
