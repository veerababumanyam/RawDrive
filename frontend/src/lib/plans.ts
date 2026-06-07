import { pricingPlans } from "@/lib/tokens";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface ApiPlan {
  tier?: string;
  Tier?: string;
  name?: string;
  Name?: string;
  description?: string;
  Description?: string;
  currency?: string;
  Currency?: string;
  monthly_price_paise?: number;
  MonthlyPricePaise?: number;
  annual_price_paise?: number;
  AnnualPricePaise?: number;
  quota_bytes?: number;
  QuotaBytes?: number;
  gallery_limit?: number;
  GalleryLimit?: number;
  client_limit?: number;
  ClientLimit?: number;
  features?: string[];
  Features?: string[];
  popular?: boolean;
  Popular?: boolean;
  rank?: number;
  Rank?: number;
  paid?: boolean;
  Paid?: boolean;
  active?: boolean;
  Active?: boolean;
  self_serve?: boolean;
  SelfServe?: boolean;
  trial_days?: number;
  TrialDays?: number;
}

export interface PlansResponse {
  plans?: ApiPlan[];
}

export interface PricingCatalogProduct {
  code: string;
  product_type: string;
  version_id: string;
  version: number;
  name: string;
  description: string;
  currency: string;
  price_paise: number;
  billing_interval: string;
  metadata?: Record<string, unknown>;
  rank: number;
  active: boolean;
  effective_from: string;
}

export interface PricingCatalogResponse extends PlansResponse {
  generated_at?: string;
  event_packs?: PricingCatalogProduct[];
  gallery_extensions?: PricingCatalogProduct[];
  storage_boosters?: PricingCatalogProduct[];
}

export interface PricingCatalogData {
  plans: PlanCatalogPlan[];
  eventPacks: PricingCatalogProduct[];
  galleryExtensions: PricingCatalogProduct[];
  storageBoosters: PricingCatalogProduct[];
}

export interface PlanCatalogPlan {
  id: string;
  tier: string;
  name: string;
  description: string;
  currency: string;
  monthlyPricePaise: number;
  annualPricePaise: number;
  monthlyPrice: number;
  annualPrice: number;
  quotaBytes: number;
  storage: string;
  galleries: number;
  clients: number;
  features: string[];
  popular: boolean;
  rank: number;
  paid: boolean;
  active: boolean;
  selfServe: boolean;
  trialDays: number;
}

export const fallbackPlanCatalog: PlanCatalogPlan[] = pricingPlans.map(
  (plan, index) => {
    const quotaBytes = storageLabelToBytes(plan.storage);
    return {
      id: plan.id,
      tier: plan.id,
      name: plan.name,
      description: "",
      currency: "INR",
      monthlyPricePaise: Number(plan.monthlyPrice) * 100,
      annualPricePaise: Number(plan.annualPrice) * 100,
      monthlyPrice: Number(plan.monthlyPrice),
      annualPrice: Number(plan.annualPrice),
      quotaBytes,
      storage: plan.storage,
      galleries: Number(plan.galleries),
      clients: Number(plan.clients),
      features: [...plan.features],
      popular: Boolean(plan.popular),
      rank: index,
      paid: plan.id !== "free",
      active: true,
      selfServe: "selfServe" in plan ? Boolean(plan.selfServe) : true,
      trialDays: plan.id === "free" ? Number(plan.trialDays) : 0,
    };
  },
);

export function normalizeApiPlan(plan: ApiPlan): PlanCatalogPlan {
  const tier = String(plan.tier ?? plan.Tier ?? "")
    .trim()
    .toLowerCase();
  const monthlyPricePaise =
    Number(plan.monthly_price_paise ?? plan.MonthlyPricePaise) || 0;
  const annualPricePaise =
    Number(plan.annual_price_paise ?? plan.AnnualPricePaise) || 0;
  const quotaBytes = Number(plan.quota_bytes ?? plan.QuotaBytes) || 0;
  const features = plan.features ?? plan.Features;
  return {
    id: tier,
    tier,
    name: String(plan.name ?? plan.Name ?? tier),
    description: String(plan.description ?? plan.Description ?? ""),
    currency: String(plan.currency ?? plan.Currency ?? "INR"),
    monthlyPricePaise,
    annualPricePaise,
    monthlyPrice: Math.round(monthlyPricePaise / 100),
    annualPrice: Math.round(annualPricePaise / 100),
    quotaBytes,
    storage: formatQuotaBytes(quotaBytes),
    galleries: Number(plan.gallery_limit ?? plan.GalleryLimit ?? 0),
    clients: Number(plan.client_limit ?? plan.ClientLimit ?? 0),
    features: Array.isArray(features)
      ? features.filter((feature) => feature.trim().length > 0)
      : [],
    popular: Boolean(plan.popular ?? plan.Popular),
    rank: Number(plan.rank ?? plan.Rank ?? 0),
    paid: Boolean(plan.paid ?? plan.Paid),
    active: (plan.active ?? plan.Active) !== false,
    selfServe: (plan.self_serve ?? plan.SelfServe) !== false,
    trialDays: Number(plan.trial_days ?? plan.TrialDays ?? 0),
  };
}

export async function fetchPublicPlans(): Promise<PlanCatalogPlan[]> {
  try {
    const catalog = await fetchPricingCatalog();
    if (catalog.plans.length > 0) return catalog.plans;
  } catch {
    // Fall through to the legacy /plans endpoint for older API deployments.
  }
  const response = await fetch(`${API_BASE}/api/v1/plans`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Load plans failed: ${response.status}`);
  }
  const body = (await response.json()) as PlansResponse;
  const plans = Array.isArray(body.plans) ? body.plans : [];
  return plans.map(normalizeApiPlan).sort((a, b) => a.rank - b.rank);
}

export async function fetchPricingCatalog(): Promise<PricingCatalogData> {
  const response = await fetch(`${API_BASE}/api/v1/pricing-catalog`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Load pricing catalog failed: ${response.status}`);
  }
  const body = (await response.json()) as PricingCatalogResponse;
  const plans = Array.isArray(body.plans) ? body.plans : [];
  return {
    plans: plans.map(normalizeApiPlan).sort((a, b) => a.rank - b.rank),
    eventPacks: sortProducts(body.event_packs),
    galleryExtensions: sortProducts(body.gallery_extensions),
    storageBoosters: sortProducts(body.storage_boosters),
  };
}

function sortProducts(
  products: PricingCatalogProduct[] | undefined,
): PricingCatalogProduct[] {
  return Array.isArray(products)
    ? products.filter((product) => product.active).sort((a, b) => a.rank - b.rank)
    : [];
}

export function paidSelfServePlans(plans: PlanCatalogPlan[]): PlanCatalogPlan[] {
  return plans.filter(
    (plan) => plan.id !== "free" && plan.paid && plan.active && plan.selfServe,
  );
}

export function formatQuotaBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0GB";
  const tb = 2 ** 40;
  const gb = 2 ** 30;
  if (bytes >= tb && bytes % tb === 0) return `${bytes / tb}TB`;
  if (bytes >= gb && bytes % gb === 0) return `${bytes / gb}GB`;
  if (bytes >= tb) return `${(bytes / tb).toFixed(1)}TB`;
  return `${Math.round(bytes / gb).toLocaleString("en-IN")}GB`;
}

function storageLabelToBytes(label: string): number {
  const match = label.trim().match(/^(\d+(?:\.\d+)?)\s*(GB|TB)$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();
  return Math.round(amount * (unit === "TB" ? 2 ** 40 : 2 ** 30));
}
