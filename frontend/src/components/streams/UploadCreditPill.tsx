"use client";

import { useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ArrowUpTray } from "@/components/icons";
import { useUploadCreditBalance } from "@/hooks/useUploadCreditBalance";
import { RechargeModal } from "./RechargeModal";

// M41 FR-UCRT-10 follow-up — the upload credits surfacing fix.
//
// Bug reported after the feature branch shipped: "I don't see an option
// in frontend for credits." Root cause: PR #44 added the uploads tab to
// the RechargeModal, but only the streaming CreditPill was actually
// mounted in AppShell, and it opens the modal on the streaming tab by
// default. Upload credits had no entry point in the nav.
//
// This component is the sibling of CreditPill: calls
// /api/v1/uploads/balance, shows "{N} credits", opens the same
// RechargeModal with `initialSurface="uploads"` so the user lands
// directly on the upload catalogue tab.
//
// Self-hiding when the feature flag is off: backend returns 404 on
// /uploads/balance when UPLOAD_CREDIT_PILL_V1_ENABLED is not set. The
// hook treats 404 as "feature off" and the pill renders null — so a
// dev-mode deploy without the flag doesn't show a broken pill at "—".

export type UploadCreditPillProps = {
  className?: string;
};

export function UploadCreditPill({ className }: UploadCreditPillProps) {
  const [open, setOpen] = useState(false);
  const { balance, disabled, refresh } = useUploadCreditBalance({
    intervalMs: open ? 5_000 : 60_000,
  });

  if (disabled) return null;

  const credits = balance?.availableCredits ?? 0;
  const low = balance?.lowBalance ?? false;
  const display = balance ? `${credits.toLocaleString("en-IN")} credits` : "—";

  const handleClose = () => {
    setOpen(false);
    void refresh();
  };

  return (
    <>
      <div
        data-testid="upload-credit-pill"
        data-low-balance={low ? "true" : "false"}
        className={`inline-flex items-center gap-2 ${className ?? ""}`}
      >
        <GlassIconButton
          label="Open upload credits recharge"
          variant={low ? "danger" : "glass"}
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="upload-credit-pill-button"
          className="upload-credit-pill__button"
        >
          <span className="upload-credit-pill__content text-xs font-medium">
            <ArrowUpTray className="h-4 w-4" />
            <span data-testid="upload-credit-pill-credits">{display}</span>
          </span>
        </GlassIconButton>
      </div>
      <RechargeModal
        open={open}
        onClose={handleClose}
        initialSurface="uploads"
      />
    </>
  );
}

export default UploadCreditPill;
