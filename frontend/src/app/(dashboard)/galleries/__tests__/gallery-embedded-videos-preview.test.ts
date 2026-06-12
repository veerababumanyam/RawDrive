import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const ownerPreviewPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/preview/page.tsx",
);
const publicGalleryPagePath = path.join(repoRoot, "src/app/g/[slug]/page.tsx");
const publicGalleryBodyPath = path.join(
  repoRoot,
  "src/components/gallery/public-gallery-body.tsx",
);

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("gallery embedded videos in client preview", () => {
  it("renders saved videos and reels in the owner Preview as client route", () => {
    const ownerPreviewSource = read(ownerPreviewPagePath);
    const bodySource = read(publicGalleryBodyPath);

    expect(bodySource).toContain(
      'import { EmbeddedVideosPanel } from "@/components/gallery/embedded-videos-panel";',
    );
    expect(ownerPreviewSource).toContain(
      'import { readEmbeddedVideos } from "@/lib/embedded-videos";',
    );
    expect(ownerPreviewSource).toContain("const embeddedVideos = useMemo(");
    expect(ownerPreviewSource).toContain("readEmbeddedVideos(");
    expect(ownerPreviewSource).toContain("embeddedVideos={embeddedVideos}");
    expect(bodySource).toContain("<EmbeddedVideosPanel");
    expect(bodySource).toContain("initialVideos={embeddedVideos}");
    expect(bodySource).toContain("readOnly");
  });

  it("keeps video-only galleries from showing the photo empty-state in preview and public routes", () => {
    const ownerPreviewSource = read(ownerPreviewPagePath);
    const publicGallerySource = read(publicGalleryPagePath);

    expect(ownerPreviewSource).toContain("<PublicGalleryBody");
    expect(publicGallerySource).toContain("<PublicGalleryBody");

    const bodySource = read(publicGalleryBodyPath);
    expect(bodySource).toContain(
      "(loadedAssets.length > 0 || embeddedVideos.length === 0) &&",
    );
    expect(bodySource).toContain("<PublicGalleryGrid");
  });
});
