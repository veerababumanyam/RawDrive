import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GallerySettingsPage from "../[id]/settings/page";

const mocks = vi.hoisted(() => ({
  getGallery: vi.fn(),
  updateGallerySettings: vi.fn(),
  uploadGalleryMusic: vi.fn(),
  clearGalleryMusic: vi.fn(),
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({ getStoredAccessToken: vi.fn(() => "token-1") }));

vi.mock("@/lib/api/galleries", () => ({
  getGallery: mocks.getGallery,
  updateGallerySettings: mocks.updateGallerySettings,
  uploadGalleryMusic: mocks.uploadGalleryMusic,
  clearGalleryMusic: mocks.clearGalleryMusic,
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

describe("Gallery settings — slideshow music", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGallery.mockResolvedValue(gallery());
  });

  it("renders the Slideshow music section", async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Slideshow music" })).toBeInTheDocument();
    });
    expect(screen.getByText("No music attached.")).toBeInTheDocument();
  });

  it("uploads an audio track and reflects the attached state", async () => {
    mocks.uploadGalleryMusic.mockResolvedValue(gallery({ music_asset_id: "asset-9" }));
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Slideshow music" }));

    const file = new File([new Uint8Array([1, 2, 3])], "track.mp3", { type: "audio/mpeg" });
    const input = screen.getByLabelText("Upload track") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() =>
      expect(mocks.uploadGalleryMusic).toHaveBeenCalledWith("token-1", "gallery-1", file),
    );
    expect(await screen.findByText("A music track is attached to this gallery.")).toBeInTheDocument();
  });

  it("surfaces a quota error from the upload", async () => {
    mocks.uploadGalleryMusic.mockRejectedValue(new Error("storage quota exceeded"));
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Slideshow music" }));

    const file = new File([new Uint8Array([1])], "big.mp3", { type: "audio/mpeg" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Upload track"), { target: { files: [file] } });
    });

    expect(await screen.findByText("storage quota exceeded")).toBeInTheDocument();
  });

  it("toggles automated client emails off", async () => {
    mocks.updateGallerySettings.mockResolvedValue(gallery({ email_automation_enabled: false }));
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Client emails" }));

    // Defaults on → the switch is checked; clicking turns it off.
    fireEvent.click(screen.getByRole("switch", { name: "Automated client emails" }));

    await waitFor(() =>
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith("token-1", "gallery-1", {
        email_automation_enabled: false,
      }),
    );
  });

  it("removes an attached track", async () => {
    mocks.getGallery.mockResolvedValue(gallery({ music_asset_id: "asset-9" }));
    mocks.clearGalleryMusic.mockResolvedValue(gallery({ music_asset_id: null }));
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Slideshow music" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove music" }));

    await waitFor(() => expect(mocks.clearGalleryMusic).toHaveBeenCalledWith("token-1", "gallery-1"));
  });
});
