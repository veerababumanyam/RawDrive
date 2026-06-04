import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "../use-focus-trap";

/**
 * Harness: a hand-rolled modal container (mirrors the gallery lightboxes) that
 * delegates its focus contract to useFocusTrap. The container declares
 * role="dialog" + aria-modal="true" so the trap makes that promise honest.
 */
function TrapDialog({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} aria-label="trap">
      <button type="button">first</button>
      <button type="button">second</button>
      <button type="button">third</button>
    </div>
  );
}

function Scene({ active }: { active: boolean }) {
  return (
    <>
      <button type="button" data-testid="opener">
        opener
      </button>
      {active ? <TrapDialog active /> : null}
    </>
  );
}

describe("useFocusTrap", () => {
  it("moves focus into the dialog container when activated", () => {
    render(<TrapDialog active />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("does NOT move focus when inactive", () => {
    render(<TrapDialog active={false} />);
    expect(document.activeElement).not.toBe(screen.getByRole("dialog"));
  });

  it("wraps focus to the first element when Tab is pressed on the last", () => {
    render(<TrapDialog active />);
    const buttons = screen.getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Tab" });

    expect(document.activeElement).toBe(buttons[0]);
  });

  it("wraps focus to the last element when Shift+Tab is pressed on the first", () => {
    render(<TrapDialog active />);
    const buttons = screen.getAllByRole("button");
    const first = buttons[0];
    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("wraps to the last element on Shift+Tab from the dialog shell", () => {
    // On open the trap focuses the container itself (so the dialog label is
    // announced); Shift+Tab from there must wrap to the last control, not
    // escape to the page behind.
    render(<TrapDialog active />);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    const buttons = screen.getAllByRole("button");

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("restores focus to the previously focused element when deactivated", () => {
    const { rerender } = render(<Scene active={false} />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    expect(document.activeElement).toBe(opener);

    rerender(<Scene active />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    rerender(<Scene active={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it("does not throw when the container has no focusable children", () => {
    function Empty({ active }: { active: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, active);
      return <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} />;
    }
    render(<Empty active />);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    expect(() => fireEvent.keyDown(dialog, { key: "Tab" })).not.toThrow();
    expect(document.activeElement).toBe(dialog);
  });
});
