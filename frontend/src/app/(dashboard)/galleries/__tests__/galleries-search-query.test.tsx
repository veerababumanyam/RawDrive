import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GalleriesPage from "../page";

// Behavioral regression for galleries BUG-4 (UAT 2026-06-04): the global header
// search navigates to /galleries?q=<term>, but the term was dropped — the list
// mounted unfiltered. The page now seeds its search filter from ?q=, so arriving
// with a query already filters the list.

const nav = vi.hoisted(() => ({ search: new URLSearchParams() }));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.search,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const authFetch = vi.fn();
const deleteGallery = vi.fn();
vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "token-1"),
}));
vi.mock("@/lib/api/authFetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}));
vi.mock("@/lib/api/assets", () => ({
  getAsset: vi.fn(),
}));
vi.mock("@/lib/api/crm", () => ({
  createContactAuth: vi.fn(),
  listContacts: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/api/workspace-profile", () => ({
  getWorkspaceProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/galleries", () => ({
  createGallery: vi.fn(),
  createGalleryShareLink: vi.fn(),
  deleteGallery: (...args: unknown[]) => deleteGallery(...args),
  updateGallery: vi.fn(),
  galleryPublicUrl: vi.fn(
    (g: { slug: string }) => `https://app.rawdrive.test/g/${g.slug}`,
  ),
}));
vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: () => ({ src: "", loading: false, error: null }),
}));

function gallery(id: string, title: string, slug: string) {
  return {
    id,
    workspace_id: "workspace-1",
    title,
    slug,
    description: "",
    gallery_type: "delivery",
    is_published: false,
    max_selections: 0,
    status: "active",
    settings: {},
    created_at: "2026-06-02T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
  };
}

beforeEach(() => {
  authFetch.mockReset();
  authFetch.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          galleries: [
            gallery("g-beach", "Beach Wedding", "beach-wedding"),
            gallery("g-trek", "Mountain Trek", "mountain-trek"),
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  deleteGallery.mockReset();
  deleteGallery.mockResolvedValue(undefined);
});

describe("GalleriesPage search query (BUG-4)", () => {
  it("seeds the search filter from ?q= so the list arrives filtered", async () => {
    nav.search = new URLSearchParams("q=Beach");
    render(<GalleriesPage />);

    // The matching gallery shows; the non-matching one is filtered out.
    await waitFor(() => expect(screen.getByText("Beach Wedding")).toBeTruthy());
    expect(screen.queryByText("Mountain Trek")).toBeNull();

    // The search input reflects the seeded term.
    const input = screen.getByDisplayValue("Beach");
    expect(input).toBeTruthy();
  });

  it("shows every gallery when no ?q= is present", async () => {
    nav.search = new URLSearchParams();
    render(<GalleriesPage />);

    await waitFor(() => expect(screen.getByText("Beach Wedding")).toBeTruthy());
    expect(screen.getByText("Mountain Trek")).toBeTruthy();
  });

  it("renders the shared page header with a compact gallery count", async () => {
    nav.search = new URLSearchParams();
    render(<GalleriesPage />);

    await waitFor(() => expect(screen.getByText("Beach Wedding")).toBeTruthy());

    expect(
      screen.getByRole("heading", { level: 1, name: "Galleries" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 galleries")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Filter galleries" }),
    ).toHaveAttribute("placeholder", "Filter galleries...");
  });

  it("uses client-facing gallery type labels in the create form", async () => {
    nav.search = new URLSearchParams("create=true");
    render(<GalleriesPage />);

    await waitFor(() => expect(screen.getByText("Beach Wedding")).toBeTruthy());

    expect(screen.getByRole("option", { name: "Album pics proofing" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Client pics delivery" }))
      .toBeInTheDocument();
    expect(
      screen.queryByRole("option", {
        name: "Proofing — client selects favorites",
      }),
    ).toBeNull();
  });

  it("shows a delete status bar while gallery deletion is pending", async () => {
    nav.search = new URLSearchParams();
    deleteGallery.mockReturnValueOnce(new Promise(() => {}));
    render(<GalleriesPage />);

    await waitFor(() => expect(screen.getByText("Beach Wedding")).toBeTruthy());
    fireEvent.click(
      screen.getByRole("button", { name: /delete beach wedding/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/deleting gallery/i);
    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
    expect(deleteGallery).toHaveBeenCalledWith("token-1", "g-beach");
  });
});
