"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  approvePricingChangeRequest,
  createPricingChangeRequest,
  listAdminPlans,
  listPricingChangeRequests,
  publishPricingChangeRequest,
  rejectPricingChangeRequest,
  submitPricingChangeRequest,
  type AdminPlan,
  type PricingChangeRequest,
} from "@/lib/api/admin";
import { getStoredAccessToken, getStoredPlatformRole } from "@/lib/auth";
import { formatQuotaBytes } from "@/lib/plans";

const GB = 2 ** 30;

type EditablePlan = AdminPlan & {
  monthly_price_rupees: string;
  annual_price_rupees: string;
  quota_gb: string;
  features_text: string;
};

function toEditablePlan(plan: AdminPlan): EditablePlan {
  return {
    ...plan,
    monthly_price_rupees: String(Math.round(plan.monthly_price_paise / 100)),
    annual_price_rupees: String(Math.round(plan.annual_price_paise / 100)),
    quota_gb: String(Math.round(plan.quota_bytes / GB)),
    features_text: (plan.features || []).join("\n"),
  };
}

function toUpdateInput(plan: EditablePlan): Omit<AdminPlan, "tier"> {
  const monthlyRupees = Number(plan.monthly_price_rupees);
  const annualRupees = Number(plan.annual_price_rupees);
  const quotaGB = Number(plan.quota_gb);
  return {
    name: plan.name.trim(),
    description: plan.description.trim(),
    currency: (plan.currency || "INR").trim().toUpperCase(),
    monthly_price_paise: Math.max(0, Math.round(monthlyRupees * 100)),
    annual_price_paise: Math.max(0, Math.round(annualRupees * 100)),
    quota_bytes: Math.max(0, Math.round(quotaGB * GB)),
    gallery_limit: Number(plan.gallery_limit),
    client_limit: Number(plan.client_limit),
    features: plan.features_text
      .split("\n")
      .map((feature) => feature.trim())
      .filter(Boolean),
    popular: plan.popular,
    rank: Number(plan.rank),
    paid: plan.paid,
    active: plan.active,
    self_serve: plan.self_serve,
    trial_days: Number(plan.trial_days),
  };
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<EditablePlan[]>([]);
  const [originalPlans, setOriginalPlans] = useState<AdminPlan[]>([]);
  const [changes, setChanges] = useState<PricingChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTier, setSavingTier] = useState<string | null>(null);
  const [transitioningChange, setTransitioningChange] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canManage] = useState(
    () => getStoredPlatformRole() === "super_admin",
  );

  useEffect(() => {
    let active = true;
    const token = getStoredAccessToken() || "";
    listAdminPlans(token)
      .then((data) => {
        if (!active) return;
        setOriginalPlans(data);
        setPlans(data.map(toEditablePlan));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load plans");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    listPricingChangeRequests(token)
      .then((data) => {
        if (active) setChanges(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const activePlanCount = useMemo(
    () => plans.filter((plan) => plan.active).length,
    [plans],
  );

  function patchPlan(tier: string, patch: Partial<EditablePlan>) {
    setPlans((current) =>
      current.map((plan) =>
        plan.tier === tier ? { ...plan, ...patch } : plan,
      ),
    );
  }

  async function handleSave(event: FormEvent, plan: EditablePlan) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSavingTier(plan.tier);
    try {
      const token = getStoredAccessToken() || "";
      const afterState = { tier: plan.tier, ...toUpdateInput(plan) };
      const beforeState =
        originalPlans.find((item) => item.tier === plan.tier) ?? {
          tier: plan.tier,
        };
      const created = await createPricingChangeRequest(token, {
        request_type: "plan_update",
        target_type: "subscription_plan",
        target_key: plan.tier,
        before_state: beforeState as unknown as Record<string, unknown>,
        after_state: afterState,
        impact_summary: {
          previous_monthly_price_paise:
            "monthly_price_paise" in beforeState
              ? beforeState.monthly_price_paise
              : null,
          next_monthly_price_paise: afterState.monthly_price_paise,
          quota_bytes: afterState.quota_bytes,
          rank: afterState.rank,
        },
        email_preview: {
          notice_required: true,
          delivery_channel: "email",
        },
      });
      const submitted = await submitPricingChangeRequest(token, created.id);
      setChanges((current) => [submitted, ...current]);
      setMessage(
        `${plan.name || plan.tier} pricing change submitted for approval.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit plan change",
      );
    } finally {
      setSavingTier(null);
    }
  }

  async function reloadPlansAndChanges() {
    const token = getStoredAccessToken() || "";
    const [nextPlans, nextChanges] = await Promise.all([
      listAdminPlans(token),
      listPricingChangeRequests(token),
    ]);
    setOriginalPlans(nextPlans);
    setPlans(nextPlans.map(toEditablePlan));
    setChanges(nextChanges);
  }

  async function handleApprove(change: PricingChangeRequest) {
    const comment = window.prompt("Approval comment");
    if (!comment?.trim()) return;
    setTransitioningChange(change.id);
    setError(null);
    try {
      const token = getStoredAccessToken() || "";
      const updated = await approvePricingChangeRequest(
        token,
        change.id,
        comment.trim(),
      );
      setChanges((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage("Pricing change approved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setTransitioningChange(null);
    }
  }

  async function handleReject(change: PricingChangeRequest) {
    const reason = window.prompt("Rejection reason");
    if (!reason?.trim()) return;
    setTransitioningChange(change.id);
    setError(null);
    try {
      const token = getStoredAccessToken() || "";
      const updated = await rejectPricingChangeRequest(
        token,
        change.id,
        reason.trim(),
      );
      setChanges((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage("Pricing change rejected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setTransitioningChange(null);
    }
  }

  async function handlePublish(change: PricingChangeRequest) {
    setTransitioningChange(change.id);
    setError(null);
    try {
      const token = getStoredAccessToken() || "";
      await publishPricingChangeRequest(token, change.id);
      await reloadPlansAndChanges();
      setMessage("Pricing change published to public catalog.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setTransitioningChange(null);
    }
  }

  const visibleChanges = changes.slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-text-tertiary">
            Super admin
          </p>
          <h1 className="font-headline text-3xl font-extrabold text-text-primary">
            Tier Plans
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Manage subscription pricing, limits, public visibility, and feature
            bullets. Public pricing, signup, onboarding, and upgrade screens
            read this catalog.
          </p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-container-low px-4 py-3 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">
            {activePlanCount}
          </span>{" "}
          active plans
        </div>
      </header>

      {!canManage && (
        <div className="rounded-xl border border-feedback-warning/30 bg-feedback-warning/10 px-4 py-3 text-sm text-feedback-warning">
          Only super admins can save plan changes.
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-feedback-success/30 bg-feedback-success/10 px-4 py-3 text-sm text-feedback-success">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-sm text-text-secondary">
          Loading plans…
        </div>
      ) : (
        <div className="grid gap-5">
          {plans.map((plan) => {
            const saving = savingTier === plan.tier;
            return (
              <form
                key={plan.tier}
                onSubmit={(event) => handleSave(event, plan)}
                className="rounded-2xl border border-border-subtle bg-surface-container-low p-5"
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-bold text-text-primary">
                        {plan.name || plan.tier}
                      </h2>
                      <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-text-tertiary">
                        {plan.tier}
                      </span>
                      {plan.popular && (
                        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                          Popular
                        </span>
                      )}
                      {!plan.active && (
                        <span className="rounded-full bg-feedback-warning/10 px-3 py-1 text-xs font-semibold text-feedback-warning">
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">
                      ₹
                      {Number(plan.monthly_price_rupees || 0).toLocaleString(
                        "en-IN",
                      )}
                      /mo · ₹
                      {Number(plan.annual_price_rupees || 0).toLocaleString(
                        "en-IN",
                      )}
                      /yr · {formatQuotaBytes(Number(plan.quota_gb || 0) * GB)}
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={saving || !canManage}
                    className="touch-min rounded-full bg-accent px-5 py-2 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Submitting..." : "Submit change"}
                  </button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Name
                    </span>
                    <input
                      value={plan.name}
                      onChange={(event) =>
                        patchPlan(plan.tier, { name: event.target.value })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Monthly ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={plan.monthly_price_rupees}
                      onChange={(event) =>
                        patchPlan(plan.tier, {
                          monthly_price_rupees: event.target.value,
                        })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Annual ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={plan.annual_price_rupees}
                      onChange={(event) =>
                        patchPlan(plan.tier, {
                          annual_price_rupees: event.target.value,
                        })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Storage GB
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={plan.quota_gb}
                      onChange={(event) =>
                        patchPlan(plan.tier, { quota_gb: event.target.value })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Galleries
                    </span>
                    <input
                      type="number"
                      min="-1"
                      value={plan.gallery_limit}
                      onChange={(event) =>
                        patchPlan(plan.tier, {
                          gallery_limit: Number(event.target.value),
                        })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Clients
                    </span>
                    <input
                      type="number"
                      min="-1"
                      value={plan.client_limit}
                      onChange={(event) =>
                        patchPlan(plan.tier, {
                          client_limit: Number(event.target.value),
                        })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Display order
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={plan.rank}
                      onChange={(event) =>
                        patchPlan(plan.tier, { rank: Number(event.target.value) })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-text-tertiary">
                      Trial days
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={plan.trial_days}
                      onChange={(event) =>
                        patchPlan(plan.tier, {
                          trial_days: Number(event.target.value),
                        })
                      }
                      className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                    />
                  </label>
                </div>

                <label className="mt-4 block space-y-1">
                  <span className="text-xs font-semibold text-text-tertiary">
                    Description
                  </span>
                  <input
                    value={plan.description}
                    onChange={(event) =>
                      patchPlan(plan.tier, { description: event.target.value })
                    }
                    className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                  />
                </label>

                <label className="mt-4 block space-y-1">
                  <span className="text-xs font-semibold text-text-tertiary">
                    Features
                  </span>
                  <textarea
                    value={plan.features_text}
                    onChange={(event) =>
                      patchPlan(plan.tier, { features_text: event.target.value })
                    }
                    rows={5}
                    className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-3 text-sm text-text-primary"
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-4">
                  {[
                    ["active", "Show publicly"],
                    ["self_serve", "Self-serve signup"],
                    ["paid", "Paid tier"],
                    ["popular", "Popular badge"],
                  ].map(([key, label]) => (
                    <label
                      key={key}
                      className="flex touch-min items-center gap-2 text-sm text-text-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(plan[key as keyof EditablePlan])}
                        onChange={(event) =>
                          patchPlan(plan.tier, {
                            [key]: event.target.checked,
                          } as Partial<EditablePlan>)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </form>
            );
          })}
        </div>
      )}

      <section className="rounded-2xl border border-border-subtle bg-surface-container-low p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              Pricing Approval Timeline
            </h2>
            <p className="text-sm text-text-secondary">
              Drafts, approvals, rejections, and publishes are recorded before
              public pricing changes.
            </p>
          </div>
          <a
            href="/pricing"
            target="_blank"
            className="touch-min rounded-full border border-border-subtle px-4 py-2 text-sm font-semibold text-text-primary"
          >
            Preview public pricing
          </a>
        </div>

        <div className="mt-4 grid gap-3">
          {visibleChanges.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No pricing changes have been submitted yet.
            </p>
          ) : (
            visibleChanges.map((change) => {
              const busy = transitioningChange === change.id;
              return (
                <div
                  key={change.id}
                  className="rounded-xl border border-border-subtle bg-surface px-4 py-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {change.request_type} · {change.target_key}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {change.status}
                        {change.approval_comment
                          ? ` · ${change.approval_comment}`
                          : ""}
                        {change.rejection_reason
                          ? ` · ${change.rejection_reason}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {change.status === "pending_approval" && canManage && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(change)}
                            className="touch-min rounded-full bg-feedback-success px-4 py-2 text-xs font-semibold text-text-inverse disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReject(change)}
                            className="touch-min rounded-full bg-feedback-error px-4 py-2 text-xs font-semibold text-text-inverse disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {(change.status === "approved" ||
                        change.status === "scheduled") &&
                        canManage && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handlePublish(change)}
                            className="touch-min rounded-full bg-accent px-4 py-2 text-xs font-semibold text-text-inverse disabled:opacity-60"
                          >
                            Publish
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
