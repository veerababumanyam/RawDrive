"use client";

/**
 * Badge — shared status/label pill primitive.
 *
 * Wraps the central .status-badge utility classes from globals.css so badge
 * styling stays token-driven and theme-correct. Status badges must not rely
 * on color alone (a11y differentiateWithoutColor) — pass an icon or clear
 * text where state matters.
 */

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "status-badge--neutral",
  accent: "status-badge--accent",
  info: "status-badge--info",
  success: "status-badge--success",
  warning: "status-badge--warning",
  danger: "status-badge--danger",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("status-badge", variantClasses[variant], className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";
