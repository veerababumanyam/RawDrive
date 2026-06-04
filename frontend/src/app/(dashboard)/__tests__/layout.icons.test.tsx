import {
  createElement,
  type AnchorHTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardLayout from "../layout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

/**
 * F-090 regression guard.
 *
 * `(dashboard)/layout.tsx` previously imported nine glyphs from `lucide-react`
 * (Bell, Home, LogOut, Menu, Search, Settings, User, X) and
 * rendered them in its header (quick-nav, global search, notifications) and
 * user menu. The fix moves the icons layout.tsx itself renders to the
 * project's SF-Symbols system — the shared barrel at `@/components/icons`.
 *
 * Detection is behavioural, not a source string-match: every glyph
 * `lucide-react` renders carries a `lucide` CSS class on its <svg> root
 * (e.g. `class="lucide lucide-house"`); the SF-Symbols glyphs render a plain
 * <svg> with no `lucide` class.
 *
 * SCOPE (deliberate): the assertions target only the icon hosts layout.tsx
 * OWNS and renders directly — the global-search form, the quick-nav links,
 * and the notifications link. They intentionally do NOT scan the whole header
 * or the whole tree, because the header also mounts SEPARATE components this
 * file does not own — ThemeToggleButton, PwaInstallHeaderButton, and the role
 * sidebars. Scoping to layout.tsx's own glyphs keeps this test honest: it is
 * green only because the icons this file owns were migrated, and it turns RED
 * the moment any of them is reverted to lucide (verified by reintroducing the
 * lucide `Search` import — the search-form assertion below then fails).
 *
 * The mocks below are scoped to this file's own module registry, so they do
 * not interfere with the sibling layout.test.tsx render tests.
 */

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

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  getStoredAccessTokenClaims: () => ({
    workspace_id: "workspace-123",
    platform_role: "photographer",
  }),
  getStoredPlatformRole: () => "photographer",
  refreshAuthSession: vi.fn(async () => "test-token"),
  // S5-G1: layout now mounts ImpersonationBanner (hidden for normal sessions).
  isImpersonatingSession: vi.fn(() => false),
  logoutAuthSession: vi.fn(async () => {}),
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
          json: async () => ({ available_credits: 500, low_balance: false }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ packages: [] }),
      } as Response;
    }),
  );
});

function hasLucideClass(svg: Element): boolean {
  return (svg.getAttribute("class") ?? "").split(/\s+/).includes("lucide");
}

/** Collect every <svg> rendered directly by layout.tsx's own header chrome. */
function layoutOwnedSvgs(): SVGElement[] {
  const svgs: SVGElement[] = [];

  // Global search form — layout.tsx renders the Search glyph here.
  const searchInput = screen.getByRole("searchbox", {
    name: "Search galleries, clients, or files...",
  });
  searchInput
    .closest("form")
    ?.querySelectorAll("svg")
    .forEach((s) => svgs.push(s));

  // Header shortcuts — layout.tsx renders the Home and Photo glyphs here.
  const shortcuts = screen.getByRole("navigation", {
    name: "Primary workspace shortcuts",
  });
  shortcuts.querySelectorAll("svg").forEach((s) => svgs.push(s));

  // Notifications link — layout.tsx renders the Bell glyph here.
  const notifications = screen.getByRole("link", { name: "Notifications" });
  notifications.querySelectorAll("svg").forEach((s) => svgs.push(s));

  return svgs;
}

describe("(dashboard)/layout.tsx icon sourcing — F-090", () => {
  it("renders no lucide-react icons in the glyphs layout.tsx owns", async () => {
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    });

    const lucide = layoutOwnedSvgs().filter(hasLucideClass);
    expect(lucide).toHaveLength(0);
  });

  it("still renders those glyphs as plain SF-Symbols SVGs", async () => {
    renderDashboardLayout();

    await waitFor(() => {
      expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    });

    const svgs = layoutOwnedSvgs();

    // The icon swap must not silently drop the header's iconography...
    expect(svgs.length).toBeGreaterThan(0);

    // ...and every layout-owned glyph must be a plain SF-Symbols <svg>.
    for (const svg of svgs) {
      expect(hasLucideClass(svg)).toBe(false);
    }
  });
});
