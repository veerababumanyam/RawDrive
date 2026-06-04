import type { PhotographerProfile } from "@/lib/api/photographer-profile";
import type { ServicePackage } from "@/lib/api/billing";
import type { WorkspaceProfile } from "@/lib/api/workspace-profile";

export const BUSINESS_PROFILE_SETTINGS_HREF = "/settings/business";
export const SERVICE_PACKAGES_SETTINGS_HREF = "/settings/packages";

export interface LinkedBusinessProfile {
  name: string;
  address: string;
  href: string;
}

export interface LinkedPricingProfile {
  startingPrice: number | null;
  maxPrice: number | null;
  paymentTerms: string;
  packageCount: number;
  href: string;
  termsHref: string;
}

export function linkedBusinessProfileFromWorkspace(
  workspaceProfile: Partial<WorkspaceProfile> | null | undefined,
): LinkedBusinessProfile {
  const name = (
    workspaceProfile?.brand_name ||
    workspaceProfile?.name ||
    ""
  ).trim();
  const address = [
    workspaceProfile?.address_line1,
    workspaceProfile?.address_line2,
    workspaceProfile?.city,
    workspaceProfile?.postal_code,
  ]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join("\n");

  return {
    name,
    address,
    href: BUSINESS_PROFILE_SETTINGS_HREF,
  };
}

export function linkedBusinessProfileFromPhotographer(
  profile: Pick<PhotographerProfile, "business_name" | "business_address">,
): LinkedBusinessProfile {
  return {
    name: profile.business_name.trim(),
    address: profile.business_address.trim(),
    href: BUSINESS_PROFILE_SETTINGS_HREF,
  };
}

export function applyLinkedBusinessProfile(
  profile: PhotographerProfile,
  linkedBusinessProfile: LinkedBusinessProfile,
): PhotographerProfile {
  return {
    ...profile,
    business_name: linkedBusinessProfile.name,
    business_address: linkedBusinessProfile.address,
  };
}

export function linkedPricingProfileFromSources(
  servicePackages: Pick<ServicePackage, "base_price_paisa" | "active">[],
  workspaceProfile: Pick<WorkspaceProfile, "invoice_terms"> | null | undefined,
  fallback: Pick<
    PhotographerProfile,
    "starting_price" | "price_range_max" | "payment_terms"
  >,
): LinkedPricingProfile {
  const prices = servicePackages
    .filter((pkg) => pkg.active !== false)
    .map((pkg) => Math.round((pkg.base_price_paisa || 0) / 100))
    .filter((price) => price > 0)
    .sort((a, b) => a - b);
  const minPrice = prices.length
    ? (prices.at(0) ?? null)
    : (fallback.starting_price ?? null);
  const maxPackagePrice = prices.at(-1) ?? null;
  const maxPrice =
    prices.length > 1 && maxPackagePrice && maxPackagePrice !== minPrice
      ? maxPackagePrice
      : prices.length
        ? null
        : (fallback.price_range_max ?? null);

  return {
    startingPrice: minPrice,
    maxPrice,
    paymentTerms:
      workspaceProfile?.invoice_terms?.trim() || fallback.payment_terms.trim(),
    packageCount: servicePackages.filter((pkg) => pkg.active !== false).length,
    href: SERVICE_PACKAGES_SETTINGS_HREF,
    termsHref: BUSINESS_PROFILE_SETTINGS_HREF,
  };
}

export function applyLinkedPricingProfile(
  profile: PhotographerProfile,
  linkedPricingProfile: LinkedPricingProfile,
): PhotographerProfile {
  return {
    ...profile,
    starting_price: linkedPricingProfile.startingPrice,
    price_range_max: linkedPricingProfile.maxPrice,
    payment_terms: linkedPricingProfile.paymentTerms,
  };
}
