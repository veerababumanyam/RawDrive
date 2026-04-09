"use client";

import { Wallet } from "lucide-react";

export default function DealerPayoutsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Payouts
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Payment history and pending disbursements.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <Wallet className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Payout history and bank transfer details will load here.
        </p>
      </div>
    </div>
  );
}
