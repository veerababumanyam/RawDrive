"use client";

import type { ReactNode } from "react";
import { useId } from "react";

/**
 * StatTile — KPI tile (label + value + optional sublabel/icon/tone).
 * Uses design tokens via Tailwind semantic classes only.
 */

export type StatTileTone = "default" | "success" | "warning" | "danger";

export interface StatTileProps {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: StatTileTone;
  icon?: ReactNode;
  className?: string;
}

const toneClass: Record<StatTileTone, string> = {
  default: "text-text-primary",
  success: "text-feedback-success",
  warning: "text-feedback-warning",
  danger: "text-feedback-error",
};

export function StatTile({
  label,
  value,
  sublabel,
  tone = "default",
  icon,
  className,
}: StatTileProps) {
  const reactId = useId();
  const labelId = `stat-${reactId}-label`;
  const valueId = `stat-${reactId}-value`;
  return (
    <div
      data-tone={tone}
      role="group"
      aria-labelledby={`${labelId} ${valueId}`}
      className={[
        "flex flex-col gap-1 rounded-2xl border border-border-subtle bg-surface-elevated p-4",
        "shadow-sm",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span id={labelId}>{label}</span>
        {icon ? <span className="text-text-tertiary">{icon}</span> : null}
      </div>
      <div
        id={valueId}
        className={["text-2xl font-semibold tabular-nums", toneClass[tone]].join(" ")}
      >
        {value}
      </div>
      {sublabel ? (
        <div className="text-xs text-text-tertiary">{sublabel}</div>
      ) : null}
    </div>
  );
}
