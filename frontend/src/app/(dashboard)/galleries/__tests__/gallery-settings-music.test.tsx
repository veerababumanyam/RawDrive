import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GallerySettingsPage from "../[id]/settings/page";

const mocks = vi.hoisted(() => ({
  getGallery: vi.fn(),
  updateGallerySettings: vi.fn(),
  uploadGalleryMusic: vi.fn(),
  clearGalleryMusic: vi.fn(),
  getTermsStatus: vi.fn(),
  getWorkspaceProfile: vi.fn(),
  updateWorkspaceProfile: vi.fn(),
  uploadWorkspaceLogo: vi.fn(),
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

vi.mock("@/lib/api/legal", () => ({
  getTermsStatus: mocks.getTermsStatus,
}));

vi.mock("@/components/legal/terms-acceptance-modal", () => ({
  TermsAcceptanceModal: ({
    open,
    onAccepted,
  }: {
    open: boolean;
    onAccepted: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Accept the Terms of Service">
        <button type="button" onClick={onAccepted}>
          Accept mocked terms
        </button>
      </div>
    ) : null,
}));

vi.mock("@/lib/api/workspace-profile", () => ({
  getWorkspaceProfile: mocks.getWorkspaceProfile,
  updateWorkspaceProfile: mocks.updateWorkspaceProfile,
  uploadWorkspaceLogo: mocks.uploadWorkspaceLogo,
}));

vi.mock("@/lib/dashboard-ui", () => ({
  getStorageBackedUrl: (key: string) => `/storage/${key}`,
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

function workspaceProfile(overrides: Record<string, unknown> = {}) {
  return {
    name: "Kaveri Stories",
    brand_name: "Kaveri Stories",
    logo_url: "",
    logo_asset_id: "",
    logo_metadata: {},
    public_branding_enabled: true,
    business_profile_slug: "kaveri",
    business_unique_code: "a1b2c3d4",
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
    mocks.getTermsStatus.mockResolvedValue({
      needs_acceptance: false,
      current_version: "tos-privacy/2026-04",
    });
    mocks.getWorkspaceProfile.mockResolvedValue(workspaceProfile());
    mocks.updateWorkspaceProfile.mockResolvedValue({ updated: 1 });
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

  it("opens the terms modal and replays music upload after acceptance", async () => {
    mocks.uploadGalleryMusic
      .mockRejectedValueOnce(new Error("You must accept the Terms of Service before uploading."))
      .mockResolvedValueOnce(gallery({ music_asset_id: "asset-9" }));
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Slideshow music" }));

    const file = new File([new Uint8Array([7])], "first-dance.mp3", { type: "audio/mpeg" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Upload track"), { target: { files: [file] } });
    });

    expect(await screen.findByRole("dialog", { name: "Accept the Terms of Service" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept mocked terms" }));
    });

    await waitFor(() => expect(mocks.uploadGalleryMusic).toHaveBeenCalledTimes(2));
    expect(mocks.uploadGalleryMusic).toHaveBeenLastCalledWith("token-1", "gallery-1", file);
    expect(await screen.findByText("A music track is attached to this gallery.")).toBeInTheDocument();
  });

  it("uploads a studio logo from Gallery Settings and uses it for watermarking", async () => {
    mocks.getWorkspaceProfile
      .mockResolvedValueOnce(workspaceProfile())
      .mockResolvedValueOnce(workspaceProfile({
        logo_asset_id: "logo-asset-1",
        logo_url: "workspaces/logo.webp",
        logo_metadata: { filename: "studio-logo.webp", storage_key: "workspaces/logo.webp" },
      }));
    mocks.uploadWorkspaceLogo.mockResolvedValue({ id: "logo-asset-1" });
    mocks.updateGallerySettings.mockImplementation(async (_token, _id, payload) =>
      gallery(payload as Record<string, unknown>),
    );
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Watermark" }));

    const file = new File([new Uint8Array([1, 2])], "studio-logo.webp", { type: "image/webp" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Upload studio logo for watermark"), {
        target: { files: [file] },
      });
    });

    await waitFor(() =>
      expect(mocks.uploadWorkspaceLogo).toHaveBeenCalledWith("token-1", file),
    );
    expect(mocks.updateWorkspaceProfile).toHaveBeenCalledWith("token-1", {
      logo_asset_id: "logo-asset-1",
    });
    await waitFor(() =>
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        expect.objectContaining({
          watermark_config: expect.objectContaining({
            enabled: true,
            mode: "logo",
            logo_asset_id: "logo-asset-1",
            logo_url: "/api/v1/public/galleries/uat-test-gallery/branding/logo?ws=kaveri-a1b2c3d4",
            text: "Kaveri Stories",
          }),
        }),
      ),
    );
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
