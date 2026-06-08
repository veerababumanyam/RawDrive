"use client";

import Link from "next/link";
import { usePlanCatalog } from "@/hooks/use-plan-catalog";
import type { PlanCatalogPlan } from "@/lib/plans";

const planSummaries: Record<string, string> = {
  free: "A free starter gallery for beginners.",
  creator: "Side & weekend photographers getting started.",
  pro_photographer: "The main money plan for working pros.",
  studio: "Studios with a team and a brand to protect.",
  elite_studio: "High-end & multi-branch studios.",
};

function planBadge(plan: PlanCatalogPlan): string {
  if (plan.popular) return "Best Value";
  if (plan.id === "free") return "Free";
  if (!plan.selfServe) return "Sales";
  return "";
}

function planHref(plan: PlanCatalogPlan): string {
  if (!plan.selfServe) return "/contact";
  return `/register?plan=${encodeURIComponent(plan.id)}`;
}

export function PlanStrip() {
  const { plans } = usePlanCatalog();
  const tierPlans = plans
    .filter(
      (plan) =>
        plan.id !== "pay_per_event" &&
        plan.active &&
        [
          "free",
          "creator",
          "pro_photographer",
          "studio",
          "elite_studio",
        ].includes(plan.id),
    )
    .sort((a, b) => a.rank - b.rank);

  if (tierPlans.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-text-tertiary">
            Plans
          </p>
          <h2 className="font-headline text-3xl font-bold text-text-primary">
            Start free, scale studio-wide.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Five tiers for photographers: Starter, Creator, Pro Photographer,
            Studio, and Elite Studio.
          </p>
        </div>
        <Link
          href="/pricing"
          className="touch-min inline-flex items-center rounded-full border border-border-subtle px-5 text-sm font-semibold text-text-primary hover:bg-surface-container-high"
        >
          Compare all plans
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tierPlans.map((plan) => {
          const badge = planBadge(plan);
          const summary =
            plan.description ||
            planSummaries[plan.id] ||
            `${plan.storage} plan for RawDrive delivery.`;
          const price =
            plan.monthlyPrice === 0
              ? "Free"
              : `₹${plan.monthlyPrice.toLocaleString("en-IN")}`;

          return (
            <Link
              key={plan.id}
              href={planHref(plan)}
              data-plan={plan.id}
              className={`flex min-h-full flex-col rounded-2xl border p-5 transition-colors hover:bg-surface-container-high ${
                plan.popular
                  ? "border-accent bg-accent-subtle"
                  : "border-border-subtle bg-surface-container-low"
              }`}
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
                {badge && (
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                    {badge}
                  </span>
                )}
              </div>
              <p className="mt-4 flex-1 text-sm leading-6 text-text-secondary">
                {summary}
              </p>
              <p className="mt-5 font-headline text-2xl font-extrabold text-text-primary">
                {price}
                {plan.monthlyPrice > 0 && (
                  <span className="text-sm font-semibold text-text-tertiary">
                    /mo
                  </span>
                )}
              </p>
              <ul className="mt-4 space-y-2">
                {plan.features.slice(0, 3).map((feature) => (
                  <li
                    key={feature}
                    className="text-xs leading-5 text-text-secondary"
                  >
                    {feature}
                  </li>
                ))}
              </ul>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
