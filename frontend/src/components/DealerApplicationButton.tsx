"use client";

import { useState } from "react";
import DealerApplicationModal from "./DealerApplicationModal";

export function DealerApplicationButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary px-6 py-3 text-sm font-semibold"
      >
        Start partner application
      </button>
      <DealerApplicationModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
