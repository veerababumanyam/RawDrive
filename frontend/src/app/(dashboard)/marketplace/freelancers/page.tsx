"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listFreelancers, type FreelancerListing } from "@/lib/api/marketplace";

const SPECIALIZATIONS = ["wedding", "portrait", "event", "drone", "aerial", "commercial", "fashion"];

export default function FreelancersPage() {
  const [specialization, setSpecialization] = useState("");
  const [city, setCity] = useState("");
  const requestKey = `${specialization}:${city}`;
  const [requestState, setRequestState] = useState<{
    key: string;
    freelancers: FreelancerListing[];
    error: string | null;
  }>({
    key: "",
    freelancers: [],
    error: null,
  });

  const freelancers = requestState.key === requestKey ? requestState.freelancers : [];
  const error = requestState.key === requestKey ? requestState.error : null;
  const loading = requestState.key !== requestKey;

  useEffect(() => {
    let ignore = false;

    listFreelancers({
      specialization: specialization || undefined,
      city: city || undefined,
      sort: "rating",
    })
      .then((data) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            freelancers: data,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            freelancers: [],
            error: err?.message || "Failed to load freelancers",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [city, requestKey, specialization]);

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
          {SPECIALIZATIONS.map((entry) => (
            <option key={entry} value={entry}>{entry.charAt(0).toUpperCase() + entry.slice(1)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="h-48 bg-surface-sunken rounded-xl animate-pulse" />
          ))}
        </div>
      ) : freelancers.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No freelancers found. Try adjusting your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {freelancers.map((freelancer) => (
            <Link
              key={freelancer.id}
              href={`/marketplace/freelancers/${freelancer.id}`}
              className="block p-5 rounded-xl border border-border-default bg-surface-raised hover:bg-surface-sunken transition-colors"
            >
              <h3 className="text-base font-semibold text-text-primary">{freelancer.title}</h3>
              {freelancer.city && (
                <p className="text-sm text-text-secondary mt-1">{freelancer.city}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {freelancer.specializations.map((entry) => (
                  <span key={entry} className="status-badge status-badge--accent">
                    {entry}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-1">
                  <span className="rating-star">★</span>
                  <span className="text-sm font-medium text-text-primary">
                    {freelancer.rating_avg?.toFixed(1) || "New"}
                  </span>
                  <span className="text-xs text-text-secondary">({freelancer.review_count})</span>
                </div>
                {freelancer.daily_rate_paisa && (
                  <span className="text-sm font-semibold text-text-primary">
                    ₹{(freelancer.daily_rate_paisa / 100).toLocaleString("en-IN")}/day
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
