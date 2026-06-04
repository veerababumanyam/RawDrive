"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SelectableTileProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "title"
> {
  selected: boolean;
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}

export const SelectableTile = forwardRef<
  HTMLButtonElement,
  SelectableTileProps
>(
  (
    { selected, media, title, description, className, type = "button", ...props },
    ref,
  ) => (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-pressed={selected}
      data-state={selected ? "selected" : "unselected"}
      className={cn("selectable-tile", className)}
    >
      {media ? <span className="selectable-tile__media">{media}</span> : null}
      <span className="selectable-tile__body">
        <span className="selectable-tile__title">{title}</span>
        {description ? (
          <span className="selectable-tile__description">{description}</span>
        ) : null}
      </span>
    </button>
  ),
);

SelectableTile.displayName = "SelectableTile";
