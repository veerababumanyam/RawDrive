import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SettingsSectionTabs } from "./settings-section-tabs";

type SettingsPageShellProps = {
  children: ReactNode;
  className?: string;
  width?: "default" | "narrow";
};

type SettingsPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
};

type SettingsPanelProps = {
  children: ReactNode;
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

type SettingsAlertProps = {
  children: ReactNode;
  tone: "success" | "error" | "warning" | "info";
};

const alertClassName: Record<SettingsAlertProps["tone"], string> = {
  success: "settings-alert--success",
  error: "settings-alert--error",
  warning: "settings-alert--warning",
  info: "settings-alert--info",
};

export function SettingsPageShell({
  children,
  className,
  width = "default",
}: SettingsPageShellProps) {
  return (
    <div
      className={cn(
        "settings-page-shell",
        width === "narrow" ? "settings-page-shell--narrow" : null,
        className,
      )}
    >
      <SettingsSectionTabs />
      {children}
    </div>
  );
}

export function SettingsPageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
  meta,
}: SettingsPageHeaderProps) {
  return (
    <section className="settings-page-header">
      <div className="settings-page-header__content">
        <div className="settings-page-header__copy">
          <div className="settings-page-header__kicker-row">
            <p className="settings-page-eyebrow">{eyebrow}</p>
            {badge ? (
              <div className="settings-page-header__badge">{badge}</div>
            ) : null}
          </div>
          <h1 className="settings-page-title">{title}</h1>
          <p className="settings-page-description">{description}</p>
          {meta ? (
            <div className="settings-page-header__meta">{meta}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="settings-page-header__actions">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}

export function SettingsPanel({
  children,
  title,
  description,
  icon,
  actions,
  className,
  contentClassName,
}: SettingsPanelProps) {
  const hasHeader = title || description || icon || actions;

  return (
    <section className={cn("settings-panel", className)}>
      {hasHeader ? (
        <div className="settings-panel__header">
          <div className="settings-panel__heading">
            {icon ? <div className="settings-panel__icon">{icon}</div> : null}
            <div>
              {title ? (
                <h2 className="settings-panel__title">{title}</h2>
              ) : null}
              {description ? (
                <p className="settings-panel__description">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="settings-panel__actions">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className={cn("settings-panel__content", contentClassName)}>
        {children}
      </div>
    </section>
  );
}

export function SettingsAlert({ children, tone }: SettingsAlertProps) {
  return (
    <div className={cn("settings-alert", alertClassName[tone])}>{children}</div>
  );
}
