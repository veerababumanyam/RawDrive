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
    expect(source).toContain('className="input-base cover-header-select"');
    expect(source).toContain('className="glass-segmented cover-device-toggle"');
    expect(source).toContain('className="cover-font-trigger"');
    expect(source).toContain('className="cover-control-card"');
    expect(source).toContain('className="cover-panel-stack"');
    expect(source).toContain('className="cover-section cover-photo-picker"');
    expect(source).toContain('className="cover-info-panel"');
    expect(source).toContain("className={COVER_RANGE_CLASS}");
    expect(source).toContain("className={COVER_COLOR_CLASS}");
    expect(
      source.match(/<SelectableTile/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(6);
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
    expect(source).toContain('className="cover-preview-fallback"');
    expect(source).toContain("cover-preview-status");
    expect(source).not.toContain("media-choice-button");
    expect(source).not.toContain(
      "bg-gradient-to-br from-surface-container to-surface-container-high",
    );
  });

  it("keeps the cover-photo picker on token-backed CSS hooks", () => {
    const css = read(globalsPath);

    expect(css).toContain(".selectable-tile__media");
    expect(css).toContain(".cover-header-select");
    expect(css).toContain(".cover-font-trigger");
    expect(css).toContain(".cover-control-card");
    expect(css).toContain(".cover-panel-stack");
    expect(css).toContain(".cover-section-header");
    expect(css).toContain(".cover-photo-picker");
    expect(css).toContain(".cover-range-input");
    expect(css).toContain(".cover-color-input");
    expect(css).toContain(".cover-option-grid");
    expect(css).toContain(".cover-grid-preview-surface");
    expect(css).toContain(".cover-photo-tile__fallback");
    expect(css).toContain(".cover-preview-fallback");
    expect(css).toContain(".cover-preview-status");
    expect(css).not.toContain(".cover-editor-segmented");
    expect(css).not.toContain(".media-choice-button");
  });
});
