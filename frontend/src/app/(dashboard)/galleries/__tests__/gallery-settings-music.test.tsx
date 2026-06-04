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
  uploadMusicTrack: vi.fn(),
  selectGalleryMusic: vi.fn(),
  listMusicLibrary: vi.fn(),
  deleteMusicTrack: vi.fn(),
  fetchMusicTrackBlobUrl: vi.fn(),
  getTermsStatus: vi.fn(),
  getWorkspaceProfile: vi.fn(),
  updateWorkspaceProfile: vi.fn(),
  uploadWorkspaceLogo: vi.fn(),
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

vi.mock("@/lib/auth", () => ({ getStoredAccessToken: vi.fn(() => "token-1") }));

vi.mock("@/lib/api/galleries", () => ({
  getGallery: mocks.getGallery,
  updateGallerySettings: mocks.updateGallerySettings,
  uploadMusicTrack: mocks.uploadMusicTrack,
  selectGalleryMusic: mocks.selectGalleryMusic,
  listMusicLibrary: mocks.listMusicLibrary,
  deleteMusicTrack: mocks.deleteMusicTrack,
  fetchMusicTrackBlobUrl: mocks.fetchMusicTrackBlobUrl,
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

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: "track-1",
    filename: "first-dance.mp3",
    content_type: "audio/mpeg",
    size_bytes: 2_500_000,
    created_at: "2026-06-04T00:00:00Z",
    ...overrides,
  };
}

describe("Gallery settings — slideshow music", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no media playback — stub so the preview <audio> is inert.
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
    if (!URL.createObjectURL) {
      // @ts-expect-error jsdom may not define these
      URL.createObjectURL = vi.fn(() => "blob:preview");
      // @ts-expect-error jsdom may not define these
      URL.revokeObjectURL = vi.fn();
    }
    mocks.getGallery.mockResolvedValue(gallery());
    mocks.getTermsStatus.mockResolvedValue({
      needs_acceptance: false,
      current_version: "tos-privacy/2026-04",
    });
    mocks.getWorkspaceProfile.mockResolvedValue(workspaceProfile());
    mocks.updateWorkspaceProfile.mockResolvedValue({ updated: 1 });
    mocks.listMusicLibrary.mockResolvedValue([]);
    mocks.fetchMusicTrackBlobUrl.mockResolvedValue("blob:preview");
    mocks.deleteMusicTrack.mockResolvedValue(undefined);
    mocks.selectGalleryMusic.mockResolvedValue(gallery());
  });

  it("renders the Slideshow music section with an empty library", async () => {
    await renderPage();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Slideshow music" }),
      ).toBeInTheDocument();
    });
    expect(
      await screen.findByText(
        "Your music library is empty. Upload a track to get started.",
      ),
    ).toBeInTheDocument();
    // The "No music (None)" option is always present and selected by default.
    const none = screen.getByRole("radio", {
      name: "No music (None)",
    }) as HTMLInputElement;
    expect(none.checked).toBe(true);
  });

  it("renders the library tracks with size, preview and delete controls", async () => {
    mocks.listMusicLibrary.mockResolvedValue([
      track({ id: "track-1", filename: "first-dance.mp3" }),
      track({ id: "track-2", filename: "entry.mp3", size_bytes: 1024 }),
    ]);
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    expect(await screen.findByText("first-dance.mp3")).toBeInTheDocument();
    expect(screen.getByText("entry.mp3")).toBeInTheDocument();
    // Human-readable size.
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();
    // Labelled preview + delete controls per track.
    expect(
      screen.getByRole("button", {
        name: "Play preview of first-dance.mp3",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete first-dance.mp3" }),
    ).toBeInTheDocument();
  });

  it("multi-uploads audio tracks and refreshes the library", async () => {
    mocks.uploadMusicTrack
      .mockResolvedValueOnce({ id: "asset-1" })
      .mockResolvedValueOnce({ id: "asset-2" });
    // First load empty, then after upload show two tracks.
    mocks.listMusicLibrary
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        track({ id: "asset-1", filename: "a.mp3" }),
        track({ id: "asset-2", filename: "b.mp3" }),
      ]);
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    const a = new File([new Uint8Array([1])], "a.mp3", { type: "audio/mpeg" });
    const b = new File([new Uint8Array([2])], "b.mp3", { type: "audio/mpeg" });
    const input = screen.getByLabelText("Upload track") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    await act(async () => {
      fireEvent.change(input, { target: { files: [a, b] } });
    });

    await waitFor(() =>
      expect(mocks.uploadMusicTrack).toHaveBeenCalledTimes(2),
    );
    expect(mocks.uploadMusicTrack).toHaveBeenNthCalledWith(1, "token-1", a);
    expect(mocks.uploadMusicTrack).toHaveBeenNthCalledWith(2, "token-1", b);
    expect(await screen.findByText("a.mp3")).toBeInTheDocument();
    expect(screen.getByText("b.mp3")).toBeInTheDocument();
  });

  it("selects a library track for this gallery", async () => {
    mocks.listMusicLibrary.mockResolvedValue([
      track({ id: "track-1", filename: "first-dance.mp3" }),
    ]);
    mocks.selectGalleryMusic.mockResolvedValue(
      gallery({ music_asset_id: "track-1" }),
    );
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    const radio = await screen.findByRole("radio", {
      name: "Use first-dance.mp3 for this gallery",
    });
    await act(async () => {
      fireEvent.click(radio);
    });

    await waitFor(() =>
      expect(mocks.selectGalleryMusic).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        "track-1",
      ),
    );
    expect(
      await screen.findByText(/Selected for this gallery/),
    ).toBeInTheDocument();
  });

  it("previews a track via authed blob bytes", async () => {
    mocks.listMusicLibrary.mockResolvedValue([
      track({ id: "track-1", filename: "first-dance.mp3" }),
    ]);
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    const playBtn = await screen.findByRole("button", {
      name: "Play preview of first-dance.mp3",
    });
    await act(async () => {
      fireEvent.click(playBtn);
    });

    await waitFor(() =>
      expect(mocks.fetchMusicTrackBlobUrl).toHaveBeenCalledWith(
        "token-1",
        "track-1",
      ),
    );
    // Now offers to pause.
    expect(
      await screen.findByRole("button", {
        name: "Pause preview of first-dance.mp3",
      }),
    ).toBeInTheDocument();
  });

  it("surfaces a quota error from the upload", async () => {
    mocks.uploadMusicTrack.mockRejectedValue(
      new Error("storage quota exceeded"),
    );
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    const file = new File([new Uint8Array([1])], "big.mp3", {
      type: "audio/mpeg",
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Upload track"), {
        target: { files: [file] },
      });
    });

    expect(
      await screen.findByText("storage quota exceeded"),
    ).toBeInTheDocument();
  });

  it("opens the terms modal and replays music upload after acceptance", async () => {
    mocks.uploadMusicTrack
      .mockRejectedValueOnce(
        new Error("You must accept the Terms of Service before uploading."),
      )
      .mockResolvedValueOnce({ id: "asset-9" });
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    const file = new File([new Uint8Array([7])], "first-dance.mp3", {
      type: "audio/mpeg",
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Upload track"), {
        target: { files: [file] },
      });
    });

    expect(
      await screen.findByRole("dialog", {
        name: "Accept the Terms of Service",
      }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Accept mocked terms" }),
      );
    });

    await waitFor(() =>
      expect(mocks.uploadMusicTrack).toHaveBeenCalledTimes(2),
    );
    expect(mocks.uploadMusicTrack).toHaveBeenLastCalledWith("token-1", file);
  });

  it("uploads a studio logo from Gallery Settings and uses it for watermarking", async () => {
    mocks.getWorkspaceProfile
      .mockResolvedValueOnce(workspaceProfile())
      .mockResolvedValueOnce(
        workspaceProfile({
          logo_asset_id: "logo-asset-1",
          logo_url: "workspaces/logo.webp",
          logo_metadata: {
            filename: "studio-logo.webp",
            storage_key: "workspaces/logo.webp",
          },
        }),
      );
    mocks.uploadWorkspaceLogo.mockResolvedValue({ id: "logo-asset-1" });
    mocks.updateGallerySettings.mockImplementation(
      async (_token, _id, payload) =>
        gallery(payload as Record<string, unknown>),
    );
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Watermark" }));

    const file = new File([new Uint8Array([1, 2])], "studio-logo.webp", {
      type: "image/webp",
    });
    await act(async () => {
      fireEvent.change(
        screen.getByLabelText("Upload studio logo for watermark"),
        {
          target: { files: [file] },
        },
      );
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
            logo_url:
              "/api/v1/public/galleries/uat-test-gallery/branding/logo?ws=kaveri-a1b2c3d4",
            text: "Kaveri Stories",
          }),
        }),
      ),
    );
  });

  it("uses the existing Business Profile logo for watermarking without uploading a duplicate", async () => {
    mocks.getWorkspaceProfile.mockResolvedValue(
      workspaceProfile({
        logo_asset_id: "logo-asset-1",
        logo_url: "workspaces/logo.webp",
        logo_metadata: {
          filename: "studio-logo.webp",
          storage_key: "workspaces/logo.webp",
        },
      }),
    );
    mocks.updateGallerySettings.mockImplementation(
      async (_token, _id, payload) =>
        gallery(payload as Record<string, unknown>),
    );
    await renderPage();
    await waitFor(() =>
      screen.getByRole("button", { name: "Use Business Profile logo" }),
    );

    expect(screen.queryByText("Use as watermark")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Use Business Profile logo" }),
      );
    });

    expect(mocks.uploadWorkspaceLogo).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        expect.objectContaining({
          watermark_config: expect.objectContaining({
            enabled: true,
            mode: "logo",
            logo_asset_id: "logo-asset-1",
            logo_url:
              "/api/v1/public/galleries/uat-test-gallery/branding/logo?ws=kaveri-a1b2c3d4",
          }),
        }),
      ),
    );
  });

  it("toggles automated client emails off", async () => {
    mocks.updateGallerySettings.mockResolvedValue(
      gallery({ email_automation_enabled: false }),
    );
    await renderPage();
    await waitFor(() => screen.getByRole("heading", { name: "Client emails" }));

    // Defaults on → the switch is checked; clicking turns it off.
    fireEvent.click(
      screen.getByRole("switch", { name: "Automated client emails: On" }),
    );

    await waitFor(() =>
      expect(mocks.updateGallerySettings).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        {
          email_automation_enabled: false,
        },
      ),
    );
  });

  it("clears the gallery track via the No music option", async () => {
    mocks.getGallery.mockResolvedValue(gallery({ music_asset_id: "track-1" }));
    mocks.listMusicLibrary.mockResolvedValue([
      track({ id: "track-1", filename: "first-dance.mp3" }),
    ]);
    mocks.selectGalleryMusic.mockResolvedValue(
      gallery({ music_asset_id: null }),
    );
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "No music (None)" }));
    });

    await waitFor(() =>
      expect(mocks.selectGalleryMusic).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        null,
      ),
    );
  });

  it("deletes a library track and clears the selection if it was selected", async () => {
    mocks.getGallery.mockResolvedValue(gallery({ music_asset_id: "track-1" }));
    mocks.listMusicLibrary
      .mockResolvedValueOnce([
        track({ id: "track-1", filename: "first-dance.mp3" }),
      ])
      .mockResolvedValue([]);
    mocks.selectGalleryMusic.mockResolvedValue(
      gallery({ music_asset_id: null }),
    );
    await renderPage();
    await waitFor(() =>
      screen.getByRole("heading", { name: "Slideshow music" }),
    );

    const deleteBtn = await screen.findByRole("button", {
      name: "Delete first-dance.mp3",
    });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() =>
      expect(mocks.deleteMusicTrack).toHaveBeenCalledWith("token-1", "track-1"),
    );
    // Deleting the selected track clears the gallery selection.
    await waitFor(() =>
      expect(mocks.selectGalleryMusic).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        null,
      ),
    );
  });
});
