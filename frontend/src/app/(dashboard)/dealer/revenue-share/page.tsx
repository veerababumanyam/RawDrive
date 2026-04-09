"use client";

import { PieChart } from "lucide-react";

export default function DealerRevenueSharePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Revenue Share
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your commission tracking and earnings breakdown.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <PieChart className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Revenue share analytics and commission reports will load here.
        </p>
      </div>
    </div>
  );
}
