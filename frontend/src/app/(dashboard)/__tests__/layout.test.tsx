import {
  createElement,
  type AnchorHTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  // S5-G1: the layout now mounts ImpersonationBanner, which reads these. Tests
  // exercise normal (non-impersonation) sessions, so the banner stays hidden.
  isImpersonatingSession: vi.fn(() => false),
  logoutAuthSession: vi.fn(async () => {}),
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/auth/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            display_name: "Studio User",
            email: "studio@example.test",
            plan_tier: "pro",
          }),
        } as Response;
      }
      if (url.includes("/api/v1/uploads/balance")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            available_credits: 2500,
            low_balance: false,
            low_balance_threshold: 100,
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ packages: [] }),
      } as Response;
    }),
  );
  mockUsePathname.mockReturnValue("/galleries");
  setRole("photographer");
});

/* ------------------------------------------------------------------ */
/*  Existing header tests (preserved)                                 */
/* ------------------------------------------------------------------ */

describe("DashboardLayout header", () => {
  it("renders home and gallery shortcuts before the search field", async () => {
    renderDashboardLayout();

    const shortcuts = await screen.findByRole("navigation", {
      name: "Primary workspace shortcuts",
    });
    const homeLink = within(shortcuts).getByRole("link", {
      name: "Home",
    });
    const galleriesLink = within(shortcuts).getByRole("link", {
      name: "Galleries",
    });
    const searchInput = await screen.findByRole("searchbox", {
      name: "Search galleries, clients, or files...",
    });
    const searchForm = searchInput.closest("form");

    expect(homeLink).toHaveAttribute("href", "/dashboard");
    expect(homeLink).toHaveAttribute("title", "Open home");
    expect(galleriesLink).toHaveAttribute("href", "/galleries");
    expect(galleriesLink).toHaveAttribute("title", "Open galleries");
    expect(shortcuts.compareDocumentPosition(searchForm as Element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("bounds the search field inside the responsive header layout", async () => {
    renderDashboardLayout();

    const searchInput = await screen.findByRole("searchbox", {
      name: "Search galleries, clients, or files...",
    });

    expect(searchInput).toHaveAttribute(
      "placeholder",
      "Search galleries, clients, or files...",
    );
    expect(searchInput.className).toContain("dashboard-header__search-input");

    const form = searchInput.closest("form");
    expect(form?.className).toContain("dashboard-header__search");

    const header = searchInput.closest("header");
    expect(header).not.toBeNull();
    expect(header?.className).toContain("dashboard-header");
    expect(header?.className).not.toContain("lg:grid-cols");
  });

  it("renders authenticated content after the layout auth check completes", async () => {
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    });
  });

  it("notification bell has aria-label for screen readers", async () => {
    renderDashboardLayout();
    const bell = await screen.findByRole("link", { name: "Notifications" });
    expect(bell).toBeInTheDocument();
    expect(bell.className).toContain("glass-icon-button");
  });

  it("routes the header gallery shortcut to galleries", async () => {
    renderDashboardLayout();

    const searchInput = await screen.findByRole("searchbox", {
      name: "Search galleries, clients, or files...",
    });
    const header = searchInput.closest("header");
    expect(header).not.toBeNull();

    const shortcutNav = within(header as HTMLElement).getByRole("navigation", {
      name: "Primary workspace shortcuts",
    });
    const galleryShortcut = within(shortcutNav).getByRole("link", {
      name: "Galleries",
    });
    expect(galleryShortcut).toHaveAttribute("href", "/galleries");
    expect(galleryShortcut).toHaveAttribute("title", "Open galleries");
    expect(galleryShortcut.className).toContain("glass-icon-button");
  });

  it("links avatar changes to the personal profile photo field", async () => {
    renderDashboardLayout();

    const userMenu = await screen.findByRole("button", { name: "User menu" });
    fireEvent.click(userMenu);

    expect(
      screen.getByRole("link", { name: "Change profile photo" }),
    ).toHaveAttribute("href", "/settings/profile#profile-avatar-url");
  });

  it("shows upload-credit balance and recharge entry point for studio roles", async () => {
    setRole("photographer");
    renderDashboardLayout();

    expect(
      await screen.findByTestId("upload-credit-pill-button"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByTestId("upload-credit-pill-credits"),
      ).toHaveTextContent("2,500 credits");
    });
  });

  it("does not mount the upload-credit pill for admin roles", async () => {
    setRole("admin");
    mockUsePathname.mockReturnValue("/admin/dashboard");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("upload-credit-pill")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Role-based sidebar switching                                      */
/* ------------------------------------------------------------------ */

describe("DashboardLayout role-based sidebar", () => {
  it("renders StudioSidebar with grouped nav for photographer", async () => {
    setRole("photographer");
    renderDashboardLayout();

    // StudioSidebar renders the RawDrive brand mark (the "Creative Studio"
    // subtitle was removed — StudioSidebar now passes subtitle="").
    await waitFor(() => {
      expect(screen.getByText("RawDrive")).toBeInTheDocument();
    });
    // Grouped section headers
    expect(screen.getByText("Creative")).toBeInTheDocument();
    expect(screen.getByText("Business")).toBeInTheDocument();
    // Key nav items
    const sidebar = document.querySelector("aside.sidebar-shell");
    expect(sidebar).not.toBeNull();
    expect(
      within(sidebar as HTMLElement).getByRole("link", { name: /Galleries/i }),
    ).toHaveAttribute("href", "/galleries");
    expect(
      screen.queryByRole("link", { name: /Install App/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Settings$/i })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(
      screen.queryByRole("link", { name: /Desktop App/i }),
    ).not.toBeInTheDocument();
    // AI Studio tile was removed from the photographer sidebar 2026-05-19
    // to declutter the left nav. The /ai route is still mounted but no
    // longer surfaced from the nav, mirroring the "AI" tab removal from
    // the gallery workspace nav.
    expect(
      screen.queryByRole("link", { name: /AI Studio/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Studio CRM/i })).toHaveAttribute(
      "href",
      "/crm",
    );
    expect(
      screen.queryByRole("link", { name: /^Invoices$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open RawDrive website" }),
    ).toHaveAttribute("href", "https://rawdrive.in");
  });

  it("renders AdminSidebar with tier plans for super admin", async () => {
    setRole("super_admin");
    mockUsePathname.mockReturnValue("/admin/users");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Admin Console")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Users/i })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.getByRole("link", { name: /Moderation/i })).toHaveAttribute(
      "href",
      "/admin/moderation",
    );
    expect(
      screen.getByRole("link", { name: /System Health/i }),
    ).toHaveAttribute("href", "/admin/system");
    expect(screen.getByRole("link", { name: /Audit Logs/i })).toHaveAttribute(
      "href",
      "/admin/audit-logs",
    );
    expect(screen.getByRole("link", { name: /Revenue/i })).toHaveAttribute(
      "href",
      "/admin/revenue",
    );
    expect(screen.getByRole("link", { name: /^Analytics$/i })).toHaveAttribute(
      "href",
      "/admin/analytics",
    );
    expect(
      screen.getByRole("link", { name: /Billing Analytics/i }),
    ).toHaveAttribute("href", "/admin/billing-analytics");
    expect(screen.getByRole("link", { name: /Workspaces/i })).toHaveAttribute(
      "href",
      "/admin/workspaces",
    );
    expect(screen.getByRole("link", { name: /Tier Plans/i })).toHaveAttribute(
      "href",
      "/admin/plans",
    );
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

  it("renders DealerSidebar with 7 items for dealer", async () => {
    setRole("dealer");
    mockUsePathname.mockReturnValue("/dealer");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dealer Portal")).toBeInTheDocument();
    });
    // Anchored to avoid matching the header quick-nav link whose
    // accessible name is "Dealer dashboard overview" (aria-label).
    expect(
      screen.getByRole("link", { name: /^Dashboard Overview$/i }),
    ).toHaveAttribute("href", "/dealer");
    expect(screen.getByRole("link", { name: /My Territory/i })).toHaveAttribute(
      "href",
      "/dealer/territory",
    );
    expect(
      screen.getByRole("link", { name: /Registrations/i }),
    ).toHaveAttribute("href", "/dealer/registrations");
    expect(
      screen.getByRole("link", { name: /Photographers/i }),
    ).toHaveAttribute("href", "/dealer/photographers");
    expect(screen.getByRole("link", { name: /Coupons/i })).toHaveAttribute(
      "href",
      "/dealer/coupons",
    );
    expect(
      screen.getByRole("link", { name: /Revenue Share/i }),
    ).toHaveAttribute("href", "/dealer/revenue-share");
    expect(screen.getByRole("link", { name: /Payouts/i })).toHaveAttribute(
      "href",
      "/dealer/payouts",
    );
  });

  it("renders ClientSidebar with 4 items for client", async () => {
    setRole("client");
    mockUsePathname.mockReturnValue("/galleries");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("My Photos")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Proofing/i })).toHaveAttribute(
      "href",
      "/proofing",
    );
    expect(screen.getByRole("link", { name: /Favorites/i })).toHaveAttribute(
      "href",
      "/favorites",
    );
    expect(screen.getByRole("link", { name: /Downloads/i })).toHaveAttribute(
      "href",
      "/downloads",
    );
  });

  it("renders StudioSidebar for team_member (explicit case)", async () => {
    setRole("team_member");
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("RawDrive")).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Role-specific header nav and search placeholder                   */
/* ------------------------------------------------------------------ */

describe("DashboardLayout role-specific header", () => {
  it("admin home shortcut routes to /admin/dashboard", async () => {
    setRole("admin");
    mockUsePathname.mockReturnValue("/admin/users");
    renderDashboardLayout();

    const shortcuts = await screen.findByRole("navigation", {
      name: "Primary workspace shortcuts",
    });
    expect(
      within(shortcuts).getByRole("link", { name: "Home" }),
    ).toHaveAttribute("href", "/admin/dashboard");
  });

  it("admin search placeholder is role-specific", async () => {
    setRole("admin");
    mockUsePathname.mockReturnValue("/admin/users");
    renderDashboardLayout();

    const searchInput = await screen.findByRole("searchbox", {
      name: "Search users, workspaces, or logs...",
    });
    expect(searchInput).toHaveAttribute(
      "placeholder",
      "Search users, workspaces, or logs...",
    );
  });

  it("dealer search placeholder is role-specific", async () => {
    setRole("dealer");
    mockUsePathname.mockReturnValue("/dealer");
    renderDashboardLayout();

    const searchInput = await screen.findByRole("searchbox", {
      name: "Search registrations or coupons...",
    });
    expect(searchInput).toBeInTheDocument();
  });

  it("client search placeholder is role-specific", async () => {
    setRole("client");
    mockUsePathname.mockReturnValue("/galleries");
    renderDashboardLayout();

    const searchInput = await screen.findByRole("searchbox", {
      name: "Search your photos...",
    });
    expect(searchInput).toBeInTheDocument();
  });
});
