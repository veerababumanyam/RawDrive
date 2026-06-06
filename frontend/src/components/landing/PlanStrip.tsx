"use client";

import Link from "next/link";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";

export function PlanStrip() {
  const { plans } = usePlanCatalog();
  const paidPlans = plans
    .filter((plan) => plan.id !== "free" && plan.active && plan.paid)
    .slice(0, 3);

  if (paidPlans.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-text-tertiary">
            Plans
          </p>
          <h2 className="font-headline text-3xl font-bold text-text-primary">
            Start small, scale studio-wide.
          </h2>
        </div>
        <Link
          href="/pricing"
          className="touch-min inline-flex items-center rounded-full border border-border-subtle px-5 text-sm font-semibold text-text-primary hover:bg-surface-container-high"
        >
          Compare all plans
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {paidPlans.map((plan) => (
          <Link
            key={plan.id}
            href={`/register?plan=${encodeURIComponent(plan.id)}`}
            className="rounded-2xl border border-border-subtle bg-surface-container-low p-5 transition-colors hover:bg-surface-container-high"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-text-primary">
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {plan.storage} managed storage
                </p>
              </div>
              {plan.popular && (
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                  Popular
                </span>
              )}
            </div>
            <p className="mt-5 font-headline text-3xl font-extrabold text-text-primary">
              ₹{plan.monthlyPrice.toLocaleString("en-IN")}
              <span className="text-sm font-semibold text-text-tertiary">
                /mo
              </span>
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
