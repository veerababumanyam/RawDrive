"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  listFreelancers,
  getMyListing,
  updateFreelancerListing,
  type FreelancerListing,
} from "@/lib/api/marketplace";
import { getStoredAccessToken, getStoredAccessTokenClaims } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { getDistrictsForState } from "@/lib/data/india-districts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface IndianState {
  id: number;
  name: string;
}

const SPECIALIZATIONS = [
  "wedding",
  "portrait",
  "event",
  "drone",
  "aerial",
  "commercial",
  "fashion",
];

type Tab = "photographers" | "my-profile";

interface FreelancerAvailability {
  blocked_dates: string[];
  booked_dates: string[];
  min_booking_hours: number;
  max_days_ahead: number;
  notes: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  My Freelance Profile tab                                           */
/* ------------------------------------------------------------------ */

function MyProfileTab() {
  const token = getStoredAccessToken();
  const [listing, setListing] = useState<FreelancerListing | null>(null);
  const [loading, setLoading] = useState(() => !!token);
  const [error, setError] = useState<string | null>(() =>
    token ? null : "Not authenticated",
  );
  const [availability, setAvailability] =
    useState<FreelancerAvailability | null>(null);
  const [toggling, setToggling] = useState(false);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [savingDates, setSavingDates] = useState(false);
  const [datesSaved, setDatesSaved] = useState(false);

  const fetchAvailability = useCallback(async (listingId: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/marketplace/freelancers/${listingId}/availability`,
      );
      if (res.ok) {
        const json = await res.json();
        setAvailability(json.data);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    getMyListing(token)
      .then((data) => {
        setListing(data);
        if (data) fetchAvailability(data.id);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load profile"),
      )
      .finally(() => setLoading(false));
  }, [token, fetchAvailability]);

  const handleTogglePublished = async () => {
    if (!listing || !token || toggling) return;
    setToggling(true);
    try {
      const updated = await updateFreelancerListing(token, listing.id, {
        title: listing.title,
        specializations: listing.specializations,
        city: listing.city ?? undefined,
        daily_rate_paisa: listing.daily_rate_paisa ?? undefined,
        description: listing.description ?? undefined,
        is_published: !listing.is_published,
      });
      setListing(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(false);
    }
  };

  const saveBlockedDates = async (listingId: string, dates: string[]) => {
    if (!token) return;
    setSavingDates(true);
    setDatesSaved(false);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/marketplace/freelancers/${listingId}/availability`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ blocked_dates: dates }),
        },
      );
      if (!res.ok) throw new Error("Failed to update availability");
      const json = await res.json();
      setAvailability(json.data);
      setDatesSaved(true);
      setTimeout(() => setDatesSaved(false), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update availability",
      );
    } finally {
      setSavingDates(false);
    }
  };

  const handleAddBlockDate = async () => {
    if (!newBlockDate || !listing || !token || savingDates || !availability)
      return;
    if (availability.blocked_dates.includes(newBlockDate)) {
      setNewBlockDate("");
      return;
    }
    const updated = [...availability.blocked_dates, newBlockDate].sort();
    await saveBlockedDates(listing.id, updated);
    setNewBlockDate("");
  };

  const handleRemoveBlockDate = async (date: string) => {
    if (!listing || !token || !availability) return;
    const updated = availability.blocked_dates.filter((d) => d !== date);
    await saveBlockedDates(listing.id, updated);
  };

  if (loading) {
    return (
      <div className="space-y-4 pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-surface-sunken animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            My Freelance Profile
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage your freelancer listing visibility and availability.
          </p>
        </div>
        {listing && (
          <Link
            href={`/marketplace/freelancers/${listing.id}`}
            className="surface-button text-sm px-4 py-2"
          >
            View / Edit Profile
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {!listing ? (
        <div className="rounded-2xl border border-dashed border-border-default p-10 text-center space-y-4">
          <p className="font-medium text-text-primary">
            No freelance profile yet
          </p>
          <p className="text-sm text-text-secondary">
            Create a profile so clients can find and contact you from the
            marketplace.
          </p>
          <Link
            href="/marketplace/freelancers/edit"
            className="btn-primary px-5 py-2.5 text-sm"
          >
            Create Profile
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border-default bg-surface-raised p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary truncate">
                  {listing.title}
                </h3>
                {listing.city && (
                  <p className="text-sm text-text-secondary mt-0.5">
                    {listing.city}
                  </p>
                )}
              </div>
              {listing.daily_rate_paisa && (
                <span className="text-sm font-semibold text-text-primary shrink-0">
                  ₹{(listing.daily_rate_paisa / 100).toLocaleString("en-IN")}
                  /day
                </span>
              )}
            </div>
            {listing.specializations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {listing.specializations.map((s) => (
                  <span
                    key={s}
                    className="status-badge status-badge--accent capitalize"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            {listing.description && (
              <p className="text-sm text-text-secondary line-clamp-2">
                {listing.description}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border-default bg-surface-raised p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Available for bookings
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {listing.is_published
                    ? "Your profile is visible and accepting inquiries."
                    : "Your profile is hidden. Clients cannot find or contact you."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={listing.is_published}
                onClick={handleTogglePublished}
                disabled={toggling}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50",
                  listing.is_published
                    ? "bg-feedback-success"
                    : "bg-surface-sunken",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-surface-elevated shadow ring-0 transition-transform duration-200",
                    listing.is_published ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border-default bg-surface-raised p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Unavailable dates
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Dates you cannot accept bookings — shown on your public
                  profile.
                </p>
              </div>
              {datesSaved && (
                <span className="text-xs text-feedback-success">Saved</span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="date"
                value={newBlockDate}
                onChange={(e) => setNewBlockDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="input-base flex-1"
              />
              <button
                type="button"
                onClick={handleAddBlockDate}
                disabled={!newBlockDate || savingDates}
                className="btn-primary px-4 text-sm disabled:opacity-50"
              >
                {savingDates ? "Saving…" : "Block date"}
              </button>
            </div>

            {availability && availability.blocked_dates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availability.blocked_dates.map((date) => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low border border-border-default px-3 py-1 text-xs text-text-primary"
                  >
                    {formatDate(date)}
                    <button
                      type="button"
                      onClick={() => handleRemoveBlockDate(date)}
                      aria-label={`Remove ${date}`}
                      className="text-text-tertiary hover:text-feedback-error transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">
                No dates blocked — you appear available every day.
              </p>
            )}

            {availability && availability.booked_dates.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2">
                  Auto-blocked from calendar
                </p>
                <div className="flex flex-wrap gap-2">
                  {availability.booked_dates.map((date) => (
                    <span
                      key={date}
                      className="inline-flex items-center rounded-lg bg-feedback-warning/10 border border-feedback-warning/30 px-3 py-1 text-xs text-text-secondary"
                    >
                      {formatDate(date)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4 text-center">
              <p className="text-2xl font-bold text-text-primary">
                {listing.rating_avg?.toFixed(1) ?? "—"}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                Avg rating ({listing.review_count} reviews)
              </p>
            </div>
            <div className="rounded-2xl border border-border-default bg-surface-raised p-4 text-center">
              <p className="text-2xl font-bold text-text-primary capitalize">
                {listing.is_published ? "Active" : "Hidden"}
              </p>
              <p className="text-xs text-text-secondary mt-1">Profile status</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Freelance Photographers tab                                        */
/* ------------------------------------------------------------------ */

function PhotographersTab() {
  const myUserID =
    typeof window !== "undefined"
      ? (getStoredAccessTokenClaims()?.sub ?? "")
      : "";
  const token = typeof window !== "undefined" ? getStoredAccessToken() : null;
  const [hasProfile, setHasProfile] = useState(false);
  const [specialization, setSpecialization] = useState("");
  const [city, setCity] = useState("");
  const [stateID, setStateID] = useState<number | "">("");
  const [district, setDistrict] = useState("");
  const [states, setStates] = useState<IndianState[]>([]);
  const requestKey = `${stateID}:${city}:${district}:${specialization}`;
  const [requestState, setRequestState] = useState<{
    key: string;
    freelancers: FreelancerListing[];
    error: string | null;
  }>({
    key: "",
    freelancers: [],
    error: null,
  });

  const freelancers =
    requestState.key === requestKey ? requestState.freelancers : [];
  const error = requestState.key === requestKey ? requestState.error : null;
  const loading = requestState.key !== requestKey;

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/states`)
      .then((r) => r.json())
      .then((body: { states?: IndianState[] }) =>
        setStates(Array.isArray(body.states) ? body.states : []),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    getMyListing(token)
      .then((listing) => setHasProfile(listing !== null))
      .catch(() => {
        /* non-fatal */
      });
    fetch(`${API_BASE}/api/v1/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { state_id?: number; district?: string }) => {
        if (data.state_id) setStateID(data.state_id);
        if (data.district) setDistrict(data.district);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    let ignore = false;

    listFreelancers({
      state_id: stateID || undefined,
      city: city || undefined,
      district: district || undefined,
      specialization: specialization || undefined,
      sort: "rating",
    })
      .then((data) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            freelancers: myUserID
              ? data.filter((f) => f.user_id !== myUserID)
              : data,
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
  }, [city, district, myUserID, requestKey, specialization, stateID]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          {loading
            ? "Loading…"
            : `${freelancers.length} ${freelancers.length === 1 ? "photographer" : "photographers"} available`}
        </p>
        {!hasProfile && (
          <Link
            href="/marketplace/freelancers/edit"
            className="btn-primary px-4 py-2.5 text-sm"
          >
            Create Profile
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={stateID}
          onChange={(e) => {
            setStateID(e.target.value ? Number(e.target.value) : "");
            setDistrict("");
          }}
          className="input-base min-w-[160px]"
          aria-label="Filter by state"
        >
          <option value="">All States</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {(() => {
          const selectedStateName =
            states.find((s) => s.id === stateID)?.name ?? "";
          const districts = getDistrictsForState(selectedStateName);
          return (
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              disabled={districts.length === 0}
              className="input-base min-w-[160px] disabled:opacity-50"
              aria-label="Filter by district"
            >
              <option value="">
                {districts.length === 0 ? "All Districts" : "All Districts"}
              </option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          );
        })()}
        <input
          type="text"
          placeholder="Filter by city…"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input-base min-w-[160px]"
          aria-label="Filter by city"
        />
        <select
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
          className="input-base"
        >
          <option value="">All Specializations</option>
          {SPECIALIZATIONS.map((entry) => (
            <option key={entry} value={entry}>
              {entry.charAt(0).toUpperCase() + entry.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div
              key={item}
              className="h-48 bg-surface-sunken rounded-xl animate-pulse"
            />
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
              <h3 className="text-base font-semibold text-text-primary">
                {freelancer.title}
              </h3>
              {freelancer.city && (
                <p className="text-sm text-text-secondary mt-1">
                  {freelancer.city}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {freelancer.specializations.map((entry) => (
                  <span
                    key={entry}
                    className="status-badge status-badge--accent"
                  >
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
                  <span className="text-xs text-text-secondary">
                    ({freelancer.review_count})
                  </span>
                </div>
                {freelancer.daily_rate_paisa && (
                  <span className="text-sm font-semibold text-text-primary">
                    ₹
                    {(freelancer.daily_rate_paisa / 100).toLocaleString(
                      "en-IN",
                    )}
                    /day
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

/* ------------------------------------------------------------------ */
/*  Page shell with tabs                                               */
/* ------------------------------------------------------------------ */

export default function FreelancersPage() {
  const [tab, setTab] = useState<Tab>("photographers");

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Freelancers
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Find photographers for hire or manage your own freelance profile
        </p>
      </div>

      <div className="flex gap-2 border-b border-border-default pb-0">
        {(
          [
            { id: "photographers", label: "Freelance photographers" },
            { id: "my-profile", label: "My freelance profile" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "photographers" ? <PhotographersTab /> : <MyProfileTab />}
    </div>
  );
}
