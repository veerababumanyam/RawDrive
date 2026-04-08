"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getGear, type GearListing } from "@/lib/api/gear";

export default function GearDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
        <Link href="/marketplace/gear" className="text-accent underline">Back to gear</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{gear.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            {gear.brand && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-white/5 border border-white/10 text-text-secondary">{gear.brand}</span>
            )}
            <span className="px-2.5 py-1 text-xs rounded-full bg-accent/10 text-accent">{gear.category.replace("_", " ")}</span>
            {gear.condition && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-white/5 border border-white/10 text-text-secondary">{gear.condition.replace("_", " ")}</span>
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
          <span className={`inline-block mt-1 px-3 py-1 text-xs rounded-full ${
            gear.is_available ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            {gear.is_available ? "Available" : "Currently Booked"}
          </span>
        </div>
      </div>

      {gear.description && (
        <div className="p-5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
          <p className="text-sm text-text-secondary leading-relaxed">{gear.description}</p>
        </div>
      )}

      {gear.city && (
        <p className="text-sm text-text-secondary">Location: {gear.city}</p>
      )}

      {gear.is_available && gear.listing_type === "rental" && (
        <Link
          href={`/marketplace/gear/${gear.id}/book`}
          className="inline-block px-6 py-3 rounded-xl bg-accent text-white font-medium hover:opacity-90 transition-opacity min-h-[44px]"
        >
          Book This Gear
        </Link>
      )}
    </div>
  );
}
