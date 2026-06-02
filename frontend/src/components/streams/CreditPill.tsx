"use client";

import { useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { CreditCard } from "@/components/icons";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { RechargeModal } from "./RechargeModal";

export type CreditPillProps = {
  className?: string;
};

export function CreditPill({ className }: CreditPillProps) {
  const [open, setOpen] = useState(false);
  const { balance, disabled, refresh } = useCreditBalance({ intervalMs: open ? 5_000 : 60_000 });

  // Backend returns 404 for /credits/balance when the
  // `streaming.credit_pill_v1` feature flag is off. In that case the
  // streaming commercial surface is not enabled for this deployment —
  // hide the pill entirely rather than rendering a perpetual "—".
  if (disabled) return null;

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
            <CreditCard className="h-4 w-4" />
            <span data-testid="credit-pill-minutes">{display}</span>
          </span>
        </GlassIconButton>
      </div>
      <RechargeModal open={open} onClose={handleClose} />
    </>
  );
}

export default CreditPill;
