"use client";

import { useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { RechargeModal } from "./RechargeModal";

export type CreditPillProps = {
  className?: string;
};

export function CreditPill({ className }: CreditPillProps) {
  const [open, setOpen] = useState(false);
  const { balance, refresh } = useCreditBalance({ intervalMs: open ? 5_000 : 60_000 });

  const minutes = balance?.balanceMinutes ?? 0;
  const low = balance?.lowBalance ?? false;
  const display = balance ? `${minutes} min` : "—";

  const handleClose = () => {
    setOpen(false);
    void refresh();
  };

  return (
    <>
      <div
        data-testid="credit-pill"
        data-low-balance={low ? "true" : "false"}
        className={`inline-flex items-center gap-2 ${className ?? ""}`}
      >
        <GlassIconButton
          label="Open recharge modal"
          variant={low ? "danger" : "glass"}
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="credit-pill-button"
          className="px-3 w-auto rounded-full"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M3 10h18" />
            </svg>
            <span data-testid="credit-pill-minutes">{display}</span>
          </span>
        </GlassIconButton>
      </div>
      <RechargeModal open={open} onClose={handleClose} />
    </>
  );
}

export default CreditPill;
