"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * GlassIconButton — iOS 26 Liquid Glass style circular icon button.
 *
 * Design system: Uses design-tokens.json glass/shadow/radii tokens.
 * Inspired by Apple HIG: rounded, translucent, vibrant backdrop blur,
 * soft inner glow, subtle border, smooth spring animation on press.
 *
 * Sizes match iOS touch targets:
 *   sm = 36px (compact toolbar)
 *   md = 44px (standard — meets WCAG touch target)
 *   lg = 52px (prominent actions)
 *
 * Variants:
 *   glass    — default: translucent white/dark with backdrop blur
 *   solid    — opaque background (for primary actions)
 *   ghost    — no background, icon only (for dense toolbars)
 *   danger   — red tint for destructive actions
 *   success  — green tint for approve/confirm
 *   accent   — brand accent color
 */

type Size = "sm" | "md" | "lg";
type Variant = "glass" | "solid" | "ghost" | "danger" | "success" | "accent";

interface GlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  variant?: Variant;
  label: string; // Required for accessibility
  badge?: number | string;
  active?: boolean;
  children: ReactNode;
}

const sizeClasses: Record<Size, string> = {
  sm: "glass-icon-button--sm",
  md: "glass-icon-button--md",
  lg: "glass-icon-button--lg",
};

const variantClasses: Record<Variant, string> = {
  glass: "glass-icon-button--glass",
  solid: "glass-icon-button--solid",
  ghost: "glass-icon-button--ghost",
  danger: "glass-icon-button--danger",
  success: "glass-icon-button--success",
  accent: "glass-icon-button--accent",
};

export const GlassIconButton = forwardRef<
  HTMLButtonElement,
  GlassIconButtonProps
>(
  (
    {
      size = "md",
      variant = "glass",
      label,
      badge,
      active,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          "glass-icon-button",
          sizeClasses[size],
          variantClasses[variant],
          active ? "glass-icon-button--active" : null,
          className,
        )}
        {...props}
      >
        {children}
        {badge !== undefined && (
          <span className="glass-icon-button__badge">{badge}</span>
        )}
      </button>
    );
  },
);

GlassIconButton.displayName = "GlassIconButton";
