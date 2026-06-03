import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GallerySettingsPage from "../[id]/settings/page";

const mocks = vi.hoisted(() => ({
  getGallery: vi.fn(),
  updateGallerySettings: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/galleries/gallery-1/settings",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "token-1"),
}));

vi.mock("@/lib/api/galleries", () => ({
  getGallery: mocks.getGallery,
  updateGallerySettings: mocks.updateGallerySettings,
}));

function gallery(overrides: Record<string, unknown> = {}) {
  return {
    id: "gallery-1",
    workspace_id: "workspace-1",
    title: "UAT Test Gallery",
    slug: "uat-test-gallery",
    description: "",
    gallery_type: "proofing",
    is_published: false,
    max_selections: 0,
    status: "active",
    settings: {},
    created_at: "2026-06-02T00:00:00Z",
    updated_at: "2026-06-02T00:00:00Z",
    ...overrides,
  };
}

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GallerySettingsPage params={Promise.resolve({ id: "gallery-1" })} />
      </Suspense>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("Gallery settings — access window / expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGallery.mockResolvedValue(gallery());
    mocks.updateGallerySettings.mockImplementation(async (_token, _id, payload) =>
      gallery(payload as Record<string, unknown>),
    );
  });

  it("renders an Access window section", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Access window" })).toBeInTheDocument();
    });
  });

  it("sets a 30-day access window from now", async () => {
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Access window" }));

    const before = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));

    await waitFor(() => expect(mocks.updateGallerySettings).toHaveBeenCalled());
    const payload = mocks.updateGallerySettings.mock.calls[0][2] as { expires_at?: string };
    expect(typeof payload.expires_at).toBe("string");
    const expMs = Date.parse(payload.expires_at as string);
    const after = Date.now();
    // expires_at should land ~30 days out (allow a few seconds of execution slack)
    expect(expMs).toBeGreaterThanOrEqual(before + 30 * DAY_MS - 5000);
    expect(expMs).toBeLessThanOrEqual(after + 30 * DAY_MS + 5000);
  });

  it("clears the access window when No expiry is chosen", async () => {
    mocks.getGallery.mockResolvedValue(gallery({ expires_at: "2026-12-31T00:00:00Z" }));
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Access window" }));

    fireEvent.click(screen.getByRole("button", { name: "No expiry" }));

    await waitFor(() =>
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith("token-1", "gallery-1", {
        expires_at: null,
      }),
    );
  });

  it("sets a custom public access expiry date at the end of the selected day", async () => {
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Access window" }));

    fireEvent.change(screen.getByLabelText("Custom date"), {
      target: { value: "2026-06-15" },
    });

    await waitFor(() => expect(mocks.updateGallerySettings).toHaveBeenCalled());
    const payload = mocks.updateGallerySettings.mock.calls[0][2] as { expires_at?: string };
    expect(payload.expires_at).toBe(new Date("2026-06-15T23:59:59").toISOString());
  });
});
