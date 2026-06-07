import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { ResizableWorkspaceSplit } from "../resizable-workspace-split";

const STORAGE_KEY = "rawdrive:gallery-workspace:test:split:v1";

function renderSplit(
  props: Partial<ComponentProps<typeof ResizableWorkspaceSplit>> = {},
) {
  const result = render(
    <ResizableWorkspaceSplit
      storageKey={STORAGE_KEY}
      label="Resize test workspace"
      defaultSecondaryPercent={30}
      minSecondaryPercent={20}
      maxSecondaryPercent={45}
      minSecondaryPx={200}
      maxSecondaryPx={450}
      {...props}
    >
      <section>Primary pane</section>
      <aside>Secondary pane</aside>
    </ResizableWorkspaceSplit>,
  );
  const split = result.container.firstElementChild as HTMLElement;
  return { ...result, split };
}

describe("ResizableWorkspaceSplit", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.body.dataset.galleryWorkspaceResizing;
  });

  it("persists keyboard-resized end rail width as a workspace preference", () => {
    const { split } = renderSplit();

    const handle = screen.getByRole("separator", {
      name: "Resize test workspace",
    });

    expect(
      split.style.getPropertyValue("--gallery-resizable-secondary-size"),
    ).toBe("30%");

    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("32");
    expect(
      split.style.getPropertyValue("--gallery-resizable-secondary-size"),
    ).toBe("32%");
  });

  it("hydrates a saved width on reload", () => {
    window.localStorage.setItem(STORAGE_KEY, "41.5");

    const { split } = renderSplit();

    expect(
      split.style.getPropertyValue("--gallery-resizable-secondary-size"),
    ).toBe("41.5%");
  });

  it("increases start-side rails with the right arrow", () => {
    renderSplit({ secondarySide: "start" });

    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize test workspace" }),
      { key: "ArrowRight" },
    );

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("32");
  });

  it("persists pointer drag changes within pixel and percent bounds", () => {
    const { split } = renderSplit();
    split.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 1100,
        top: 0,
        bottom: 600,
        width: 1000,
        height: 600,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const handle = screen.getByRole("separator", {
      name: "Resize test workspace",
    });

    fireEvent.pointerDown(handle, { clientX: 650 });
    fireEvent.pointerMove(window, { clientX: 700 });
    fireEvent.pointerUp(window);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("40");
    expect(
      split.style.getPropertyValue("--gallery-resizable-secondary-size"),
    ).toBe("40%");
  });
});
