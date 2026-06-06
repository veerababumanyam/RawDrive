"use client";

import { useEffect, useState } from "react";
import {
  fallbackPlanCatalog,
  fetchPricingCatalog,
  type PlanCatalogPlan,
  type PricingCatalogProduct,
} from "@/lib/plans";

export function usePlanCatalog() {
  const [plans, setPlans] = useState<PlanCatalogPlan[]>(fallbackPlanCatalog);
  const [eventPacks, setEventPacks] = useState<PricingCatalogProduct[]>([]);
  const [galleryExtensions, setGalleryExtensions] = useState<
    PricingCatalogProduct[]
  >([]);
  const [storageBoosters, setStorageBoosters] = useState<
    PricingCatalogProduct[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPricingCatalog()
      .then((data) => {
        if (!active) return;
        if (data.plans.length > 0) {
          setPlans(data.plans);
        }
        setEventPacks(data.eventPacks);
        setGalleryExtensions(data.galleryExtensions);
        setStorageBoosters(data.storageBoosters);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load plans");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    plans,
    eventPacks,
    galleryExtensions,
    storageBoosters,
    loading,
    error,
  };
}
