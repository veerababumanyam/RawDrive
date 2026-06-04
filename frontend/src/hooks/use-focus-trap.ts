"use client";

import { useEffect, type RefObject } from "react";

/**
 * useFocusTrap — the WAI-ARIA modal-dialog focus contract for a hand-rolled
 * modal container.
 *
 * RawDrive's lightboxes (photo-lightbox, public-gallery-grid) declare
 * `role="dialog" aria-modal="true"` but historically implemented none of the
 * focus contract that promise requires. `aria-modal="true"` tells assistive
 * tech the rest of the page is inert — which is a lie unless focus is actually
 * contained. This hook makes it honest:
 *
 *   1. On activate — move focus into the dialog (the container itself if it is
 *      focusable, so screen readers announce the dialog label).
 *   2. While active — keep Tab / Shift+Tab within the container by wrapping at
 *      the first/last focusable control (with a defensive recover-if-outside).
 *   3. On deactivate / unmount — restore focus to the element that was focused
 *      before the dialog opened (the trigger).
 *
 * The container MUST set `tabIndex={-1}` so step 1 can focus the shell when it
 * has no focusable children. Mirrors the focus-in/restore behavior of the
 * shared `ui/dialog.tsx`, adding the Tab containment that primitive still lacks.
 *
 * @param containerRef ref to the modal container element
 * @param active       whether the trap is engaged (e.g. `lightboxIdx !== null`)
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-hidden") !== "true",
  );
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember the trigger so we can restore focus to it on close (APG).
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog shell. Focusing the container (tabIndex={-1})
    // rather than the first control lets the screen reader announce the dialog
    // label; Tab then advances into the controls.
    container.focus();

    // Arrow (not a hoisted declaration) so TS preserves the non-null narrowing
    // of `container` from the guard above into this closure.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusableWithin(container);
      if (items.length === 0) {
        // Nothing tabbable — keep focus on the dialog shell.
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      const outside = !container.contains(activeEl);

      if (event.shiftKey) {
        if (outside || activeEl === first || activeEl === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (outside || activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      // Only restore if focus is still inside the (now closing) dialog — avoids
      // yanking focus away if something else has already claimed it.
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === "function" &&
        (document.activeElement === null ||
          document.activeElement === document.body ||
          container.contains(document.activeElement))
      ) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);
}
