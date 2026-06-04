import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../../../..");
const calendarPagePath = path.join(
  frontendRoot,
  "src/app/(dashboard)/calendar/page.tsx",
);
const globalsPath = path.join(frontendRoot, "src/app/globals.css");

const read = (filePath: string): string => fs.readFileSync(filePath, "utf8");

describe("Calendar design-system adoption", () => {
  it("uses shared dashboard primitives and token-backed calendar hooks", () => {
    const source = read(calendarPagePath);

    expect(source).toContain("<PageContainer");
    expect(source).toContain("<PageHeader");
    expect(source).toContain("<InlineAlert");
    expect(source).toContain("<Card");
    expect(source).toContain('icon={<Plus aria-hidden="true" />}');
    expect(source).toContain("calendar-create-card");
    expect(source).toContain("calendar-month-panel");
    expect(source).toContain("calendar-day-cell");
    expect(source).toContain("calendar-event-chip");
    expect(source).toContain("calendar-detail-dialog");

    expect(source).not.toContain(
      "rounded-2xl border border-border-default bg-surface-raised",
    );
    expect(source).not.toContain("h-24 border-b border-r");
    expect(source).not.toContain("hover:bg-accent/5");
    expect(source).not.toContain("shadow-2xl");
    expect(source).not.toContain("+ New Event");
  });

  it("defines calendar hooks centrally using design token variables", () => {
    const css = read(globalsPath);
    const calendarBlock = css.slice(
      css.indexOf(".calendar-create-card"),
      css.indexOf(".empty-state-icon"),
    );

    expect(calendarBlock).toContain(".calendar-month-panel");
    expect(calendarBlock).toContain(".calendar-weekdays");
    expect(calendarBlock).toContain(".calendar-day-cell");
    expect(calendarBlock).toContain(".calendar-event-chip.status-badge");
    expect(calendarBlock).toContain(".calendar-detail-dialog");
    expect(calendarBlock).toContain("var(--space-");
    expect(calendarBlock).toContain("var(--radius-");
    expect(calendarBlock).toContain("var(--surface-");
    expect(calendarBlock).toContain("var(--text-");
    expect(calendarBlock).toContain("var(--accent-");
    expect(calendarBlock).toContain("var(--duration-");
    expect(calendarBlock).toContain("var(--z-modal)");
    expect(calendarBlock).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(calendarBlock).not.toContain("rgba(");
    expect(calendarBlock).not.toMatch(/\b(?:blue|gray|neutral|slate)-/);
  });
});
