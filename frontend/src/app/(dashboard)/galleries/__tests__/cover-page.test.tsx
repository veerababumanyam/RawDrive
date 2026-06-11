import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import CoverDesignPage from "../[id]/cover/page";
import {
  getGallery,
  listAlbumAssets,
  listGalleryAlbums,
  listGalleryAssets,
  updateGalleryDesign,
} from "@/lib/api/galleries";
import type { Asset } from "@/lib/api/assets";
import type { PublicAsset } from "@/lib/api/galleries";

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(async () => ({ ok: true }) as Response),
  updateGalleryDesign: vi.fn(async () => ({})),
  useUpload: vi.fn(),
  uploadAddFiles: vi.fn(),
  uploadCancel: vi.fn(),
  uploadRetry: vi.fn(),
  useDecryptedAssetUrl: vi.fn(),
  searchParams: new URLSearchParams(),
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
  useParams: () => ({ id: "gallery-1" }),
  usePathname: () => "/galleries/gallery-1/cover",
  useSearchParams: () => mocks.searchParams,
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

vi.mock("@/lib/api/authFetch", () => ({
  authFetch: mocks.authFetch,
}));

vi.mock("@/lib/api/workspace-profile", () => ({
  getWorkspaceProfile: vi.fn(async () => ({
    name: "Kaveri Weddings",
    brand_name: "Kaveri Stories",
    brand_accent_color: "#B7791F",
    public_branding_enabled: true,
    gallery_branding_defaults: {
      logo_placement: "top-left",
      monogram: "KS",
      watermark_style: "subtle-corner",
      logo_size: 44,
      logo_opacity: 90,
      watermark_text: "Kaveri Stories",
      watermark_opacity: 55,
    },
  })),
}));

vi.mock("@/hooks/use-upload", () => ({
  useUpload: mocks.useUpload,
}));

vi.mock("@/lib/media-encryption/media-key-store", () => ({
  getOrCreateGalleryMediaKey: vi.fn(async () => ({
    key: new Uint8Array(32),
    keyId: "gallery-key-1",
  })),
}));

function makeAsset(id: string, filename: string): Asset {
  return {
    id,
    workspace_id: "workspace-1",
    filename,
    content_type: "image/jpeg",
    size_bytes: 1234,
    storage_key: `tests/photos/${filename}`,
    exif_data: {},
    thumbnail_urls: {
      thumb_lg_webp: `/tests/photos/${filename}`,
      thumb_md_webp: `/tests/photos/${filename}`,
    },
    status: "ready",
    created_at: "2026-04-01T00:00:00Z",
  };
}

const asset = makeAsset("asset-cover", "Wedding (42).jpg");
const secondAsset = makeAsset("asset-2", "Wedding (43).jpg");
const thirdAsset = makeAsset("asset-3", "Wedding (44).jpg");
const fourthAsset = makeAsset("asset-4", "Wedding (45).jpg");
const galleryAssets = [asset, secondAsset, thirdAsset, fourthAsset];

vi.mock("@/lib/api/galleries", () => ({
  getGallery: vi.fn(async () => ({
    id: "gallery-1",
    workspace_id: "workspace-1",
    title: "Asha & Ravi",
    slug: "asha-ravi",
    description: "Wedding highlights",
    cover_asset_id: "asset-cover",
    gallery_type: "delivery",
    is_published: true,
    max_selections: 0,
    status: "published",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    settings: {},
  })),
  listGalleryAssets: vi.fn(async () =>
    galleryAssets.map((mediaAsset, index) => ({
      id: `ga-${index + 1}`,
      gallery_id: "gallery-1",
      asset_id: mediaAsset.id,
      sort_order: index,
      is_hero: index === 0,
      asset: mediaAsset,
    })),
  ),
  listGalleryAlbums: vi.fn(async () => []),
  listAlbumAssets: vi.fn(async () => []),
  updateGalleryDesign: mocks.updateGalleryDesign,
}));

vi.mock("@/lib/api/assets", () => ({
  getAsset: vi.fn(async (_token: string, assetId: string) => {
    return (
      galleryAssets.find((mediaAsset) => mediaAsset.id === assetId) || asset
    );
  }),
}));

vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: mocks.useDecryptedAssetUrl,
}));

async function renderPage() {
  await act(async () => {
    render(<CoverDesignPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  });
}

const COVER_EDITOR_TAB_VALUE_BY_LABEL: Record<string, string> = {
  Cover: "cover",
  Text: "text",
  Media: "media",
  Videos: "videos",
  Brand: "brand",
  Grid: "grid",
  Photos: "photos",
};

async function openCoverEditorTab(name: string) {
  const select = await screen.findByRole("combobox", {
    name: "Cover editor section",
  });
  fireEvent.change(select, {
    target: {
      value: COVER_EDITOR_TAB_VALUE_BY_LABEL[name] ?? name.toLowerCase(),
    },
  });
  return select;
}

async function expectCoverEditorTabSelected(name: string) {
  const select = await screen.findByRole("combobox", {
    name: "Cover editor section",
  });
  expect(select).toHaveValue(
    COVER_EDITOR_TAB_VALUE_BY_LABEL[name] ?? name.toLowerCase(),
  );
}

async function openGalleryPhotosPanel() {
  await openCoverEditorTab("Photos");
  return screen.findByRole("heading", { name: "Choose from gallery" });
}

describe("CoverDesignPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.authFetch.mockResolvedValue({ ok: true } as Response);
    mocks.useUpload.mockReturnValue({
      items: [],
      addFiles: mocks.uploadAddFiles,
      cancel: mocks.uploadCancel,
      retry: mocks.uploadRetry,
      isPaused: false,
    });
    mocks.useDecryptedAssetUrl.mockImplementation(
      (
        mediaAsset: Asset | PublicAsset | null | undefined,
        variants: readonly string[],
      ) => ({
        src:
          variants
            .map((variant) => mediaAsset?.thumbnail_urls?.[variant])
            .find(Boolean) || "",
        loading: false,
        error: null,
      }),
    );
  });

  it("shows a missing-gallery state for expected 404s without logging a console error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(getGallery).mockRejectedValueOnce(
      new Error("Failed to get gallery: 404"),
    );

    await renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Can't open Cover & Design",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Gallery not found or you no longer have access."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to galleries" }),
    ).toHaveAttribute("href", "/galleries");
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("applies cover presets and saves the expanded experience config", async () => {
    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /use haldi warm design/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", { name: "Cover designs" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Design presets")).not.toBeInTheDocument();
    expect(screen.queryByText("Cover templates")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use stamp design/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /use haldi warm design/i,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /phone preview/i }));

    expect(screen.getByLabelText(/mobile safe zone/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalled();
    });

    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig).toMatchObject({
      cover: {
        layoutPreset: "haldi-warm",
        mediaMode: "single-photo",
        scrimStyle: "warm-vignette",
        textBackdrop: "glass",
        deviceProfiles: {
          desktop: expect.objectContaining({
            layoutPreset: "haldi-warm",
            mediaMode: "single-photo",
          }),
          phone: expect.objectContaining({
            layoutPreset: "haldi-warm",
          }),
        },
      },
    });
    expect(savedConfig).not.toHaveProperty("branding");
    expect(savedConfig).not.toHaveProperty("grid");
    expect(savedConfig).not.toHaveProperty("gridScope");
    expect(savedConfig.sceneHeaders).toEqual([]);
  }, 10000);

  it("loads and saves Cover & Design for a selected gallery folder", async () => {
    mocks.searchParams = new URLSearchParams("album=album-1");
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: "asset-cover",
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        design_config: {
          grid: {
            layout: "grid",
            columns: 5,
            gap: 28,
            showInfo: false,
          },
        },
        design_config_by_album: {
          "album-1": {
            grid: {
              layout: "justified",
              columns: 2,
              gap: 12,
              showInfo: true,
            },
            version: 7,
          },
        },
      },
    });
    vi.mocked(listGalleryAlbums).mockResolvedValueOnce([
      {
        id: "album-1",
        gallery_id: "gallery-1",
        name: "HIGHLIGHTS",
        position: 0,
        asset_count: 1,
        asset_ids: [asset.id],
      },
    ]);
    vi.mocked(listAlbumAssets).mockResolvedValueOnce([
      {
        album_id: "album-1",
        asset_id: asset.id,
        position: 0,
        added_at: "2026-04-01T00:00:00Z",
        asset,
      },
    ]);

    await renderPage();

    expect(await screen.findByText("Folder: HIGHLIGHTS")).toBeInTheDocument();
    const sectionSelect = screen.getByRole("combobox", {
      name: "Cover editor section",
    });
    expect(
      screen.getByText("Folder settings: Grid only"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Preview device" }),
    ).not.toBeInTheDocument();
    expect(within(sectionSelect).getAllByRole("option")).toHaveLength(1);
    expect(
      within(sectionSelect).getByRole("option", { name: "Grid" }),
    ).toHaveValue("grid");
    expect(
      screen.getByLabelText("Folder grid preview"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "HIGHLIGHTS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Grid layout" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Cover designs" }),
    ).not.toBeInTheDocument();
    expect(listAlbumAssets).toHaveBeenCalledWith("token-1", "album-1", {
      includeAssets: true,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        expect.any(Object),
        { albumId: "album-1" },
      );
    });
    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig).toHaveProperty("grid");
    expect(savedConfig.grid).toEqual({
      layout: "justified",
      columns: 2,
      gap: 12,
      showInfo: true,
    });
    expect(savedConfig).toHaveProperty("gridScope", "folder");
    expect(savedConfig).toHaveProperty("version");
    expect(savedConfig).not.toHaveProperty("cover");
    expect(savedConfig).not.toHaveProperty("typography");
    expect(savedConfig).not.toHaveProperty("sceneHeaders");
  });

  it("saves selected folder grid settings without requiring a cover photo", async () => {
    mocks.searchParams = new URLSearchParams("album=album-empty");
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: null,
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        design_config: {
          cover: {
            assetId: null,
            assetSlots: [],
          },
        },
        design_config_by_album: {
          "album-empty": {
            grid: {
              layout: "grid",
              columns: 4,
              gap: 10,
              showInfo: false,
            },
            gridScope: "folder",
            version: 3,
          },
        },
      },
    });
    vi.mocked(listGalleryAlbums).mockResolvedValueOnce([
      {
        id: "album-empty",
        gallery_id: "gallery-1",
        name: "EMPTY",
        position: 0,
        asset_count: 0,
        asset_ids: [],
      },
    ]);
    vi.mocked(listAlbumAssets).mockResolvedValueOnce([]);

    await renderPage();

    expect(await screen.findByText("Folder: EMPTY")).toBeInTheDocument();
    expect(
      screen.queryByText("Pick a cover photo before saving."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        expect.any(Object),
        { albumId: "album-empty" },
      );
    });
    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig).toEqual({
      grid: {
        layout: "grid",
        columns: 4,
        gap: 10,
        showInfo: false,
      },
      gridScope: "folder",
      version: expect.any(Number),
    });
  });

  it("auto-saves selected folder grid columns after slider edits", async () => {
    mocks.searchParams = new URLSearchParams("album=album-auto");
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: "asset-cover",
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        design_config_by_album: {
          "album-auto": {
            grid: {
              layout: "grid",
              columns: 3,
              gap: 8,
              showInfo: false,
            },
            gridScope: "folder",
            version: 4,
          },
        },
      },
    });
    vi.mocked(listGalleryAlbums).mockResolvedValueOnce([
      {
        id: "album-auto",
        gallery_id: "gallery-1",
        name: "HIGHLIGHTS",
        position: 0,
        asset_count: 1,
        asset_ids: [asset.id],
      },
    ]);
    vi.mocked(listAlbumAssets).mockResolvedValueOnce([
      {
        album_id: "album-auto",
        asset_id: asset.id,
        position: 0,
        added_at: "2026-04-01T00:00:00Z",
        asset,
      },
    ]);

    await renderPage();

    expect(await screen.findByText("Folder: HIGHLIGHTS")).toBeInTheDocument();
    vi.mocked(updateGalleryDesign).mockClear();

    fireEvent.change(screen.getByLabelText("Columns"), {
      target: { value: "5" },
    });

    await waitFor(
      () => {
        expect(updateGalleryDesign).toHaveBeenCalledWith(
          "token-1",
          "gallery-1",
          expect.any(Object),
          { albumId: "album-auto" },
        );
      },
      { timeout: 2000 },
    );
    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig).toMatchObject({
      grid: {
        layout: "grid",
        columns: 5,
        gap: 8,
        showInfo: false,
      },
      gridScope: "folder",
    });
    expect(savedConfig).not.toHaveProperty("cover");
    expect(savedConfig).not.toHaveProperty("typography");
  });

  it("starts an unsaved gallery folder with its own default grid instead of the root grid", async () => {
    mocks.searchParams = new URLSearchParams("album=album-2");
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: "asset-cover",
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        design_config: {
          grid: {
            layout: "grid",
            columns: 5,
            gap: 28,
            showInfo: true,
          },
        },
      },
    });
    vi.mocked(listGalleryAlbums).mockResolvedValueOnce([
      {
        id: "album-2",
        gallery_id: "gallery-1",
        name: "CEREMONY",
        position: 1,
        asset_count: 1,
        asset_ids: [asset.id],
      },
    ]);
    vi.mocked(listAlbumAssets).mockResolvedValueOnce([
      {
        album_id: "album-2",
        asset_id: asset.id,
        position: 0,
        added_at: "2026-04-01T00:00:00Z",
        asset,
      },
    ]);

    await renderPage();

    expect(await screen.findByText("Folder: CEREMONY")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        expect.any(Object),
        { albumId: "album-2" },
      );
    });
    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig.grid).toEqual({
      layout: "grid",
      columns: 3,
      gap: 8,
      showInfo: false,
    });
    expect(savedConfig).toHaveProperty("gridScope", "folder");
  });

  it("ignores legacy folder grid settings that were copied from the root grid", async () => {
    mocks.searchParams = new URLSearchParams("album=album-3");
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: "asset-cover",
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        design_config: {
          grid: {
            layout: "grid",
            columns: 5,
            gap: 28,
            showInfo: true,
          },
        },
        design_config_by_album: {
          "album-3": {
            grid: {
              layout: "grid",
              columns: 5,
              gap: 28,
              showInfo: true,
            },
            version: 2,
          },
        },
      },
    });
    vi.mocked(listGalleryAlbums).mockResolvedValueOnce([
      {
        id: "album-3",
        gallery_id: "gallery-1",
        name: "RECEPTION",
        position: 2,
        asset_count: 1,
        asset_ids: [asset.id],
      },
    ]);
    vi.mocked(listAlbumAssets).mockResolvedValueOnce([
      {
        album_id: "album-3",
        asset_id: asset.id,
        position: 0,
        added_at: "2026-04-01T00:00:00Z",
        asset,
      },
    ]);

    await renderPage();

    expect(await screen.findByText("Folder: RECEPTION")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalledWith(
        "token-1",
        "gallery-1",
        expect.any(Object),
        { albumId: "album-3" },
      );
    });
    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig.grid).toEqual({
      layout: "grid",
      columns: 3,
      gap: 8,
      showInfo: false,
    });
    expect(savedConfig).toHaveProperty("gridScope", "folder");
  });

  it("offers a section dropdown for cover editing", async () => {
    await renderPage();

    const sectionSelect = await screen.findByRole("combobox", {
      name: "Cover editor section",
    });

    expect(sectionSelect).toHaveValue("cover");
    expect(screen.queryByLabelText("Editor section")).not.toBeInTheDocument();
    expect(within(sectionSelect).getByRole("option", { name: "Cover" })).toHaveValue(
      "cover",
    );
    expect(
      within(sectionSelect).queryByRole("option", { name: "Scenes" }),
    ).not.toBeInTheDocument();
    expect(
      within(sectionSelect).getByRole("option", { name: "Brand" }),
    ).toBeInTheDocument();
    expect(
      within(sectionSelect).queryByRole("option", { name: "Media" }),
    ).not.toBeInTheDocument();
    expect(
      within(sectionSelect).queryByRole("option", { name: "Videos" }),
    ).not.toBeInTheDocument();
    expect(
      within(sectionSelect).queryByRole("option", { name: "Grid" }),
    ).not.toBeInTheDocument();
    expect(
      within(sectionSelect).getByRole("option", { name: "Photos" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /brand defaults/i }),
    ).not.toBeInTheDocument();

    await openCoverEditorTab("Text");

    await expectCoverEditorTabSelected("Text");
    expect(
      await screen.findByPlaceholderText("Your gallery title"),
    ).toBeInTheDocument();

    await openCoverEditorTab("Photos");

    await expectCoverEditorTabSelected("Photos");
    expect(await screen.findByText("Choose from gallery")).toBeInTheDocument();
  });

  it("renders the split cover workbench panes for desktop editing", async () => {
    await renderPage();

    expect(document.querySelector(".cover-workbench")).toBeInTheDocument();
    expect(document.querySelector(".cover-photo-rail")).not.toBeInTheDocument();
    expect(document.querySelector(".cover-save-dock")).not.toBeInTheDocument();
    const saveButton = screen.getByRole("button", {
      name: /save cover and design/i,
    });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton.closest(".cover-preview-toolbar")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Copy desktop cover settings to phone",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Gallery folders" }),
    ).toHaveClass("cover-folder-select");
    expect(
      screen.queryByRole("button", { name: /^undo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^redo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^preview$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /brand defaults/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Cover editor section" }),
    ).toHaveClass("cover-section-select");
    expect(
      screen.getByRole("region", { name: "Cover design controls" }),
    ).toHaveClass("cover-inspector-pane");
    expect(
      screen.getByLabelText(/Cover preview/i).closest("section"),
    ).toHaveClass("cover-preview-pane");
  });

  it("does not expose media, video, or grid sections for gallery root editing", async () => {
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: "asset-cover",
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        embedded_videos: [
          {
            id: "yt-1",
            provider: "youtube",
            video_id: "dQw4w9WgXcQ",
            title: "Highlights",
            added_at: "2026-06-06T00:00:00.000Z",
          },
          {
            id: "ig-1",
            provider: "instagram",
            video_id: "DLHx_WNoXoY",
            instagram_kind: "reel",
            instagram_display_mode: "compact",
            title: "Ceremony reel",
            added_at: "2026-06-06T00:00:00.000Z",
          },
        ],
      },
    });

    await renderPage();
    const sectionSelect = await screen.findByRole("combobox", {
      name: "Cover editor section",
    });
    expect(
      within(sectionSelect).queryByRole("option", { name: "Media" }),
    ).not.toBeInTheDocument();
    expect(
      within(sectionSelect).queryByRole("option", { name: "Videos" }),
    ).not.toBeInTheDocument();
    expect(
      within(sectionSelect).queryByRole("option", { name: "Grid" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Videos & Reels" }),
    ).not.toBeInTheDocument();
  });

  it("preserves legacy branding without exposing brand editing controls", async () => {
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: "asset-cover",
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        design_config: {
          branding: {
            logoPlacement: "top-right",
            monogram: "AR",
            brandColor: "#B7791F",
            watermarkStyle: "subtle-corner",
            logoSize: 56,
            logoOpacity: 82,
            watermarkText: "Asha Ravi Studio",
            watermarkOpacity: 45,
          },
        },
      },
    });
    await renderPage();

    expect(screen.queryByText("Studio branding")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/monogram/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalled();
    });

    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig.branding).toEqual({
      logoPlacement: "top-right",
      monogram: "AR",
      brandColor: "#B7791F",
      watermarkStyle: "subtle-corner",
      logoSize: 56,
      logoOpacity: 82,
      watermarkText: "Asha Ravi Studio",
      watermarkOpacity: 45,
      applyToAll: false,
    });
  });

  it("preserves legacy scene headers without exposing scene editing controls", async () => {
    vi.mocked(getGallery).mockResolvedValueOnce({
      id: "gallery-1",
      workspace_id: "workspace-1",
      title: "Asha & Ravi",
      slug: "asha-ravi",
      description: "Wedding highlights",
      cover_asset_id: "asset-cover",
      gallery_type: "delivery",
      is_published: true,
      max_selections: 0,
      status: "published",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      settings: {
        design_config: {
          sceneHeaders: [
            {
              id: "haldi",
              label: "Haldi",
              enabled: true,
              assetId: "asset-2",
            },
          ],
        },
      },
    });
    await renderPage();

    expect(screen.queryByText("Scene headers")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /haldi scene header/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalled();
    });

    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig.sceneHeaders).toEqual([
      { id: "haldi", label: "Haldi", enabled: true, assetId: "asset-2" },
    ]);
  });

  it("saves cover visual treatments and manual art-direction overrides", async () => {
    await renderPage();

    const treatmentHeading = await screen.findByRole("heading", {
      name: "Visual treatment",
    });
    const treatmentSection = treatmentHeading.closest("section");
    expect(treatmentSection).not.toBeNull();

    fireEvent.click(
      within(treatmentSection as HTMLElement).getByRole("button", {
        name: /use warm glow cover treatment/i,
      }),
    );

    fireEvent.change(
      within(treatmentSection as HTMLElement).getByLabelText(
        "Cover gradient treatment",
      ),
      { target: { value: "blur-band" } },
    );
    fireEvent.change(
      within(treatmentSection as HTMLElement).getByLabelText(
        "Cover text finish",
      ),
      { target: { value: "dark" } },
    );
    fireEvent.change(
      within(treatmentSection as HTMLElement).getByLabelText(
        "Cover treatment title color",
      ),
      { target: { value: "#fef3c7" } },
    );
    fireEvent.change(
      within(treatmentSection as HTMLElement).getByLabelText(
        "Cover treatment subtitle color",
      ),
      { target: { value: "#38bdf8" } },
    );
    fireEvent.change(
      within(treatmentSection as HTMLElement).getByLabelText(
        "Cover accent tint",
      ),
      { target: { value: "#0ea5e9" } },
    );
    fireEvent.click(
      within(treatmentSection as HTMLElement).getByRole("switch", {
        name: /emboss shadow/i,
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalled();
    });

    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig).toMatchObject({
      theme: {
        accentColor: "#0ea5e9",
      },
      cover: {
        scrimStyle: "blur-band",
        textBackdrop: "dark",
        textShadow: false,
        titleColor: "#fef3c7",
        subtitleColor: "#38bdf8",
        textColor: "#fef3c7",
        deviceProfiles: {
          desktop: expect.objectContaining({
            scrimStyle: "blur-band",
            textBackdrop: "dark",
            textShadow: false,
            titleColor: "#fef3c7",
            subtitleColor: "#38bdf8",
          }),
          phone: expect.objectContaining({
            scrimStyle: "blur-band",
            textBackdrop: "dark",
            textShadow: false,
            titleColor: "#fef3c7",
            subtitleColor: "#38bdf8",
          }),
        },
      },
    });
  });

  it("maps cover preview fetch errors to an editor-safe message", async () => {
    mocks.useDecryptedAssetUrl.mockImplementation(
      (mediaAsset: Asset | PublicAsset | null | undefined) => ({
        src: "",
        loading: false,
        error: mediaAsset
          ? mediaAsset.id === "asset-1"
            ? "Encrypted media fetch failed: 404"
            : "Media fetch failed: 404"
          : null,
      }),
    );

    await renderPage();
    await openGalleryPhotosPanel();

    const choices = await screen.findByRole("group", {
      name: "Cover photo choices",
    });
    expect(
      await within(choices).findAllByText(/Preview unavailable/i),
    ).not.toHaveLength(0);
    expect(within(choices).queryByText(/Key needed/i)).not.toBeInTheDocument();

    expect(
      screen.queryByText(/Encrypted media fetch failed: 404/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Media fetch failed: 404/i),
    ).not.toBeInTheDocument();
  });

  it("always shows drag/drop and browse upload in the Cover photo picker", async () => {
    await renderPage();
    const title = await openGalleryPhotosPanel();

    const section = title.closest("section");
    expect(section).not.toBeNull();

    expect(
      within(section as HTMLElement).getByText(
        /Drag & drop files, or click to browse/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(section as HTMLElement).getByRole("group", {
        name: "Cover photo choices",
      }),
    ).toBeInTheDocument();
    expect(mocks.useUpload).toHaveBeenCalledWith(
      expect.any(String),
      "token-1",
      expect.objectContaining({
        destination: { galleryId: "gallery-1", albumId: null },
      }),
    );

    const file = new File([new Uint8Array([1, 2, 3])], "Wedding (42).jpg", {
      type: "image/jpeg",
    });
    const fileInputs = (section as HTMLElement).querySelectorAll(
      'input[type="file"]',
    );
    expect(fileInputs.length).toBeGreaterThan(0);

    fireEvent.change(fileInputs[0], {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(mocks.uploadAddFiles).toHaveBeenCalledWith([file]),
    );
  });

  it("saves Indian language font and style choices for title and subtitle", async () => {
    await renderPage();

    await openCoverEditorTab("Text");

    fireEvent.change(await screen.findByLabelText("Title language"), {
      target: { value: "telugu" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle language"), {
      target: { value: "tamil" },
    });
    fireEvent.change(screen.getByLabelText("Title font weight"), {
      target: { value: "700" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle font weight"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("switch", { name: /italic title/i }));

    fireEvent.change(screen.getByPlaceholderText("Your gallery title"), {
      target: { value: "ఆశా & రవి" },
    });
    fireEvent.change(screen.getByPlaceholderText("Optional subtitle"), {
      target: { value: "தமிழ் வரவேற்பு" },
    });
    fireEvent.change(screen.getByLabelText("Title horizontal position"), {
      target: { value: "27" },
    });
    fireEvent.change(screen.getByLabelText("Title vertical position"), {
      target: { value: "41" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle horizontal position"), {
      target: { value: "72" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle vertical position"), {
      target: { value: "63" },
    });
    fireEvent.change(screen.getByLabelText("Title font size"), {
      target: { value: "64" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle font size"), {
      target: { value: "24" },
    });
    fireEvent.click(screen.getByRole("button", { name: /phone preview/i }));
    fireEvent.change(screen.getByLabelText("Title horizontal position"), {
      target: { value: "44" },
    });
    fireEvent.change(screen.getByLabelText("Title vertical position"), {
      target: { value: "48" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle horizontal position"), {
      target: { value: "46" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle vertical position"), {
      target: { value: "62" },
    });
    fireEvent.change(screen.getByLabelText("Title font size"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle font size"), {
      target: { value: "18" },
    });
    fireEvent.change(screen.getByLabelText("Title color picker"), {
      target: { value: "#f6d77a" },
    });
    fireEvent.change(screen.getByLabelText("Subtitle color picker"), {
      target: { value: "#9be7ff" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Title font" }));
    fireEvent.click(screen.getByRole("option", { name: /Anek Telugu/i }));

    fireEvent.click(screen.getByRole("button", { name: "Subtitle font" }));
    fireEvent.click(screen.getByRole("option", { name: /Noto Serif Tamil/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalled();
    });

    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig).toMatchObject({
      cover: {
        title: "ఆశా & రవి",
        subtitle: "தமிழ் வரவேற்பு",
        titlePosition: { x: 27, y: 41 },
        subtitlePosition: { x: 72, y: 63 },
        mobileTitlePosition: { x: 44, y: 48 },
        mobileSubtitlePosition: { x: 46, y: 62 },
        titleColor: "#f6d77a",
        subtitleColor: "#9be7ff",
        deviceProfiles: {
          desktop: expect.objectContaining({
            title: "ఆశా & రవి",
            subtitle: "தமிழ் வரவேற்பு",
            titlePosition: { x: 27, y: 41 },
            subtitlePosition: { x: 72, y: 63 },
            typography: expect.objectContaining({
              titleSize: 64,
              subtitleSize: 24,
            }),
          }),
          phone: expect.objectContaining({
            title: "ఆశా & రవి",
            subtitle: "தமிழ் வரவேற்பு",
            titlePosition: { x: 44, y: 48 },
            subtitlePosition: { x: 46, y: 62 },
            typography: expect.objectContaining({
              titleSize: 42,
              subtitleSize: 18,
            }),
          }),
        },
      },
      typography: {
        titleLanguage: "telugu",
        subtitleLanguage: "tamil",
        headingFont: "Anek Telugu",
        bodyFont: "Noto Serif Tamil",
        titleWeight: 700,
        subtitleWeight: 500,
        titleItalic: true,
        subtitleItalic: false,
        titleSize: 64,
        subtitleSize: 24,
        mobileTitleSize: 42,
        mobileSubtitleSize: 18,
      },
    });
  }, 15_000);

  it("shows layer controls, expanded Indian presets, and save-only commands", async () => {
    await renderPage();

    expect(
      await screen.findByRole("button", { name: /mehendi green/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sangeet night/i }),
    ).toBeInTheDocument();

    await openCoverEditorTab("Text");

    expect(
      screen.queryByText("Cover quality checklist"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /show title layer/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("switch", { name: /show subtitle layer/i }),
    );
    expect(
      screen.queryByRole("button", { name: /undo cover design change/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /redo cover design change/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /save cover and design \(unsaved changes\)/i,
      }),
    ).toBeEnabled();
  });

  it("can restore editable cover copy from the album title and description", async () => {
    await renderPage();

    await openCoverEditorTab("Text");
    fireEvent.change(await screen.findByPlaceholderText("Your gallery title"), {
      target: { value: "Custom reception cover" },
    });
    fireEvent.change(screen.getByPlaceholderText("Optional subtitle"), {
      target: { value: "Custom client line" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Use album name" }));
    fireEvent.click(screen.getByRole("button", { name: "Use description" }));
    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalled();
    });

    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(savedConfig).toMatchObject({
      cover: {
        title: "Asha & Ravi",
        subtitle: "Wedding highlights",
      },
    });
  });

  it("opens text controls when selecting title or subtitle in the preview", async () => {
    await renderPage();

    await expectCoverEditorTabSelected("Cover");

    const stage = screen.getByLabelText(/Cover preview/i);
    const titleOverlay = within(stage).getByRole("heading", {
      name: "Asha & Ravi",
    });

    fireEvent.pointerDown(titleOverlay, {
      pointerId: 1,
      clientX: 500,
      clientY: 400,
    });

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", {
          name: "Cover editor section",
        }),
      ).toHaveValue("text");
    });
    expect(screen.getByPlaceholderText("Your gallery title")).toBeVisible();

    const subtitleOverlay = within(stage).getByText("Wedding highlights");
    fireEvent.pointerDown(subtitleOverlay, {
      pointerId: 2,
      clientX: 520,
      clientY: 460,
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText(
          "Desktop subtitle position 50% horizontal, 82% vertical",
        ),
      ).toHaveAttribute("data-state", "active");
    });
    expect(screen.getByPlaceholderText("Optional subtitle")).toBeVisible();
  });

  it("saves multi-photo template slots and per-slot focal points", async () => {
    await renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /use proofing first design/i,
      }),
    );
    await openGalleryPhotosPanel();

    const slotHeading = screen.getByRole("heading", {
      name: "Gallery photos",
    });
    const slotSection = slotHeading.closest("section");
    expect(slotSection).not.toBeNull();

    fireEvent.click(
      within(slotSection as HTMLElement).getByRole("button", {
        name: "Photo 2",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /use Wedding \(43\)\.jpg as template photo 2/i,
      }),
    );

    fireEvent.change(screen.getByLabelText("Move left/right"), {
      target: { value: "64" },
    });
    fireEvent.change(screen.getByLabelText("Move up/down"), {
      target: { value: "31" },
    });
    fireEvent.change(screen.getByLabelText("Photo zoom"), {
      target: { value: "145" },
    });

    const stage = screen.getByLabelText(/Cover preview/i);
    const secondTemplateSlot = within(stage).getByRole("button", {
      name: "Cover template photo 2",
    });
    expect(
      within(secondTemplateSlot).getByAltText("Wedding (43).jpg"),
    ).toHaveStyle({
      objectPosition: "64% 31%",
      transform: "scale(1.45)",
      transformOrigin: "64% 31%",
    });

    fireEvent.click(
      screen.getByRole("button", { name: /save cover and design/i }),
    );

    await waitFor(() => {
      expect(updateGalleryDesign).toHaveBeenCalled();
    });

    const savedConfig = vi.mocked(updateGalleryDesign).mock
      .calls[0]?.[2] as Record<string, unknown>;
    const savedCover = savedConfig.cover as {
      styleId?: string;
      mediaMode?: string;
      assetSlots?: Array<string | null>;
      slotFocalPoints?: Array<{ x: number; y: number }>;
      slotZooms?: number[];
      deviceProfiles?: {
        desktop?: { slotZooms?: number[] };
      };
    };
    expect(savedCover.styleId).toBe("modern-grid");
    expect(savedCover.mediaMode).toBe("photo-grid");
    expect(savedCover.assetSlots?.slice(0, 4)).toEqual([
      "asset-cover",
      "asset-2",
      "asset-3",
      "asset-4",
    ]);
    expect(savedCover.slotFocalPoints?.[1]).toEqual({ x: 64, y: 31 });
    expect(savedCover.slotZooms?.[1]).toBe(1.45);
    expect(savedCover.deviceProfiles?.desktop?.slotZooms?.[1]).toBe(1.45);
  });

  it("recenters and resets zoom when changing a template slot photo", async () => {
    await renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /use proofing first design/i,
      }),
    );
    await openGalleryPhotosPanel();

    const slotHeading = screen.getByRole("heading", {
      name: "Gallery photos",
    });
    const slotSection = slotHeading.closest("section");
    expect(slotSection).not.toBeNull();

    fireEvent.click(
      within(slotSection as HTMLElement).getByRole("button", {
        name: "Photo 2",
      }),
    );
    fireEvent.change(screen.getByLabelText("Move left/right"), {
      target: { value: "64" },
    });
    fireEvent.change(screen.getByLabelText("Move up/down"), {
      target: { value: "31" },
    });
    fireEvent.change(screen.getByLabelText("Photo zoom"), {
      target: { value: "145" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /use Wedding \(44\)\.jpg as template photo 2/i,
      }),
    );

    expect(screen.getByLabelText("Move left/right")).toHaveValue("50");
    expect(screen.getByLabelText("Move up/down")).toHaveValue("50");
    expect(screen.getByLabelText("Photo zoom")).toHaveValue("100");

    const stage = screen.getByLabelText(/Cover preview/i);
    const secondTemplateSlot = within(stage).getByRole("button", {
      name: "Cover template photo 2",
    });
    expect(
      within(secondTemplateSlot).getByAltText("Wedding (44).jpg"),
    ).toHaveStyle({
      objectPosition: "50% 50%",
      transform: "scale(1)",
      transformOrigin: "50% 50%",
    });
  });

  it("pushes the selected gallery photo into the active cover template slot preview", async () => {
    await renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /use proofing first design/i,
      }),
    );
    await openGalleryPhotosPanel();

    const slotSection = screen
      .getByRole("heading", { name: "Gallery photos" })
      .closest("section");
    expect(slotSection).not.toBeNull();

    fireEvent.click(
      within(slotSection as HTMLElement).getByRole("button", {
        name: "Photo 2",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /use Wedding \(44\)\.jpg as template photo 2/i,
      }),
    );

    const stage = screen.getByLabelText(/Cover preview/i);
    const secondTemplateSlot = within(stage).getByRole("button", {
      name: "Cover template photo 2",
    });

    expect(
      within(secondTemplateSlot).getByAltText("Wedding (44).jpg"),
    ).toBeInTheDocument();
  });

  it("labels picker tiles with the template photo slots that already use them", async () => {
    await renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /use proofing first design/i,
      }),
    );
    await openGalleryPhotosPanel();

    const secondTile = screen.getByRole("button", {
      name: /use Wedding \(43\)\.jpg as template photo 1/i,
    });

    expect(within(secondTile).getByText("Photo 2")).toBeInTheDocument();
    expect(secondTile).toHaveTextContent("Used in Photo 2");
  });

  it("explains that an empty picker means this gallery has no linked ready photos", async () => {
    vi.mocked(listGalleryAssets).mockResolvedValueOnce([]);

    await renderPage();
    await openGalleryPhotosPanel();

    expect(
      await screen.findByText(
        /No ready photos are linked to this gallery yet/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/before choosing Photo 1 for the cover/i),
    ).toBeInTheDocument();
  });
});
