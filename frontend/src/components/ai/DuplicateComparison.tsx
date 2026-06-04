"use client";

import { useState } from "react";
import type { DuplicateGroup } from "@/lib/api/ai";

interface DuplicateComparisonProps {
  group: DuplicateGroup;
  onResolve?: (groupId: string, keepAssetIds: string[]) => void;
  onDismiss?: (groupId: string) => void;
}

export function DuplicateComparison({
  group,
  onResolve,
  onDismiss,
}: DuplicateComparisonProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(
      group.members.filter((m) => m.is_representative).map((m) => m.asset_id),
    ),
  );

  const toggleSelect = (assetId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-primary">
          {group.members.length} similar photos
        </h3>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            group.status === "pending"
              ? "bg-accent/10 text-accent"
              : group.status === "resolved"
                ? "bg-feedback-success/10 text-feedback-success"
                : "bg-surface-sunken text-text-tertiary"
          }`}
        >
          {group.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {group.members.map((member) => (
          <button
            key={member.id}
            onClick={() => toggleSelect(member.asset_id)}
            className={`relative rounded-lg overflow-hidden border-2 transition-colors min-h-[44px] ${
              selected.has(member.asset_id)
                ? "border-accent"
                : "border-transparent"
            }`}
          >
            <div className="aspect-square bg-surface-sunken flex items-center justify-center">
              <span className="text-text-tertiary text-xs">Photo</span>
            </div>

            {member.quality && (
              <div className="absolute top-2 right-2 flex gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-scrim-strong/50 text-text-media">
                  Q:{Math.round(member.quality.overall * 100)}
                </span>
              </div>
            )}

            <div className="absolute bottom-2 left-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-scrim-strong/50 text-text-media">
                {Math.round(member.similarity_score * 100)}% match
              </span>
            </div>

            {selected.has(member.asset_id) && (
              <div className="absolute top-2 left-2">
                <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                  <svg
                    className="h-3 w-3 text-text-inverse"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {group.status === "pending" && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onResolve?.(group.id, [...selected])}
            disabled={selected.size === 0}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent/90 disabled:opacity-50 min-h-[44px]"
          >
            Keep selected ({selected.size})
          </button>
          <button
            onClick={() => onDismiss?.(group.id)}
            className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
