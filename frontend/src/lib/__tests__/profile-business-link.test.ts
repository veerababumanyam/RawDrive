import { describe, expect, it } from "vitest";

import { emptyPhotographerProfile } from "@/lib/api/photographer-profile";
import {
  applyLinkedBusinessProfile,
  applyLinkedPricingProfile,
  BUSINESS_PROFILE_SETTINGS_HREF,
  linkedBusinessProfileFromPhotographer,
  linkedBusinessProfileFromWorkspace,
  linkedPricingProfileFromSources,
  SERVICE_PACKAGES_SETTINGS_HREF,
} from "@/lib/profile-business-link";

describe("profile business link", () => {
  it("builds linked business identity from workspace business profile fields", () => {
    expect(
      linkedBusinessProfileFromWorkspace({
        name: "Kaveri Weddings",
        brand_name: "Kaveri Stories",
        address_line1: "Road No. 12",
        address_line2: "Banjara Hills",
        city: "Hyderabad, Telangana",
        postal_code: "500034",
      }),
    ).toEqual({
      name: "Kaveri Stories",
      address: "Road No. 12\nBanjara Hills\nHyderabad, Telangana\n500034",
      href: BUSINESS_PROFILE_SETTINGS_HREF,
    });
  });

  it("applies linked business identity to photographer profile saves", () => {
    const profile = {
      ...emptyPhotographerProfile(),
      business_name: "Old Studio",
      business_address: "Old address",
    };
    const linked = linkedBusinessProfileFromPhotographer({
      business_name: "Linked Studio",
      business_address: "Linked address",
    });

    expect(applyLinkedBusinessProfile(profile, linked)).toEqual(
      expect.objectContaining({
        business_name: "Linked Studio",
        business_address: "Linked address",
      }),
    );
  });

  it("builds public pricing from active service packages and business terms", () => {
    const linked = linkedPricingProfileFromSources(
      [
        { base_price_paisa: 15000000, active: true },
        { base_price_paisa: 5000000, active: true },
        { base_price_paisa: 2500000, active: false },
      ],
      { invoice_terms: "50% advance confirms the booking." },
      emptyPhotographerProfile(),
    );

    expect(linked).toEqual({
      startingPrice: 50000,
      maxPrice: 150000,
      paymentTerms: "50% advance confirms the booking.",
      packageCount: 2,
      href: SERVICE_PACKAGES_SETTINGS_HREF,
      termsHref: BUSINESS_PROFILE_SETTINGS_HREF,
    });
  });

  it("applies linked pricing to photographer profile saves", () => {
    const profile = emptyPhotographerProfile();
    const linked = linkedPricingProfileFromSources(
      [{ base_price_paisa: 7500000, active: true }],
      { invoice_terms: "Balance before final delivery." },
      profile,
    );

    expect(applyLinkedPricingProfile(profile, linked)).toEqual(
      expect.objectContaining({
        starting_price: 75000,
        price_range_max: null,
        payment_terms: "Balance before final delivery.",
      }),
    );
  });
});
