import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-static regression test for the gallery detail page share controls
// (galleries/[id]/page.tsx), mirroring the gallery-detail-perf-a11y.test.ts
// style: read the file and assert structural guarantees without a DB,
// network, or render harness.
//
// Issue #123: commit f91ade2b ("fix gallery uploads storage and delivery
// settings") accidentally removed the ShareQrPopover import and all of its
// usages from this page, so every share group lost its QR-code option AND the
// "Download PNG" affordance that lives inside the popover. Each share group
// (selected album, All Photos, per-album list, and the Gallery visibility
// row) renders Copy + Email + QR; these assertions fail against the regressed
// source and pass once the QR popover is restored.

const repoRoot = path.resolve(__dirname, "../../../../..");
const detailPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/page.tsx",
);

function readDetailPage(): string {
  return fs.readFileSync(detailPagePath, "utf8");
}

describe("gallery detail page — share QR regression (#123)", () => {
  it("imports ShareQrPopover from the gallery component registry", () => {
    expect(readDetailPage()).toContain(
      'import { ShareQrPopover } from "@/components/gallery/share-qr-popover"',
    );
  });

  it("restores a ShareQrPopover in every Copy/Email share group", () => {
    const source = readDetailPage();
    const qrUsages = source.match(/<ShareQrPopover/g) ?? [];
    // selected-album, All Photos, per-album list, and the Gallery row.
    expect(qrUsages.length).toBeGreaterThanOrEqual(4);
  });

  it("wires the QR to the publish-gated gallery share URL with a download-capable popover", () => {
    const source = readDetailPage();
    // Publish gating mirrors the Copy/Email buttons: no QR for an unpublished
    // gallery (empty url disables the popover, which surfaces the unavailable
    // message instead of a broken QR).
    expect(source).toContain("url={gallery.is_published ? buildShareUrl()");
    expect(source).toContain("disabled={!gallery.is_published}");
    // The popover surfaces the publish-required message rather than a broken QR.
    expect(source).toContain("setShareMessage(SHARE_UNAVAILABLE_MESSAGE)");
    expect(source).toContain("Show QR code for gallery share link");
  });

  it("restores a WhatsApp share button wired to a wa.me share URL", () => {
    const source = readDetailPage();
    expect(source).toContain("const openWhatsAppShare = useCallback");
    expect(source).toContain('createWorkingShareUrl(albumId, "whatsapp")');
    expect(source).toContain("https://wa.me/?text=");
    expect(source).toContain("WhatsApp gallery share link");
    // Lightweight wa.me share — deliberately NOT the removed share-contacts
    // feature (buildShareWhatsAppHrefs/<Phone>) the perf-a11y guard forbids.
    expect(source).not.toContain("buildShareWhatsAppHrefs");
  });
});
