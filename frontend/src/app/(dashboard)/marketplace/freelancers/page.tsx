"use client";
import { getApiBaseUrl } from "@/lib/api/base-url";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  listFreelancers,
  getMyListing,
  updateFreelancerListing,
  type FreelancerListing,
} from "@/lib/api/marketplace";
import { getStoredAccessToken, getStoredAccessTokenClaims } from "@/lib/auth";
import { getDistrictsForState } from "@/lib/data/india-districts";
import { XMark } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";

const API_BASE = getApiBaseUrl();

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
      <div className="marketplace-stack">
        {[1, 2, 3].map((i) => (
          <Card
            key={i}
            variant="panel"
            padding="none"
            className="marketplace-skeleton"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="marketplace-stack">
      <div className="marketplace-section-header">
        <div>
          <h2 className="marketplace-section-title">My Freelance Profile</h2>
          <p className="marketplace-section-copy">
            Manage your freelancer listing visibility and availability.
          </p>
        </div>
        {listing && (
          <Link
            href={`/marketplace/freelancers/${listing.id}`}
            className="glass-button glass-button--surface glass-button--md"
          >
            <span>View / Edit Profile</span>
          </Link>
        )}
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {!listing ? (
        <Card
          variant="panel"
          padding="none"
          className="marketplace-empty-state"
        >
          <p className="marketplace-empty-state__title">
            No freelance profile yet
          </p>
          <p className="marketplace-empty-state__copy">
            Create a profile so clients can find and contact you from the
            marketplace.
          </p>
          <Link
            href="/marketplace/freelancers/edit"
            className="glass-button glass-button--primary glass-button--md"
          >
            <span>Create Profile</span>
          </Link>
        </Card>
      ) : (
        <>
          <Card
            variant="panel"
            padding="none"
            className="marketplace-profile-card"
          >
            <div className="marketplace-card-header">
              <div className="min-w-0">
                <h3 className="marketplace-card-title">{listing.title}</h3>
                {listing.city && (
                  <p className="marketplace-card-meta">{listing.city}</p>
                )}
              </div>
              {listing.daily_rate_paisa && (
                <span className="marketplace-rate">
                  ₹{(listing.daily_rate_paisa / 100).toLocaleString("en-IN")}
                  /day
                </span>
              )}
            </div>
            {listing.specializations.length > 0 && (
              <div className="marketplace-badge-row">
                {listing.specializations.map((s) => (
                  <Badge key={s} variant="accent" className="capitalize">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            {listing.description && (
              <p className="marketplace-card-copy">{listing.description}</p>
            )}
          </Card>

          <Card
            variant="panel"
            padding="none"
            className="marketplace-profile-card"
          >
            <div className="marketplace-card-header marketplace-card-header--center">
              <div>
                <h3 className="marketplace-subsection-title">
                  Available for bookings
                </h3>
                <p className="marketplace-subsection-copy">
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
                data-state={listing.is_published ? "published" : "hidden"}
                className="publish-state-toggle"
              >
                <span
                  className="publish-state-toggle__track"
                  aria-hidden="true"
                >
                  <span className="publish-state-toggle__thumb" />
                </span>
                <span className="publish-state-toggle__label">
                  {listing.is_published ? "Visible" : "Hidden"}
                </span>
              </button>
            </div>
          </Card>

          <Card
            variant="panel"
            padding="none"
            className="marketplace-profile-card"
          >
            <div className="marketplace-card-header">
              <div>
                <h3 className="marketplace-subsection-title">
                  Unavailable dates
                </h3>
                <p className="marketplace-subsection-copy">
                  Dates you cannot accept bookings — shown on your public
                  profile.
                </p>
              </div>
              {datesSaved && <Badge variant="success">Saved</Badge>}
            </div>

            <div className="marketplace-inline-form">
              <input
                type="date"
                value={newBlockDate}
                onChange={(e) => setNewBlockDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="input-base marketplace-inline-form__input"
              />
              <GlassButton
                type="button"
                variant="primary"
                size="md"
                onClick={handleAddBlockDate}
                disabled={!newBlockDate || savingDates}
              >
                {savingDates ? "Saving…" : "Block date"}
              </GlassButton>
            </div>

            {availability && availability.blocked_dates.length > 0 ? (
              <div className="marketplace-date-list">
                {availability.blocked_dates.map((date) => (
                  <span key={date} className="marketplace-date-chip">
                    {formatDate(date)}
                    <GlassIconButton
                      size="sm"
                      variant="ghost"
                      label={`Remove ${date}`}
                      onClick={() => handleRemoveBlockDate(date)}
                    >
                      <XMark aria-hidden="true" />
                    </GlassIconButton>
                  </span>
                ))}
              </div>
            ) : (
              <p className="marketplace-muted-copy">
                No dates blocked — you appear available every day.
              </p>
            )}

            {availability && availability.booked_dates.length > 0 && (
              <div className="marketplace-stack-sm">
                <p className="marketplace-subsection-copy">
                  Auto-blocked from calendar
                </p>
                <div className="marketplace-date-list">
                  {availability.booked_dates.map((date) => (
                    <Badge key={date} variant="warning">
                      {formatDate(date)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="marketplace-stat-grid">
            <Card
              variant="panel"
              padding="none"
              className="marketplace-stat-card"
            >
              <p className="marketplace-stat-card__value">
                {listing.rating_avg?.toFixed(1) ?? "—"}
              </p>
              <p className="marketplace-stat-card__label">
                Avg rating ({listing.review_count} reviews)
              </p>
            </Card>
            <Card
              variant="panel"
              padding="none"
              className="marketplace-stat-card"
            >
              <p className="marketplace-stat-card__value capitalize">
                {listing.is_published ? "Active" : "Hidden"}
              </p>
              <p className="marketplace-stat-card__label">Profile status</p>
            </Card>
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
    <div className="marketplace-stack">
      <div className="marketplace-section-header">
        <p className="marketplace-section-copy">
          {loading
            ? "Loading…"
            : `${freelancers.length} ${freelancers.length === 1 ? "photographer" : "photographers"} available`}
        </p>
        {!hasProfile && (
          <Link
            href="/marketplace/freelancers/edit"
            className="glass-button glass-button--primary glass-button--md"
          >
            <span>Create Profile</span>
          </Link>
        )}
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <Card variant="panel" padding="none" className="marketplace-filter-panel">
        <select
          value={stateID}
          onChange={(e) => {
            setStateID(e.target.value ? Number(e.target.value) : "");
            setDistrict("");
          }}
          className="input-base marketplace-filter-control"
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
              className="input-base marketplace-filter-control"
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
          className="input-base marketplace-filter-control"
          aria-label="Filter by city"
        />
        <select
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
          className="input-base marketplace-filter-control"
          aria-label="Filter by specialization"
        >
          <option value="">All Specializations</option>
          {SPECIALIZATIONS.map((entry) => (
            <option key={entry} value={entry}>
              {entry.charAt(0).toUpperCase() + entry.slice(1)}
            </option>
          ))}
        </select>
      </Card>

      {loading ? (
        <div className="marketplace-card-grid">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Card
              key={item}
              variant="panel"
              padding="none"
              className="marketplace-listing-skeleton"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : freelancers.length === 0 ? (
        <Card
          variant="panel"
          padding="none"
          className="marketplace-empty-state"
        >
          No freelancers found. Try adjusting your filters.
        </Card>
      ) : (
        <div className="marketplace-card-grid">
          {freelancers.map((freelancer) => (
            <Link
              key={freelancer.id}
              href={`/marketplace/freelancers/${freelancer.id}`}
              className="surface-panel card-pad-sm marketplace-listing-card"
            >
              <h3 className="marketplace-card-title">{freelancer.title}</h3>
              {freelancer.city && (
                <p className="marketplace-card-meta">{freelancer.city}</p>
              )}
              <div className="marketplace-badge-row">
                {freelancer.specializations.map((entry) => (
                  <Badge key={entry} variant="accent" className="capitalize">
                    {entry}
                  </Badge>
                ))}
              </div>
              <div className="marketplace-listing-card__footer">
                <div className="marketplace-rating">
                  <span className="rating-star">★</span>
                  <span className="marketplace-rating__value">
                    {freelancer.rating_avg?.toFixed(1) || "New"}
                  </span>
                  <span className="marketplace-rating__count">
                    ({freelancer.review_count})
                  </span>
                </div>
                {freelancer.daily_rate_paisa && (
                  <span className="marketplace-rate">
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
    <PageContainer width="wide">
      <PageHeader
        title="Freelancers"
        description="Find photographers for hire or manage your own freelance profile."
      />

      <div
        role="tablist"
        aria-label="Freelancer marketplace sections"
        className="glass-segmented marketplace-page-tabs"
      >
        {(
          [
            { id: "photographers", label: "Freelance photographers" },
            { id: "my-profile", label: "My freelance profile" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="glass-segmented-option"
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "photographers" ? <PhotographersTab /> : <MyProfileTab />}
      </div>
    </PageContainer>
  );
}
