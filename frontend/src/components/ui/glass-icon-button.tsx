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
  sm: "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4",
  md: "h-11 w-11 [&_svg]:h-5 [&_svg]:w-5",
  lg: "h-13 w-13 [&_svg]:h-6 [&_svg]:w-6",
};

const variantClasses: Record<Variant, { base: string; active: string }> = {
  glass: {
    base: [
      "bg-white/[0.12] dark:bg-white/[0.08]",
      "backdrop-blur-[12px] backdrop-saturate-[180%]",
      "border border-white/[0.18] dark:border-white/[0.10]",
      "shadow-[0_2px_8px_-2px_hsla(0,0%,0%,0.08)]",
      "text-white/90",
      "hover:bg-white/[0.22] dark:hover:bg-white/[0.16]",
      "hover:shadow-[0_4px_12px_-2px_hsla(0,0%,0%,0.12)]",
      "hover:border-white/[0.28]",
    ].join(" "),
    active: "bg-white/[0.30] border-white/[0.35] shadow-[0_4px_16px_-2px_hsla(0,0%,0%,0.15)]",
  },
  solid: {
    base: [
      "bg-white/20 dark:bg-white/15",
      "backdrop-blur-[8px]",
      "border border-white/20",
      "shadow-[0_2px_8px_-2px_hsla(0,0%,0%,0.1)]",
      "text-white",
      "hover:bg-white/30",
    ].join(" "),
    active: "bg-white/35 border-white/40",
  },
  ghost: {
    base: "bg-transparent text-white/70 hover:text-white hover:bg-white/[0.08]",
    active: "text-white bg-white/[0.12]",
  },
  danger: {
    base: [
      "bg-feedback-error/[0.15]",
      "backdrop-blur-[12px]",
      "border border-feedback-error/[0.25]",
      "text-feedback-error/70",
      "hover:bg-red-500/[0.25] hover:border-red-400/[0.35]",
    ].join(" "),
    active: "bg-feedback-error/[0.35] border-feedback-error/[0.45]",
  },
  success: {
    base: [
      "bg-feedback-success/[0.15]",
      "backdrop-blur-[12px]",
      "border border-feedback-success/[0.25]",
      "text-feedback-success/70",
      "hover:bg-green-500/[0.25] hover:border-green-400/[0.35]",
    ].join(" "),
    active: "bg-feedback-success/[0.35] border-feedback-success/[0.45]",
  },
  accent: {
    base: [
      "bg-accent-secondary/[0.15]",
      "backdrop-blur-[12px]",
      "border border-accent-secondary/[0.25]",
      "text-accent-secondary/70",
      "hover:bg-blue-500/[0.25] hover:border-blue-400/[0.35]",
    ].join(" "),
    active: "bg-accent-secondary/[0.35] border-accent-secondary/[0.45]",
  },
};

export const GlassIconButton = forwardRef<HTMLButtonElement, GlassIconButtonProps>(
  ({ size = "md", variant = "glass", label, badge, active, className, children, ...props }, ref) => {
    const v = variantClasses[variant];
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          // Base: circle, center content, smooth transitions
          "relative inline-flex items-center justify-center rounded-full",
          "transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
          "disabled:opacity-40 disabled:pointer-events-none",
          "active:scale-[0.92] active:transition-transform active:duration-100",
          // Size
          sizeClasses[size],
          // Variant
          active ? v.active : v.base,
          className,
        )}
        {...props}
      >
        {children}
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-feedback-error px-1 text-[10px] font-bold text-white shadow-sm">
            {badge}
          </span>
        )}
      </button>
    );
  }
);

GlassIconButton.displayName = "GlassIconButton";
