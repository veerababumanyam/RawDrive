"use client";

import { CheckCircle2 } from "lucide-react";

export default function ProofingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Proofing
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Review and approve photos from your photographer.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Photos awaiting your review will appear here.
        </p>
      </div>
    </div>
  );
}
