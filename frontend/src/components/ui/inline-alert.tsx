import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * InlineAlert — the shared inline status/feedback banner.
 *
 * Gallery pages each hand-rolled the same banner with drifting token aliases
 * and opacities (`feedback-error/20`, `error/20`, `error/30`, …). This
 * centralises one token-pure treatment per semantic variant so every banner
 * is identical and the right ARIA role is announced (error/warning → alert,
 * success/info → status).
 */
type AlertVariant = "error" | "success" | "warning" | "info";

const variantClasses: Record<AlertVariant, string> = {
  error: "border-feedback-error/30 bg-feedback-error/10 text-feedback-error",
  success:
    "border-feedback-success/30 bg-feedback-success/10 text-feedback-success",
  warning:
    "border-feedback-warning/30 bg-feedback-warning/10 text-feedback-warning",
  info: "border-accent-primary/30 bg-accent-primary/10 text-accent-primary",
};

const variantRole: Record<AlertVariant, "alert" | "status"> = {
  error: "alert",
  warning: "alert",
  success: "status",
  info: "status",
};

interface InlineAlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function InlineAlert({
  variant = "error",
  role,
  className,
  children,
  ...props
}: InlineAlertProps) {
  return (
    <div
      role={role ?? variantRole[variant]}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
