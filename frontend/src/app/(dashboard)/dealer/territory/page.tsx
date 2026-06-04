// Design source: design-tokens.json semantic classes
"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  getDealerDashboard,
  getDealerPhotographers,
  getStates,
  type Dealer,
} from "@/lib/api/dealer";

// The dealer record only carries a numeric state_id, so we resolve it to a
// human-readable name via GET /api/v1/states — the same pattern DealerDashboard
// uses. Coverage is the count of photographers in the dealer's territory.
export default function DealerTerritoryPage() {
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getDealerDashboard()
      .then((d) => {
        if (!active) return;
        setDealer(d);

        // Resolve state_id -> name (non-fatal; card falls back to "#id").
        getStates()
          .then((states) => {
            if (!active) return;
            const match = states.find((s) => s.id === d.state_id);
            setStateName(match ? match.name : null);
          })
          .catch(() => {
            /* non-fatal — territory still renders with the raw id */
          });

        // Coverage = photographers registered in the dealer's territory.
        getDealerPhotographers()
          .then((photographers) => {
            if (active) setCoverage(photographers.length);
          })
          .catch(() => {
            if (active) setCoverage(null);
          });
      })
      .catch(() => {
        // 404 → the signed-in user is not a registered dealer.
        if (active) setDealer(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const header = (
    <div>
      <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
        My Territory
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Your assigned geographic region and coverage area.
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-surface-sunken animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!dealer) {
    return (
      <div className="space-y-6">
        {header}
        <div className="glass-card flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
          <MapPin className="h-12 w-12 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            Register as a dealer to view your territory.
          </p>
        </div>
      </div>
    );
  }

  const cards: { label: string; value: string }[] = [
    {
      label: "Assigned State",
      value: stateName ?? `#${dealer.state_id}`,
    },
    {
      label: "Territory Type",
      value: dealer.territory_type,
    },
    {
      label: "Coverage",
      value:
        coverage === null
          ? "—"
          : `${coverage} photographer${coverage === 1 ? "" : "s"}`,
    },
  ];

  if (
    dealer.commission_rate_pct !== null &&
    dealer.commission_rate_pct !== undefined
  ) {
    cards.push({
      label: "Commission Rate",
      value: `${dealer.commission_rate_pct}%`,
    });
  }

  if (dealer.referral_code) {
    cards.push({
      label: "Referral Code",
      value: dealer.referral_code,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MapPin className="h-7 w-7 text-accent-primary" />
        {header}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="glass-card rounded-2xl p-6">
            <p className="text-sm text-text-secondary">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold capitalize text-text-primary">
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
