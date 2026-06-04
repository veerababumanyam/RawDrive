import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for F-084.
 *
 * The per-row "Delete stream" control on the Streams list page must use the
 * mandated <GlassIconButton> (variant="danger") with the shared <Trash> icon —
 * NOT a raw <button> wrapping an inline trash <svg>. The latter bypasses the
 * GlassIconButton mandate (AGENTS.md "UI Component System") for icon-only
 * destructive actions.
 *
 * This is a source-level assertion test on purpose: this frontend's vitest
 * setup runs in a node environment without jsdom/@testing-library wired up, and
 * the concurrency guard for this fix wave forbids adding deps or editing shared
 * config. Reading the component source lets the guard run under the existing
 * test infra with zero new dependencies. It still fails on the pre-fix source
 * (raw <button> + inline <svg>) and passes on the post-fix source.
 */
describe("StreamsPage delete control (F-084)", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
    "utf8",
  );

  it("imports GlassIconButton and the Trash icon", () => {
    expect(src).toMatch(
      /import\s*\{\s*GlassIconButton\s*\}\s*from\s*["']@\/components\/ui\/glass-icon-button["']/,
    );
    expect(src).toMatch(
      // Trash may be imported alongside other icons (e.g. { Plus, Trash, Video }).
      /import\s*\{[^}]*\bTrash\b[^}]*\}\s*from\s*["']@\/components\/icons["']/,
    );
  });

  it("renders the delete control as a danger GlassIconButton", () => {
    expect(src).toMatch(/<GlassIconButton\b/);
    expect(src).toMatch(/variant=["']danger["']/);
    expect(src).toMatch(/label=["']Delete stream["']/);
    // The icon glyph is supplied via the shared registry, not an inline path.
    expect(src).toMatch(/<Trash\s*\/>/);
  });

  it("does not use a raw <button> with an inline trash <svg> for the delete action", () => {
    // The pre-fix anti-pattern: an aria-labelled raw <button> ... </button>
    // wrapping an inline <svg>. Assert no <button> tag carries the delete label.
    expect(src).not.toMatch(/<button[^>]*aria-label=["']Delete stream["']/);
    // And no inline trash path remains anywhere in the file.
    expect(src).not.toContain("M14.74 9");
    expect(src).not.toContain("m14.74 9");
  });
});
