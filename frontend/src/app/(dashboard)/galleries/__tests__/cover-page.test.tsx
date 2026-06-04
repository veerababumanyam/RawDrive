import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import CoverDesignPage from "../[id]/cover/page";
import { updateGalleryDesign } from "@/lib/api/galleries";
import type { Asset } from "@/lib/api/assets";
import type { PublicAsset } from "@/lib/api/galleries";

const mocks = vi.hoisted(() => ({
  updateGalleryDesign: vi.fn(async () => ({})),
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

const asset: Asset = {
  id: "asset-cover",
  workspace_id: "workspace-1",
  filename: "Wedding (42).jpg",
  content_type: "image/jpeg",
  size_bytes: 1234,
  storage_key: "tests/photos/Wedding (42).jpg",
  exif_data: {},
  thumbnail_urls: {
    thumb_lg_webp: "/tests/photos/Wedding (42).jpg",
    thumb_md_webp: "/tests/photos/Wedding (42).jpg",
  },
  status: "ready",
  created_at: "2026-04-01T00:00:00Z",
};

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
  listGalleryAssets: vi.fn(async () => [
    {
      id: "ga-1",
      gallery_id: "gallery-1",
      asset_id: "asset-cover",
      sort_order: 0,
      is_hero: true,
    },
  ]),
  updateGalleryDesign: mocks.updateGalleryDesign,
}));

vi.mock("@/lib/api/assets", () => ({
  getAsset: vi.fn(async () => asset),
}));

vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: (
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
        mediaMode: "photo-grid",
        scrimStyle: "warm-vignette",
        textBackdrop: "glass",
      },
      branding: {
        logoPlacement: "top-right",
        monogram: "AR",
      },
    });
    expect(savedConfig.sceneHeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "haldi", label: "Haldi", enabled: true }),
      ]),
    );
  });
});
