"use client";

import { useEffect, useState } from "react";
import {
  fallbackPlanCatalog,
  fetchPublicPlans,
  type PlanCatalogPlan,
} from "@/lib/plans";

export function usePlanCatalog() {
  const [plans, setPlans] = useState<PlanCatalogPlan[]>(fallbackPlanCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchPublicPlans()
      .then((data) => {
        if (!active) return;
        if (data.length > 0) {
          setPlans(data);
        }
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

  return { plans, loading, error };
}
