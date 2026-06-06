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
import { listGalleryAssets, updateGalleryDesign } from "@/lib/api/galleries";
import type { Asset } from "@/lib/api/assets";
import type { PublicAsset } from "@/lib/api/galleries";

const mocks = vi.hoisted(() => ({
  updateGalleryDesign: vi.fn(async () => ({})),
  useUpload: vi.fn(),
  uploadAddFiles: vi.fn(),
  uploadCancel: vi.fn(),
  uploadRetry: vi.fn(),
  useDecryptedAssetUrl: vi.fn(),
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

describe("CoverDesignPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("applies cover presets and saves the expanded experience config", async () => {
    await renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /haldi warm/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /haldi warm/i }));
    fireEvent.click(screen.getByRole("button", { name: /phone preview/i }));

    expect(screen.getByLabelText(/mobile safe zone/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Editor section"), {
      target: { value: "media" },
    });
    fireEvent.click(screen.getByRole("button", { name: /photo grid/i }));

    fireEvent.change(screen.getByLabelText("Editor section"), {
      target: { value: "scenes" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: /haldi scene header/i }),
    );

    fireEvent.change(screen.getByLabelText("Editor section"), {
      target: { value: "brand" },
    });
    fireEvent.change(screen.getByLabelText(/monogram/i), {
      target: { value: "AR" },
    });
    fireEvent.click(screen.getByRole("button", { name: /top right/i }));
    fireEvent.change(screen.getByLabelText("Watermark text"), {
      target: { value: "Asha Ravi Studio" },
    });
    fireEvent.change(screen.getByLabelText("Logo size"), {
      target: { value: "56" },
    });
    fireEvent.change(screen.getByLabelText("Logo opacity"), {
      target: { value: "82" },
    });
    fireEvent.change(screen.getByLabelText("Watermark opacity"), {
      target: { value: "45" },
    });

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
            mediaMode: "photo-grid",
          }),
        },
      },
      branding: {
        logoPlacement: "top-right",
        monogram: "AR",
        logoSize: 56,
        logoOpacity: 82,
        watermarkText: "Asha Ravi Studio",
        watermarkOpacity: 45,
      },
    });
    expect(savedConfig.sceneHeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "haldi", label: "Haldi", enabled: true }),
      ]),
    );
  }, 10000);

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

    fireEvent.change(await screen.findByLabelText("Editor section"), {
      target: { value: "grid" },
    });

    expect(
      await screen.findAllByText(/Preview unavailable/i),
    ).not.toHaveLength(0);
    expect(
      screen.queryByText(/Encrypted media fetch failed: 404/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Media fetch failed: 404/i)).not.toBeInTheDocument();
  });

  it("always shows drag/drop and browse upload in the Cover photo picker", async () => {
    await renderPage();

    const title = await screen.findByRole("heading", { name: "Cover photo" });
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
        destination: { galleryId: "gallery-1" },
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

    fireEvent.change(screen.getByLabelText("Editor section"), {
      target: { value: "text" },
    });

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

  it("shows layer controls, undo, and expanded Indian presets", async () => {
    await renderPage();

    expect(
      await screen.findByRole("button", { name: /mehendi green/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sangeet night/i }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Editor section"), {
      target: { value: "text" },
    });

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
      screen.getByRole("button", { name: /undo cover design change/i }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: /undo cover design change/i }),
    );
    expect(
      screen.getByRole("button", { name: /redo cover design change/i }),
    ).toBeEnabled();
  });

  it("can restore editable cover copy from the album title and description", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText("Editor section"), {
      target: { value: "text" },
    });
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

    const editorSection = await screen.findByLabelText("Editor section");
    expect((editorSection as HTMLSelectElement).value).toBe("cover");

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
      expect((editorSection as HTMLSelectElement).value).toBe("text");
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
        name: /use four grid cover template/i,
      }),
    );

    const slotHeading = screen.getByRole("heading", {
      name: "Template photo slots",
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

    fireEvent.change(screen.getByLabelText("Horizontal focal"), {
      target: { value: "64" },
    });
    fireEvent.change(screen.getByLabelText("Vertical focal"), {
      target: { value: "31" },
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
  });

  it("pushes the selected gallery photo into the active cover template slot preview", async () => {
    await renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /use four grid cover template/i,
      }),
    );

    const slotSection = screen
      .getByRole("heading", { name: "Template photo slots" })
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
        name: /use four grid cover template/i,
      }),
    );

    const secondTile = screen.getByRole("button", {
      name: /use Wedding \(43\)\.jpg as template photo 1/i,
    });

    expect(within(secondTile).getByText("Photo 2")).toBeInTheDocument();
    expect(secondTile).toHaveTextContent("Used in Photo 2");
  });

  it("explains that an empty picker means this gallery has no linked ready photos", async () => {
    vi.mocked(listGalleryAssets).mockResolvedValueOnce([]);

    await renderPage();

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
