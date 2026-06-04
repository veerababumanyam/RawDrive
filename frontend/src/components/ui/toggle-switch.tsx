"use client";

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface ToggleSwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  checked: boolean;
  label: string;
  checkedLabel?: string;
  uncheckedLabel?: string;
  busy?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const ToggleSwitch = forwardRef<HTMLButtonElement, ToggleSwitchProps>(
  (
    {
      checked,
      label,
      checkedLabel = "On",
      uncheckedLabel = "Off",
      busy = false,
      disabled,
      className,
      onClick,
      onCheckedChange,
      ...props
    },
    ref,
  ) => {
    const stateLabel = checked ? checkedLabel : uncheckedLabel;
    const unavailable = disabled || busy;

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) {
        onCheckedChange?.(!checked);
      }
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label}: ${stateLabel}`}
        disabled={unavailable}
        className={cn("publish-state-toggle", className)}
        data-state={checked ? "published" : "unpublished"}
        onClick={handleClick}
        {...props}
      >
        <span className="publish-state-toggle__track" aria-hidden="true">
          <span className="publish-state-toggle__thumb" />
        </span>
        <span className="publish-state-toggle__label">
          {busy ? "Saving..." : stateLabel}
        </span>
      </button>
    );
  },
);

ToggleSwitch.displayName = "ToggleSwitch";
