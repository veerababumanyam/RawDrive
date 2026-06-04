"use client";

/**
 * Card — shared liquid-glass container primitive.
 *
 * Wraps the central glass utility classes from globals.css so surfaces stop
 * hand-composing backdrop-blur + border + shadow. All styling is token-driven
 * and renders correctly across all three themes.
 *
 * Variants:
 *  - "glass"  → .glass-card        (frosted, default)
 *  - "panel"  → .surface-panel     (near-solid elevated panel)
 *  - "solid"  → .surface-panel-strong (opaque container)
 *  - "tinted" → .liquid-glass + .liquid-glass--tinted (primary emphasis)
 *
 * The card publishes --parent-radius/--parent-padding so children can use
 * the `.radius-concentric` utility for iOS-26 concentric rounding.
 */

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardVariant = "glass" | "panel" | "solid" | "tinted";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantClasses: Record<CardVariant, string> = {
  glass: "glass-card",
  panel: "surface-panel",
  solid: "surface-panel-strong",
  tinted: "liquid-glass liquid-glass--tinted",
};

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "card-pad-sm",
  md: "card-pad-md",
  lg: "card-pad-lg",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "glass", padding = "md", className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(variantClasses[variant], paddingClasses[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("mb-4 flex flex-col gap-1", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold text-text-primary", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-text-secondary", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-6 flex items-center gap-3", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
