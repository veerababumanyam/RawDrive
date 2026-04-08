"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listFreelancers, type FreelancerListing } from "@/lib/api/marketplace";

const SPECIALIZATIONS = ["wedding", "portrait", "event", "drone", "aerial", "commercial", "fashion"];

export default function FreelancersPage() {
  const [freelancers, setFreelancers] = useState<FreelancerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [specialization, setSpecialization] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    setLoading(true);
    listFreelancers({
      specialization: specialization || undefined,
      city: city || undefined,
      sort: "rating",
    })
      .then(setFreelancers)
      .catch((err) => { setError(err?.message || "Failed to load freelancers"); setFreelancers([]); })
      .finally(() => setLoading(false));
  }, [specialization, city]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Freelance Photographers</h1>
          <p className="text-sm text-text-secondary mt-1">
            {freelancers.length} {freelancers.length === 1 ? "photographer" : "photographers"} available
          </p>
        </div>
        <Link
          href="/marketplace/freelancers/edit"
          className="btn-primary px-4 py-2.5 text-sm"
        >
          Create Profile
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter by city..."
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input-base min-w-[200px]"
        />
        <select
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
          className="input-base"
        >
          <option value="">All Specializations</option>
          {SPECIALIZATIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-surface-sunken rounded-xl animate-pulse" />
          ))}
        </div>
      ) : freelancers.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No freelancers found. Try adjusting your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {freelancers.map((f) => (
            <Link
              key={f.id}
              href={`/marketplace/freelancers/${f.id}`}
              className="block p-5 rounded-xl border border-border-default bg-surface-raised hover:bg-surface-sunken transition-colors"
            >
              <h3 className="text-base font-semibold text-text-primary">{f.title}</h3>
              {f.city && (
                <p className="text-sm text-text-secondary mt-1">{f.city}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {f.specializations.map((s) => (
                  <span key={s} className="status-badge status-badge--accent">
                    {s}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-1">
                  <span className="rating-star">★</span>
                  <span className="text-sm font-medium text-text-primary">
                    {f.rating_avg?.toFixed(1) || "New"}
                  </span>
                  <span className="text-xs text-text-secondary">({f.review_count})</span>
                </div>
                {f.daily_rate_paisa && (
                  <span className="text-sm font-semibold text-text-primary">
                    ₹{(f.daily_rate_paisa / 100).toLocaleString("en-IN")}/day
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
