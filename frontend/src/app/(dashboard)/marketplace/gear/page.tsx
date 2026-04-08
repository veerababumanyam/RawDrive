"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listGear, type GearListing } from "@/lib/api/gear";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "camera_body", label: "Camera Bodies" },
  { value: "lens", label: "Lenses" },
  { value: "lighting", label: "Lighting" },
  { value: "audio", label: "Audio" },
  { value: "accessory", label: "Accessories" },
];

export default function GearPage() {
  const [gear, setGear] = useState<GearListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");

  useEffect(() => {
    setLoading(true);
    listGear({ category: category || undefined })
      .then(setGear)
      .catch(() => setGear([]))
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Gear Rental</h1>
          <p className="text-sm text-text-secondary mt-1">
            Rent cameras, lenses, and accessories from other photographers
          </p>
        </div>
        <Link
          href="/marketplace/gear/new"
          className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px] flex items-center"
        >
          List Your Gear
        </Link>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] ${
              category === cat.value
                ? "bg-accent/20 text-accent border border-accent/30"
                : "bg-white/5 text-text-secondary border border-white/10 hover:bg-white/10"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-surface-sunken rounded-xl animate-pulse" />
          ))}
        </div>
      ) : gear.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No gear listings found. Try a different category.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gear.map((g) => (
            <Link
              key={g.id}
              href={`/marketplace/gear/${g.id}`}
              className="block rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 overflow-hidden hover:bg-white/[0.08] transition-colors"
            >
              {/* Image placeholder */}
              {g.images && g.images.length > 0 ? (
                <div className="h-40 bg-surface-sunken flex items-center justify-center">
                  <span className="text-text-secondary text-xs">Image</span>
                </div>
              ) : (
                <div className="h-40 bg-surface-sunken flex items-center justify-center">
                  <span className="text-text-secondary text-xs">{g.category.replace("_", " ")}</span>
                </div>
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">{g.title}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    g.is_available
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    {g.is_available ? "Available" : "Booked"}
                  </span>
                </div>
                {g.brand && (
                  <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-white/5 border border-white/10 text-text-secondary">
                    {g.brand}
                  </span>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-base font-bold text-text-primary">
                    ₹{(g.price_paisa / 100).toLocaleString("en-IN")}
                    <span className="text-xs font-normal text-text-secondary">
                      /{g.listing_type === "rental" ? "day" : "sale"}
                    </span>
                  </span>
                  {g.city && (
                    <span className="text-xs text-text-secondary">{g.city}</span>
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
