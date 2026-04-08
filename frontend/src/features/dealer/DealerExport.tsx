// Design source: Stitch MCP Liquid Glass — dropdown export button
"use client";

import { useState } from "react";

interface Props { onExport: (format: "csv" | "pdf", type: "users" | "commissions" | "summary") => void; isExporting: boolean; }

export default function DealerExport({ onExport, isExporting }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} disabled={isExporting} className="btn-secondary px-4 min-h-[44px] rounded-full flex items-center gap-2">
        {isExporting ? "Exporting..." : "Export"}
        <span className="text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 glass-card p-2 rounded-xl shadow-lg z-10 min-w-[180px] space-y-1">
          {(["users", "commissions", "summary"] as const).map(type => (
            <div key={type} className="space-y-1">
              {(["csv", "pdf"] as const).map(format => (
                <button key={format} onClick={() => { onExport(format, type); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-surface-sunken rounded-lg min-h-[44px]">
                  {type} ({format.toUpperCase()})
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
