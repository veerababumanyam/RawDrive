"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getGear, type GearListing } from "@/lib/api/gear";
import { availabilityClasses } from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/ui/back-button";

export default function GearDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [gear, setGear] = useState<GearListing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGear(id)
      .then(setGear)
      .catch(() => setGear(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-64 bg-surface-sunken rounded-xl" />
          <div className="h-8 w-48 bg-surface-sunken rounded" />
        </div>
      </div>
    );
  }

  if (!gear) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-text-secondary">
        Gear not found.{" "}
        <Link href="/marketplace/gear" className="text-accent underline">
          Back to gear
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <BackButton
        href="/marketplace/camera-rentals"
        label="Back to camera rentals"
      />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {gear.title}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            {gear.brand && (
              <span className="status-badge status-badge--neutral">
                {gear.brand}
              </span>
            )}
            <span className="status-badge status-badge--accent">
              {gear.category.replace("_", " ")}
            </span>
            {gear.condition && (
              <span className="status-badge status-badge--neutral">
                {gear.condition.replace("_", " ")}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-text-primary">
            ₹{(gear.price_paisa / 100).toLocaleString("en-IN")}
            <span className="text-sm font-normal text-text-secondary">
              /{gear.listing_type === "rental" ? "day" : "sale"}
            </span>
          </div>
          <span
            className={cn(
              "mt-1",
              availabilityClasses[
                gear.is_available ? "available" : "unavailable"
              ],
            )}
          >
            {gear.is_available ? "Available" : "Currently Booked"}
          </span>
        </div>
      </div>

      {gear.description && (
        <div className="surface-panel p-5">
          <p className="text-sm text-text-secondary leading-relaxed">
            {gear.description}
          </p>
        </div>
      )}

      {gear.city && (
        <p className="text-sm text-text-secondary">Location: {gear.city}</p>
      )}

      {gear.is_available && gear.listing_type === "rental" && (
        <Link
          href={`/marketplace/gear/${gear.id}/book`}
          className="btn-primary inline-flex px-6 py-3 text-sm"
        >
          Book This Gear
        </Link>
      )}
    </div>
  );
}
