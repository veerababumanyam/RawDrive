import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const coverPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/cover/page.tsx",
);
const globalsPath = path.join(repoRoot, "src/app/globals.css");

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("gallery cover page design-system contracts", () => {
  it("uses shared design-system primitives for cover editor controls", () => {
    const source = read(coverPagePath);

    expect(source).toContain('import { Badge } from "@/components/ui/badge"');
    expect(source).toContain(
      'import { GlassButton } from "@/components/ui/glass-button"',
    );
    expect(source).toContain(
      'import { SelectableTile } from "@/components/ui/selectable-tile"',
    );
    expect(source).toContain(
      'import { ToggleSwitch } from "@/components/ui/toggle-switch"',
    );
    expect(source).toContain('className="glass-segmented cover-device-toggle"');
    expect(source).toContain('className="cover-font-trigger"');
    expect(source).toContain("COVER_TEXT_LANGUAGES");
    expect(source).toContain("COVER_FONT_WEIGHTS");
    expect(source).toContain("cover-language-select");
    expect(source).toContain("cover-text-style-toggle");
    expect(source).toContain('className="cover-control-card"');
    expect(source).toContain('className="cover-panel-stack"');
    expect(source).toContain('className="cover-design-grid"');
    expect(source).toContain('className="cover-design-tile"');
    expect(source).toContain('className="cover-slot-tabs"');
    expect(source).toContain('className="cover-section cover-photo-picker"');
    expect(source).toContain(
      'import { EmbeddedVideosPanel } from "@/components/gallery/embedded-videos-panel"',
    );
    expect(source).toContain(
      'import { readEmbeddedVideos, type EmbeddedVideo } from "@/lib/embedded-videos"',
    );
    expect(source).toContain('label: "Videos"');
    expect(source).toContain('label: "Photos"');
    expect(source).toContain('className={`${COVER_FIELD_CLASS} cover-section-select`}');
    expect(source).toContain('aria-label="Cover editor section"');
    expect(source).not.toContain("cover-inspector-tabs");
    expect(source).not.toContain("cover-mobile-task-tabs");
    expect(source).not.toContain("cover-mobile-task-tab");
    expect(source).not.toContain("cover-header-select");
    expect(source).not.toContain('className="cover-header-action"');
    expect(source).not.toContain("selectLabel");
    expect(source).not.toContain("handleUndo");
    expect(source).not.toContain("handleRedo");
    expect(source).not.toContain("undoStack");
    expect(source).not.toContain("redoStack");
    expect(source).not.toContain("Brand defaults");
    expect(source).toContain("PanelGalleryPhotos");
    expect(source).toContain("EmbeddedVideosPanel");
    expect(source).toContain("readEmbeddedVideos(gallery?.settings)");
    expect(source).toContain('className="cover-videos-panel"');
    expect(source).toContain('className="cover-preview-primary-actions"');
    // The gallery-folder selector was removed from Cover & Design — the folder
    // is chosen by navigating from the gallery page (?album=), not via a
    // redundant in-editor switcher.
    expect(source).not.toContain("cover-folder-select");
    expect(source).not.toContain('aria-label="Gallery folders"');
    expect(source).not.toContain(
      'aria-label="Copy desktop cover settings to phone"',
    );
    expect(source).not.toContain('className="cover-save-dock"');
    expect(source).toContain("PanelBrand");
    expect(source).toContain('className="cover-upload-stack"');
    expect(source).toContain('className="cover-info-panel"');
    expect(source).toContain("className={COVER_RANGE_CLASS}");
    expect(source).toContain("className={COVER_COLOR_CLASS}");
    expect(
      source.match(/<SelectableTile/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(5);
    expect(source.match(/<ToggleSwitch/g)?.length ?? 0).toBeGreaterThan(2);
    expect(source.match(/<GlassButton/g)?.length ?? 0).toBeGreaterThan(4);
  });

  it("does not reintroduce bespoke hardcoded option styling", () => {
    const source = read(coverPagePath);

    expect(source).not.toContain("cover-editor-segmented");
    expect(source).not.toContain("media-choice-button");
    expect(source).not.toContain("bg-primary/10");
    expect(source).not.toContain("accent-primary");
    expect(source).not.toContain("border-border-subtle bg-surface");
    expect(source).not.toContain("rounded-xl border p-3");
    expect(source).not.toContain(
      'className="mb-2 flex items-center justify-between"',
    );
    expect(source).not.toContain('type="checkbox"');
  });

  it("uses central selectable tiles for cover-photo choices", () => {
    const source = read(coverPagePath);

    expect(source).toContain("<SelectableTile");
    expect(source).toContain('aria-label="Cover photo choices"');
    expect(source).toContain(
      'variant="neutral" className="cover-section-count"',
    );
    expect(source).toContain('className="cover-photo-tile"');
    expect(source).toContain('fallbackMode="compact"');
    expect(source).toContain('className="cover-template-slot__fallback"');
    expect(source).toContain("LockedMediaFallback");
    expect(source).not.toContain("media-choice-button");
    expect(source).not.toContain(
      "bg-gradient-to-br from-surface-container to-surface-container-high",
    );
  });

  it("renders the desktop split workbench and bounded cover-photo picker", () => {
    const source = read(coverPagePath);
    const css = read(globalsPath);

    expect(source).toContain('width="full"');
    expect(source).toContain('mode="workbench"');
    expect(source).toContain("cover-workbench");
    expect(source).toContain("ResizableWorkspaceSplit");
    expect(source).toContain(
      'storageKey="rawdrive:gallery-workspace:cover:split:v1"',
    );
    expect(source).toContain('label="Resize live preview and settings"');
    expect(source).not.toContain("cover-photo-rail");
    expect(source).toContain("cover-preview-pane");
    expect(source).toContain("cover-inspector-pane");
    expect(source).toContain("cover-section-select");
    expect(source).not.toContain("cover-inspector-tabs");
    expect(source).toContain("cover-preview-toolbar");
    expect(source).toContain("cover-preview-primary-actions");
    expect(source).not.toContain("cover-save-dock");
    expect(source).toContain("COVER_PHOTO_PAGE_SIZE");
    expect(source).toContain("pagedCoverAssets.map");
    expect(source).not.toContain("assets.map((a, index)");
    expect(css).toContain(".gallery-workspace-shell");
    expect(css).toContain(".gallery-resizable-split");
    expect(css).toContain(".gallery-resizable-split__handle");
    expect(css).toContain(".cover-workbench");
    expect(css).not.toContain(".cover-photo-rail");
    expect(css).toContain(".cover-preview-pane");
    expect(css).toContain(".cover-inspector-pane");
    expect(css).toContain("--cover-workbench-height");
    expect(css).toContain(".cover-preview-primary-actions");
    expect(css).not.toContain(".cover-save-dock");
    expect(css).toContain(".cover-videos-panel");
    expect(css).toContain(".embedded-videos-grid");
    expect(css).toContain("grid-template-columns: repeat(7, minmax(0, 1fr))");
    expect(css).toContain(".cover-photo-load-more");
  });

  it("keeps the cover-photo picker on token-backed CSS hooks", () => {
    const css = read(globalsPath);

    expect(css).toContain(".selectable-tile__media");
    expect(css).not.toContain(".cover-header-select");
    expect(css).toContain(".cover-font-trigger");
    expect(css).toContain(".cover-language-select");
    expect(css).toContain(".cover-text-style-toggle");
    expect(css).toContain(".cover-control-card");
    expect(css).toContain(".cover-panel-stack");
    expect(css).toContain(".cover-section-header");
    expect(css).toContain(".cover-template-layout");
    expect(css).toContain(".cover-design-grid");
    expect(css).toContain(".cover-template-mini");
    expect(css).toContain(".cover-slot-controls");
    const templateImageStart = css.indexOf(".cover-template-slot__image {");
    const templateImageEnd = css.indexOf(
      ".cover-template-slot__fallback",
      templateImageStart,
    );
    expect(css.slice(templateImageStart, templateImageEnd)).toContain(
      "object-fit: contain",
    );
    expect(css).toContain(".cover-photo-picker");
    expect(css).toContain(".cover-upload-stack");
    expect(css).toContain(".cover-range-input");
    expect(css).toContain(".cover-color-input");
    expect(css).toContain(".cover-option-grid");
    expect(css).toContain(".cover-grid-preview-surface");
    expect(css).toContain(".cover-folder-grid-stage");
    expect(css).toContain(".cover-grid-preview-surface--stage");
    expect(css).toContain(".cover-photo-tile__fallback");
    expect(css).toContain(".cover-preview-fallback");
    expect(css).toContain(".cover-preview-status");
    expect(css).not.toContain(".cover-editor-segmented");
    expect(css).not.toContain(".media-choice-button");
  });
});
