"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "surface" | "quiet" | "danger" | "success";
type Size = "sm" | "md" | "lg";

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "glass-button--primary",
  surface: "glass-button--surface",
  quiet: "glass-button--quiet",
  danger: "glass-button--danger",
  success: "glass-button--success",
};

const sizeClasses: Record<Size, string> = {
  sm: "glass-button--sm",
  md: "glass-button--md",
  lg: "glass-button--lg",
};

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    { variant = "surface", size = "md", icon, className, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "glass-button",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {icon ? <span className="glass-button__icon">{icon}</span> : null}
        <span>{children}</span>
      </button>
    );
  },
);

GlassButton.displayName = "GlassButton";
