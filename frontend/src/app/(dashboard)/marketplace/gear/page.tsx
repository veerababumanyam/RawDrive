"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listGear, type GearListing } from "@/lib/api/gear";
import { availabilityClasses } from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "camera_body", label: "Camera Bodies" },
  { value: "lens", label: "Lenses" },
  { value: "lighting", label: "Lighting" },
  { value: "audio", label: "Audio" },
  { value: "accessory", label: "Accessories" },
];

export default function GearPage() {
  const [category, setCategory] = useState("");
  const requestKey = category || "__all__";
  const [requestState, setRequestState] = useState<{
    key: string;
    gear: GearListing[];
    error: string | null;
  }>({
    key: "",
    gear: [],
    error: null,
  });

  const gear = requestState.key === requestKey ? requestState.gear : [];
  const error = requestState.key === requestKey ? requestState.error : null;
  const loading = requestState.key !== requestKey;

  useEffect(() => {
    let ignore = false;

    listGear({ category: category || undefined })
      .then((data) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            gear: data,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            gear: [],
            error: err?.message || "Failed to load gear listings",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [category, requestKey]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Gear Rental</h1>
          <p className="text-sm text-text-secondary mt-1">
            Rent cameras, lenses, and accessories from other photographers
          </p>
        </div>
        <Link
          href="/marketplace/gear/new"
          className="btn-primary px-4 py-2.5 text-sm"
        >
          List Your Gear
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((entry) => (
          <button
            key={entry.value}
            onClick={() => setCategory(entry.value)}
            className={cn(
              "segmented-control-button whitespace-nowrap text-sm",
              category === entry.value
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="h-64 bg-surface-sunken rounded-xl animate-pulse" />
          ))}
        </div>
      ) : gear.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No gear listings found. Try a different category.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gear.map((entry) => (
            <Link
              key={entry.id}
              href={`/marketplace/gear/${entry.id}`}
              className="surface-panel block overflow-hidden transition-colors hover:bg-surface-container-high"
            >
              {entry.images && entry.images.length > 0 ? (
                <div className="h-40 bg-surface-sunken flex items-center justify-center">
                  <span className="text-text-secondary text-xs">Image</span>
                </div>
              ) : (
                <div className="h-40 bg-surface-sunken flex items-center justify-center">
                  <span className="text-text-secondary text-xs">{entry.category.replace("_", " ")}</span>
                </div>
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">{entry.title}</h3>
                  <span
                    className={cn(
                      availabilityClasses[entry.is_available ? "available" : "unavailable"],
                    )}
                  >
                    {entry.is_available ? "Available" : "Booked"}
                  </span>
                </div>
                {entry.brand && (
                  <span className="status-badge status-badge--neutral">
                    {entry.brand}
                  </span>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-base font-bold text-text-primary">
                    ₹{(entry.price_paisa / 100).toLocaleString("en-IN")}
                    <span className="text-xs font-normal text-text-secondary">
                      /{entry.listing_type === "rental" ? "day" : "sale"}
                    </span>
                  </span>
                  {entry.city && (
                    <span className="text-xs text-text-secondary">{entry.city}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
