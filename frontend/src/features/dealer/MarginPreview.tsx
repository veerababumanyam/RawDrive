// Design source: Stitch MCP — Impact Preview panel (current→new comparison)
"use client";

interface Props { currentDealerPct?: number; newDealerPct: number; affectedDealers: number; effectiveFrom: string; }

export default function MarginPreview({ currentDealerPct, newDealerPct, affectedDealers, effectiveFrom }: Props) {
  const currentPlatform = currentDealerPct != null ? 100 - currentDealerPct : null;
  const newPlatform = 100 - newDealerPct;

  return (
    <div className="glass-card p-4 rounded-xl space-y-2 bg-surface-container">
      <h3 className="text-sm font-medium text-text-secondary">Impact Preview</h3>
      <div className="flex items-center gap-4">
        {currentDealerPct != null ? (
          <>
            <span className="text-text-secondary">Current: <span className="font-medium text-text-primary">{currentDealerPct}/{currentPlatform}</span></span>
            <span className="text-text-tertiary">→</span>
          </>
        ) : <span className="text-text-secondary">No current ratio</span>}
        <span className="text-accent-primary font-medium">New: {newDealerPct}/{newPlatform}</span>
      </div>
      <p className="text-xs text-text-tertiary">This change will affect <span className="text-accent-secondary font-medium">{affectedDealers}</span> dealers{effectiveFrom ? ` starting ${new Date(effectiveFrom).toLocaleDateString("en-IN")}` : ""}.</p>
    </div>
  );
}
