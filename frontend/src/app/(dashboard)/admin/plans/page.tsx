"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  approvePricingChangeRequest,
  createPricingChangeRequest,
  getAdminPricingCatalog,
  listPricingChangeRequests,
  publishPricingChangeRequest,
  rejectPricingChangeRequest,
  submitPricingChangeRequest,
  type AdminBillingProduct,
  type AdminPlan,
  type PricingChangeRequest,
} from "@/lib/api/admin";
import { getStoredAccessToken, getStoredPlatformRole } from "@/lib/auth";
import { formatQuotaBytes } from "@/lib/plans";

const GB = 2 ** 30;
const TB = 2 ** 40;

const planBadges: Record<string, string> = {
  free: "STARTER",
  pay_per_event: "EVENT",
  pro_photographer: "MOST POPULAR",
  studio: "BEST VALUE",
};

type EditablePlan = AdminPlan & {
  monthly_price_rupees: string;
  annual_price_rupees: string;
  quota_gb: string;
  features_text: string;
};

type EditableProduct = AdminBillingProduct & {
  price_rupees: string;
  active_days: string;
  upload_window_days: string;
  retention_days: string;
  upload_credits: string;
  extension_days: string;
  quota_gb: string;
  archive_forever: boolean;
};

type CatalogState = {
  plans: AdminPlan[];
  products: AdminBillingProduct[];
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

function productMetadataNumber(
  product: Pick<AdminBillingProduct, "metadata">,
  key: string,
): string {
  const value = product.metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return "";
}

function toEditableProduct(product: AdminBillingProduct): EditableProduct {
  const quotaBytes = Number(product.metadata?.quota_bytes ?? 0);
  return {
    ...product,
    price_rupees: String(Math.round(product.price_paise / 100)),
    active_days: productMetadataNumber(product, "active_days"),
    upload_window_days: productMetadataNumber(product, "upload_window_days"),
    retention_days: productMetadataNumber(product, "retention_days"),
    upload_credits: productMetadataNumber(product, "upload_credits"),
    extension_days: productMetadataNumber(product, "extension_days"),
    quota_gb: quotaBytes > 0 ? String(Math.round(quotaBytes / GB)) : "",
    archive_forever: product.metadata?.archive_forever === true,
  };
}

function flattenProducts(catalog: {
  event_packs: AdminBillingProduct[];
  gallery_extensions: AdminBillingProduct[];
  storage_boosters: AdminBillingProduct[];
}): AdminBillingProduct[] {
  return [
    ...catalog.event_packs,
    ...catalog.gallery_extensions,
    ...catalog.storage_boosters,
  ].sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
}

function setOptionalNumber(
  metadata: Record<string, unknown>,
  key: string,
  value: string,
) {
  if (value.trim() === "") {
    delete metadata[key];
    return;
  }
  const parsed = Number(value);
  metadata[key] = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function toPlanUpdateInput(plan: EditablePlan): Omit<AdminPlan, "tier"> {
  const isStarter = plan.tier === "free";
  const isPayPerEvent = plan.tier === "pay_per_event";
  const monthlyRupees = Number(plan.monthly_price_rupees);
  const annualRupees = Number(plan.annual_price_rupees);
  const quotaGB = Number(plan.quota_gb);
  return {
    name: plan.name.trim(),
    description: plan.description.trim(),
    currency: (plan.currency || "INR").trim().toUpperCase(),
    monthly_price_paise: isStarter
      ? 0
      : Math.max(0, Math.round(monthlyRupees * 100)),
    annual_price_paise: isStarter
      ? 0
      : Math.max(0, Math.round(annualRupees * 100)),
    quota_bytes: Math.max(0, Math.round(quotaGB * GB)),
    gallery_limit: Number(plan.gallery_limit),
    client_limit: Number(plan.client_limit),
    features: plan.features_text
      .split("\n")
      .map((feature) => feature.trim())
      .filter(Boolean),
    popular: plan.popular,
    rank: Number(plan.rank),
    paid: isStarter ? false : plan.paid,
    active: plan.active,
    self_serve: isPayPerEvent ? false : plan.self_serve,
    trial_days: Number(plan.trial_days),
  };
}

function toProductUpdateInput(product: EditableProduct): AdminBillingProduct {
  const metadata: Record<string, unknown> = { ...(product.metadata || {}) };
  setOptionalNumber(metadata, "active_days", product.active_days);
  setOptionalNumber(metadata, "upload_window_days", product.upload_window_days);
  setOptionalNumber(metadata, "retention_days", product.retention_days);
  setOptionalNumber(metadata, "upload_credits", product.upload_credits);
  setOptionalNumber(metadata, "extension_days", product.extension_days);
  if (product.quota_gb.trim() === "") {
    delete metadata.quota_bytes;
  } else {
    const quotaGB = Number(product.quota_gb);
    metadata.quota_bytes = Number.isFinite(quotaGB)
      ? Math.max(0, Math.round(quotaGB * GB))
      : 0;
  }
  if (product.archive_forever) {
    metadata.archive_forever = true;
  } else {
    delete metadata.archive_forever;
  }
  return {
    code: product.code,
    product_type: product.product_type,
    version_id: product.version_id,
    version: product.version,
    name: product.name.trim(),
    description: product.description.trim(),
    currency: (product.currency || "INR").trim().toUpperCase(),
    price_paise: Math.max(0, Math.round(Number(product.price_rupees) * 100)),
    billing_interval: product.billing_interval,
    metadata,
    rank: Number(product.rank),
    active: product.active,
    effective_from: product.effective_from,
  };
}

function planBadge(plan: EditablePlan): string {
  return planBadges[plan.tier] ?? (plan.popular ? "POPULAR" : "");
}

function productTypeLabel(productType: string): string {
  switch (productType) {
    case "event_upload":
      return "Event pack";
    case "gallery_extension":
      return "Gallery extension";
    case "storage_booster":
      return "Storage booster";
    default:
      return productType.replaceAll("_", " ");
  }
}

function billingIntervalLabel(product: EditableProduct): string {
  return product.billing_interval === "monthly" ? "/mo" : "one time";
}

function storageSummary(plan: EditablePlan): string {
  return formatQuotaBytes(Number(plan.quota_gb || 0) * GB);
}

function productQuotaSummary(product: EditableProduct): string {
  if (product.quota_gb.trim() === "") return "";
  const gb = Number(product.quota_gb);
  if (!Number.isFinite(gb) || gb <= 0) return "";
  const bytes = gb * GB;
  return formatQuotaBytes(bytes >= TB ? Math.round(bytes) : bytes);
}

function eventProductValidationError(product: EditableProduct): string {
  if (product.product_type !== "event_upload" || !product.active) return "";
  const quotaGB = Number(product.quota_gb);
  if (!Number.isFinite(quotaGB) || quotaGB <= 0) {
    return "Active event products require a storage quota.";
  }
  const activeDays = Number(product.active_days);
  if (!Number.isFinite(activeDays) || activeDays <= 0 || activeDays > 30) {
    return "Active event products require active days between 1 and 30.";
  }
  const uploadWindowDays = Number(product.upload_window_days);
  if (
    !Number.isFinite(uploadWindowDays) ||
    uploadWindowDays <= 0 ||
    uploadWindowDays > activeDays
  ) {
    return "Upload window must be between 1 and active days.";
  }
  const retentionDays = Number(product.retention_days);
  if (retentionDays !== 30) {
    return "Pay Per Event retention must be exactly 30 days.";
  }
  return "";
}

function NumberField({
  label,
  value,
  min = "0",
  required,
  disabled,
  onChange,
}: {
  label: string;
  value: string | number;
  min?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-text-tertiary">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<EditablePlan[]>([]);
  const [products, setProducts] = useState<EditableProduct[]>([]);
  const [original, setOriginal] = useState<CatalogState>({
    plans: [],
    products: [],
  });
  const [changes, setChanges] = useState<PricingChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [transitioningChange, setTransitioningChange] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canManage] = useState(() => getStoredPlatformRole() === "super_admin");

  useEffect(() => {
    let active = true;
    const token = getStoredAccessToken() || "";
    getAdminPricingCatalog(token)
      .then((catalog) => {
        if (!active) return;
        const catalogProducts = flattenProducts(catalog);
        setOriginal({ plans: catalog.plans, products: catalogProducts });
        setPlans(catalog.plans.map(toEditablePlan));
        setProducts(catalogProducts.map(toEditableProduct));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load pricing catalog",
        );
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
  const activeProductCount = useMemo(
    () => products.filter((product) => product.active).length,
    [products],
  );

  function patchPlan(tier: string, patch: Partial<EditablePlan>) {
    setPlans((current) =>
      current.map((plan) =>
        plan.tier === tier ? { ...plan, ...patch } : plan,
      ),
    );
  }

  function patchProduct(code: string, patch: Partial<EditableProduct>) {
    setProducts((current) =>
      current.map((product) =>
        product.code === code ? { ...product, ...patch } : product,
      ),
    );
  }

  async function handleSavePlan(event: FormEvent, plan: EditablePlan) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setSavingKey(`plan:${plan.tier}`);
    try {
      const token = getStoredAccessToken() || "";
      const afterState = { tier: plan.tier, ...toPlanUpdateInput(plan) };
      const beforeState = original.plans.find(
        (item) => item.tier === plan.tier,
      ) ?? {
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
          invariant_guard:
            plan.tier === "free"
              ? "starter_must_remain_free"
              : plan.tier === "pay_per_event"
                ? "pay_per_event_not_subscription_upgrade"
                : null,
        },
        email_preview: {
          notice_required: plan.paid,
          delivery_channel: plan.paid ? "email" : "none",
        },
      });
      const submitted = await submitPricingChangeRequest(token, created.id);
      setChanges((current) => [submitted, ...current]);
      setMessage(
        `${plan.name || plan.tier} catalog change submitted for approval.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit plan change",
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function handleSaveProduct(event: FormEvent, product: EditableProduct) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const validationError = eventProductValidationError(product);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSavingKey(`product:${product.code}`);
    try {
      const token = getStoredAccessToken() || "";
      const afterState = toProductUpdateInput(product);
      const beforeState = original.products.find(
        (item) => item.code === product.code,
      ) ?? {
        code: product.code,
      };
      const created = await createPricingChangeRequest(token, {
        request_type: "product_update",
        target_type: "billing_product",
        target_key: product.code,
        before_state: beforeState as unknown as Record<string, unknown>,
        after_state: afterState as unknown as Record<string, unknown>,
        impact_summary: {
          product_type: product.product_type,
          previous_price_paise:
            "price_paise" in beforeState ? beforeState.price_paise : null,
          next_price_paise: afterState.price_paise,
          metadata: afterState.metadata,
          rank: afterState.rank,
          active: afterState.active,
        },
        email_preview: {
          notice_required: false,
          delivery_channel: "none",
        },
      });
      const submitted = await submitPricingChangeRequest(token, created.id);
      setChanges((current) => [submitted, ...current]);
      setMessage(
        `${product.name || product.code} change submitted for approval.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit product change",
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function reloadCatalogAndChanges() {
    const token = getStoredAccessToken() || "";
    const [nextCatalog, nextChanges] = await Promise.all([
      getAdminPricingCatalog(token),
      listPricingChangeRequests(token),
    ]);
    const catalogProducts = flattenProducts(nextCatalog);
    setOriginal({ plans: nextCatalog.plans, products: catalogProducts });
    setPlans(nextCatalog.plans.map(toEditablePlan));
    setProducts(catalogProducts.map(toEditableProduct));
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
      await reloadCatalogAndChanges();
      setMessage("Pricing change published to the approved catalog.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setTransitioningChange(null);
    }
  }

  const visibleChanges = changes
    .filter((change) =>
      ["subscription_plan", "billing_product"].includes(change.target_type),
    )
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-text-tertiary">
            Super admin
          </p>
          <h1 className="font-headline text-3xl font-extrabold text-text-primary">
            Pricing Catalog
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Manage Starter, Pay Per Event, paid subscriptions, event packs,
            gallery extensions, and storage boosters. Every edit is submitted
            through approval before public pricing, signup, onboarding,
            checkout, and payment snapshots can read it.
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-border-subtle bg-surface-container-low px-4 py-3 text-sm text-text-secondary sm:min-w-44">
          <span>
            <strong className="text-text-primary">{activePlanCount}</strong>{" "}
            active plans
          </span>
          <span>
            <strong className="text-text-primary">{activeProductCount}</strong>{" "}
            active products
          </span>
        </div>
      </header>

      {!canManage && (
        <div className="rounded-xl border border-feedback-warning/30 bg-feedback-warning/10 px-4 py-3 text-sm text-feedback-warning">
          Only super admins can submit catalog changes.
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
          Loading pricing catalog...
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                Subscription And Access Plans
              </h2>
              <p className="text-sm text-text-secondary">
                Starter is always free. Pay Per Event remains a catalog access
                option and cannot become a subscription upgrade target.
              </p>
            </div>
            <div className="grid gap-5">
              {plans.length === 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-sm text-text-secondary">
                  No manageable plans are available.
                </div>
              )}
              {plans.map((plan) => {
                const saving = savingKey === `plan:${plan.tier}`;
                const badge = planBadge(plan);
                const isStarter = plan.tier === "free";
                const isPayPerEvent = plan.tier === "pay_per_event";
                return (
                  <form
                    key={plan.tier}
                    onSubmit={(event) => handleSavePlan(event, plan)}
                    className="rounded-2xl border border-border-subtle bg-surface-container-low p-5"
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-bold text-text-primary">
                            {plan.name || plan.tier}
                          </h3>
                          <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-text-tertiary">
                            {plan.tier}
                          </span>
                          {badge && (
                            <span className="rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold text-accent">
                              {badge}
                            </span>
                          )}
                          {!plan.active && (
                            <span className="rounded-full bg-feedback-warning/10 px-3 py-1 text-xs font-semibold text-feedback-warning">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-text-secondary">
                          Rs.{" "}
                          {Number(
                            plan.monthly_price_rupees || 0,
                          ).toLocaleString("en-IN")}
                          /mo · Rs.{" "}
                          {Number(plan.annual_price_rupees || 0).toLocaleString(
                            "en-IN",
                          )}
                          /yr · {storageSummary(plan)}
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={saving || !canManage}
                        className="touch-min rounded-full bg-accent px-5 py-2 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {saving ? "Submitting..." : "Submit plan change"}
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
                      <NumberField
                        label="Monthly Rs."
                        value={plan.monthly_price_rupees}
                        disabled={isStarter}
                        onChange={(value) =>
                          patchPlan(plan.tier, {
                            monthly_price_rupees: value,
                          })
                        }
                      />
                      <NumberField
                        label="Annual Rs."
                        value={plan.annual_price_rupees}
                        disabled={isStarter}
                        onChange={(value) =>
                          patchPlan(plan.tier, {
                            annual_price_rupees: value,
                          })
                        }
                      />
                      <NumberField
                        label="Storage GB"
                        value={plan.quota_gb}
                        onChange={(value) =>
                          patchPlan(plan.tier, { quota_gb: value })
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <NumberField
                        label="Galleries"
                        value={plan.gallery_limit}
                        min="-1"
                        onChange={(value) =>
                          patchPlan(plan.tier, {
                            gallery_limit: Number(value),
                          })
                        }
                      />
                      <NumberField
                        label="Clients"
                        value={plan.client_limit}
                        min="-1"
                        onChange={(value) =>
                          patchPlan(plan.tier, {
                            client_limit: Number(value),
                          })
                        }
                      />
                      <NumberField
                        label="Display order"
                        value={plan.rank}
                        onChange={(value) =>
                          patchPlan(plan.tier, { rank: Number(value) })
                        }
                      />
                      <NumberField
                        label="Trial days"
                        value={plan.trial_days}
                        onChange={(value) =>
                          patchPlan(plan.tier, {
                            trial_days: Number(value),
                          })
                        }
                      />
                    </div>

                    <label className="mt-4 block space-y-1">
                      <span className="text-xs font-semibold text-text-tertiary">
                        Description
                      </span>
                      <input
                        value={plan.description}
                        onChange={(event) =>
                          patchPlan(plan.tier, {
                            description: event.target.value,
                          })
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
                          patchPlan(plan.tier, {
                            features_text: event.target.value,
                          })
                        }
                        rows={5}
                        className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-3 text-sm text-text-primary"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap gap-4">
                      <label className="flex touch-min items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={plan.active}
                          onChange={(event) =>
                            patchPlan(plan.tier, {
                              active: event.target.checked,
                            })
                          }
                        />
                        Show publicly
                      </label>
                      <label className="flex touch-min items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={plan.self_serve}
                          disabled={isPayPerEvent}
                          onChange={(event) =>
                            patchPlan(plan.tier, {
                              self_serve: event.target.checked,
                            })
                          }
                        />
                        Self-serve signup
                      </label>
                      <label className="flex touch-min items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={plan.paid}
                          disabled={isStarter}
                          onChange={(event) =>
                            patchPlan(plan.tier, { paid: event.target.checked })
                          }
                        />
                        Paid tier
                      </label>
                      <label className="flex touch-min items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={plan.popular}
                          onChange={(event) =>
                            patchPlan(plan.tier, {
                              popular: event.target.checked,
                            })
                          }
                        />
                        Popular badge
                      </label>
                    </div>
                  </form>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                Billing Products
              </h2>
              <p className="text-sm text-text-secondary">
                Product codes and types are immutable. Price, lifecycle
                metadata, active state, and rank are governed through approval.
              </p>
            </div>
            <div className="grid gap-5">
              {products.length === 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-container-low p-8 text-center text-sm text-text-secondary">
                  No billing products are available.
                </div>
              )}
              {products.map((product) => {
                const saving = savingKey === `product:${product.code}`;
                const quota = productQuotaSummary(product);
                const validationError = eventProductValidationError(product);
                return (
                  <form
                    key={product.code}
                    onSubmit={(event) => handleSaveProduct(event, product)}
                    className="rounded-2xl border border-border-subtle bg-surface-container-low p-5"
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-bold text-text-primary">
                            {product.name || product.code}
                          </h3>
                          <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-text-tertiary">
                            {product.code}
                          </span>
                          <span className="rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold text-accent">
                            {productTypeLabel(product.product_type)}
                          </span>
                          {!product.active && (
                            <span className="rounded-full bg-feedback-warning/10 px-3 py-1 text-xs font-semibold text-feedback-warning">
                              Hidden
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-text-secondary">
                          Rs.{" "}
                          {Number(product.price_rupees || 0).toLocaleString(
                            "en-IN",
                          )}{" "}
                          {billingIntervalLabel(product)}
                          {quota ? ` · ${quota}` : ""}
                        </p>
                        {product.product_type === "event_upload" && (
                          <p className="mt-2 text-xs font-semibold text-feedback-warning">
                            Storage quota is required for active public Pay Per
                            Event products.
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={saving || !canManage}
                        className="touch-min rounded-full bg-accent px-5 py-2 text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {saving ? "Submitting..." : "Submit product change"}
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-text-tertiary">
                          Name
                        </span>
                        <input
                          value={product.name}
                          onChange={(event) =>
                            patchProduct(product.code, {
                              name: event.target.value,
                            })
                          }
                          className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-text-tertiary">
                          Product type
                        </span>
                        <input
                          value={product.product_type}
                          readOnly
                          className="touch-min w-full rounded-xl border border-border-subtle bg-surface-container-high px-3 text-sm text-text-secondary"
                        />
                      </label>
                      <NumberField
                        label="Price Rs."
                        value={product.price_rupees}
                        onChange={(value) =>
                          patchProduct(product.code, { price_rupees: value })
                        }
                      />
                      <NumberField
                        label="Display order"
                        value={product.rank}
                        onChange={(value) =>
                          patchProduct(product.code, { rank: Number(value) })
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <NumberField
                        label="Active days"
                        value={product.active_days}
                        required={product.product_type === "event_upload"}
                        onChange={(value) =>
                          patchProduct(product.code, { active_days: value })
                        }
                      />
                      <NumberField
                        label="Upload window days"
                        value={product.upload_window_days}
                        required={product.product_type === "event_upload"}
                        onChange={(value) =>
                          patchProduct(product.code, {
                            upload_window_days: value,
                          })
                        }
                      />
                      <NumberField
                        label={
                          product.product_type === "event_upload"
                            ? "Retention days (30 required)"
                            : "Retention days"
                        }
                        value={product.retention_days}
                        required={product.product_type === "event_upload"}
                        onChange={(value) =>
                          patchProduct(product.code, { retention_days: value })
                        }
                      />
                      <NumberField
                        label="Upload credits"
                        value={product.upload_credits}
                        onChange={(value) =>
                          patchProduct(product.code, { upload_credits: value })
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <NumberField
                        label="Extension days"
                        value={product.extension_days}
                        onChange={(value) =>
                          patchProduct(product.code, { extension_days: value })
                        }
                      />
                      <NumberField
                        label={
                          product.product_type === "event_upload"
                            ? "Event storage quota GB"
                            : "Quota GB"
                        }
                        value={product.quota_gb}
                        required={product.product_type === "event_upload"}
                        onChange={(value) =>
                          patchProduct(product.code, { quota_gb: value })
                        }
                      />
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs font-semibold text-text-tertiary">
                          Billing interval
                        </span>
                        <select
                          value={product.billing_interval}
                          onChange={(event) =>
                            patchProduct(product.code, {
                              billing_interval: event.target.value,
                            })
                          }
                          className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                        >
                          <option value="one_time">One time</option>
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annual</option>
                        </select>
                      </label>
                    </div>

                    <label className="mt-4 block space-y-1">
                      <span className="text-xs font-semibold text-text-tertiary">
                        Description
                      </span>
                      <input
                        value={product.description}
                        onChange={(event) =>
                          patchProduct(product.code, {
                            description: event.target.value,
                          })
                        }
                        className="touch-min w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap gap-4">
                      <label className="flex touch-min items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={product.active}
                          onChange={(event) =>
                            patchProduct(product.code, {
                              active: event.target.checked,
                            })
                          }
                        />
                        Active and public
                      </label>
                      <label className="flex touch-min items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={product.archive_forever}
                          onChange={(event) =>
                            patchProduct(product.code, {
                              archive_forever: event.target.checked,
                            })
                          }
                        />
                        Archive forever
                      </label>
                    </div>
                    {validationError && (
                      <p className="mt-3 text-sm font-semibold text-feedback-warning">
                        {validationError}
                      </p>
                    )}
                  </form>
                );
              })}
            </div>
          </section>
        </>
      )}

      <section className="rounded-2xl border border-border-subtle bg-surface-container-low p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              Pricing Approval Timeline
            </h2>
            <p className="text-sm text-text-secondary">
              Plan and billing product drafts, approvals, rejections, and
              publishes are recorded before catalog changes go live.
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
              No catalog changes have been submitted yet.
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
                        {change.request_type} · {change.target_type} ·{" "}
                        {change.target_key}
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
