"use client";

import { Ticket } from "lucide-react";

export default function DealerCouponsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Coupons
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Discount codes you can distribute to photographers.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <Ticket className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Coupon management and distribution tracking will load here.
        </p>
      </div>
    </div>
  );
}
