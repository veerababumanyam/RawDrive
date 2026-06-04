"use client";

/**
 * Dialog — shared liquid-glass modal primitive.
 *
 * Centralizes the backdrop + panel pattern that surfaces were hand-building
 * (ad-hoc backdrop-blur divs). Token-driven via .modal-backdrop and
 * .glass-card; honors reduced-transparency/contrast preferences through the
 * central utilities.
 *
 * Behavior: closes on Escape and on backdrop click, locks body scroll while
 * open, restores focus to the trigger, and labels itself from `title`.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { XMark } from "@/components/icons";

interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Hide the corner close button (e.g. for confirm-only dialogs). */
  hideCloseButton?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  hideCloseButton = false,
  className,
  ...props
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", handleKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="z-modal-layer fixed inset-0 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="modal-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "glass-card relative w-full max-w-lg p-6 outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          {hideCloseButton ? null : (
            <GlassIconButton
              size="sm"
              variant="ghost"
              label="Close dialog"
              onClick={onClose}
            >
              <XMark />
            </GlassIconButton>
          )}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? (
          <div className="mt-6 flex items-center justify-end gap-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
