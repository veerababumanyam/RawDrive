import { Suspense } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GallerySettingsPage from "../[id]/settings/page";

const mocks = vi.hoisted(() => ({
  getGallery: vi.fn(),
  updateGallerySettings: vi.fn(),
  listGalleryAccountShares: vi.fn(),
  createGalleryAccountShare: vi.fn(),
  revokeGalleryAccountShare: vi.fn(),
}));

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
  listGalleryAccountShares: mocks.listGalleryAccountShares,
  createGalleryAccountShare: mocks.createGalleryAccountShare,
  revokeGalleryAccountShare: mocks.revokeGalleryAccountShare,
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

describe("Gallery settings password protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGallery.mockResolvedValue(gallery({ has_password: false }));
    mocks.updateGallerySettings.mockImplementation(
      async (_token, _id, payload) =>
        gallery({ has_password: Boolean(payload.password) }),
    );
    mocks.listGalleryAccountShares.mockResolvedValue([]);
  });

  it("shows the protected state after setting a password", async () => {
    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Gallery Settings" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Set Password" }));
    fireEvent.change(screen.getByPlaceholderText("Enter gallery password"), {
      target: { value: "client-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set Password" }));

    await waitFor(() => {
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        { password: "client-secret" },
      );
    });

    expect(await screen.findByText("Password set")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Password" }),
    ).toBeInTheDocument();
  });

  it("offers explicit client download formats without the mixed Both option", async () => {
    mocks.getGallery.mockResolvedValue(
      gallery({
        has_password: false,
        download_enabled: true,
        download_quality: "original",
      }),
    );

    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Gallery Settings" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Choose the exact format clients can download from this public gallery.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /WebP display/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /WebP thumbnail/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Original source/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Both/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Full source files only."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Clients choose either format."),
    ).not.toBeInTheDocument();
  });

  it("saves the selected optimized WebP download option", async () => {
    mocks.getGallery.mockResolvedValue(
      gallery({
        has_password: false,
        download_enabled: true,
        download_quality: "webp",
      }),
    );
    mocks.updateGallerySettings.mockResolvedValue(
      gallery({ download_enabled: true, download_quality: "thumbnail" }),
    );

    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /WebP thumbnail/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /WebP thumbnail/i }));

    await waitFor(() => {
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        {
          download_quality: "thumbnail",
        },
      );
    });
    expect(
      await screen.findByText("Download option saved"),
    ).toBeInTheDocument();
  });

  it("saves original source as a client download option", async () => {
    mocks.getGallery.mockResolvedValue(
      gallery({
        has_password: false,
        download_enabled: true,
        download_quality: "webp",
      }),
    );
    mocks.updateGallerySettings.mockResolvedValue(
      gallery({ download_enabled: true, download_quality: "original" }),
    );

    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Original source/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Original source/i }));

    await waitFor(() => {
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        {
          download_quality: "original",
        },
      );
    });
  });
});
