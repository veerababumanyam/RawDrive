"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getFreelancer, createInquiry, type FreelancerListing, type FreelancerReview } from "@/lib/api/marketplace";
import { BackButton } from "@/components/ui/back-button";
import { getStoredAccessToken, getStoredAccessTokenClaims } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface Availability {
  blocked_dates: string[];
  booked_dates: string[];
  min_booking_hours?: number;
  max_days_ahead?: number;
  notes?: string;
}

const BLANK_AVAILABILITY: Availability = {
  blocked_dates: [],
  booked_dates: [],
};

export default function FreelancerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [listing, setListing] = useState<FreelancerListing | null>(null);
  const [reviews, setReviews] = useState<FreelancerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiryMsg, setInquiryMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Availability state
  const [availability, setAvailability] = useState<Availability>(BLANK_AVAILABILITY);
  const [nextAvailable, setNextAvailable] = useState<string>("");
  const [newBlockDate, setNewBlockDate] = useState<string>("");
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Determine if the current viewer owns this listing so we can show
  // the edit controls. `sub` in the JWT claims is the user_id.
  const claims = typeof window !== "undefined" ? getStoredAccessTokenClaims() : null;
  const currentUserID = claims?.sub ?? "";
  const isOwner = Boolean(listing && currentUserID && listing.user_id === currentUserID);

  useEffect(() => {
    getFreelancer(id)
      .then((res) => {
        setListing(res.data);
        setReviews(res.reviews || []);
      })
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch availability for this listing. Public endpoint — no token
  // required, so clients browsing without logging in still see the
  // "Next available" badge.
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/marketplace/freelancers/${id}/availability`)
      .then((r) => r.ok ? r.json() : null)
      .then((body) => {
        if (body?.data) {
          setAvailability({ ...BLANK_AVAILABILITY, ...body.data });
        }
        if (body?.next_available) {
          setNextAvailable(body.next_available);
        }
      })
      .catch(() => { /* silent — booked_dates is a soft signal */ });
  }, [id]);

  const saveAvailability = async (next: Availability) => {
    const token = getStoredAccessToken();
    if (!token || !isOwner) return;
    setSavingAvailability(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/marketplace/freelancers/${id}/availability`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const body = await res.json();
        setAvailability({ ...BLANK_AVAILABILITY, ...(body.data || next) });
        if (body.next_available) setNextAvailable(body.next_available);
      }
    } finally {
      setSavingAvailability(false);
    }
  };

  const addBlockedDate = () => {
    if (!newBlockDate) return;
    const next: Availability = {
      ...availability,
      blocked_dates: Array.from(new Set([...availability.blocked_dates, newBlockDate])).sort(),
    };
    setNewBlockDate("");
    saveAvailability(next);
  };

  const removeBlockedDate = (d: string) => {
    const next: Availability = {
      ...availability,
      blocked_dates: availability.blocked_dates.filter((x) => x !== d),
    };
    saveAvailability(next);
  };

  const handleSendInquiry = async () => {
    if (!inquiryMsg.trim() || !listing) return;
    setSending(true);
    setSendError(null);
    const token = getStoredAccessToken();
    try {
      await createInquiry(token, {
        type: "freelancer",
        listing_id: listing.id,
        message: inquiryMsg,
      });
      setInquirySent(true);
      setInquiryMsg("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send inquiry. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-surface-sunken rounded" />
          <div className="h-48 bg-surface-sunken rounded-xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-text-secondary">
        Freelancer not found.{" "}
        <Link href="/marketplace/freelancers" className="text-accent underline">Back to browse</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <BackButton href="/marketplace/freelancers" label="Back to freelancers" />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{listing.title}</h1>
          {listing.city && (
            <p className="text-sm text-text-secondary mt-1">{listing.city}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {listing.specializations.map((s) => (
              <span key={s} className="status-badge status-badge--neutral">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          {listing.daily_rate_paisa && (
            <div className="text-xl font-bold text-text-primary">
              ₹{(listing.daily_rate_paisa / 100).toLocaleString("en-IN")}
              <span className="text-sm font-normal text-text-secondary">/day</span>
            </div>
          )}
          <div className="flex items-center gap-1 mt-1 justify-end">
            <span className="rating-star">★</span>
            <span className="text-sm font-medium text-text-primary">
              {listing.rating_avg?.toFixed(1) || "New"}
            </span>
            <span className="text-xs text-text-secondary">({listing.review_count} reviews)</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {listing.description && (
        <div className="surface-panel p-5">
          <h2 className="text-base font-semibold text-text-primary mb-2">About</h2>
          <p className="text-sm text-text-secondary leading-relaxed">{listing.description}</p>
        </div>
      )}

      {/* Availability block — shown to everyone; edit controls only
          for the listing owner. Next-available is derived server-side
          so anonymous visitors see the same value without needing a
          token. */}
      <div className="surface-panel p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-text-primary">Availability</h2>
          {nextAvailable && (
            <span className="status-badge status-badge--success">
              Next available: {new Date(nextAvailable).toLocaleDateString("en-IN", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </span>
          )}
        </div>

        {(availability.blocked_dates.length > 0 || availability.booked_dates.length > 0) && (
          <div className="space-y-2">
            {availability.booked_dates.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Booked (synced from calendar)</p>
                <div className="flex flex-wrap gap-1.5">
                  {availability.booked_dates.map((d) => (
                    <span key={d} className="status-badge status-badge--warning">
                      {new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {availability.blocked_dates.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-secondary mb-1">Blocked (manual blackouts)</p>
                <div className="flex flex-wrap gap-1.5">
                  {availability.blocked_dates.map((d) => (
                    <span key={d} className="status-badge status-badge--neutral inline-flex items-center gap-1">
                      {new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {isOwner && (
                        <button
                          onClick={() => removeBlockedDate(d)}
                          className="text-text-secondary hover:text-error ml-1"
                          aria-label={`Unblock ${d}`}
                          disabled={savingAvailability}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isOwner && (
          <div className="flex items-center gap-2 pt-2 border-t border-border-default">
            <input
              type="date"
              value={newBlockDate}
              onChange={(e) => setNewBlockDate(e.target.value)}
              className="rounded-lg border border-border-default bg-surface-sunken px-3 py-2 text-sm text-text-primary"
            />
            <button
              onClick={addBlockedDate}
              disabled={!newBlockDate || savingAvailability}
              className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
            >
              Block date
            </button>
            <p className="text-xs text-text-tertiary ml-auto">
              Shoots you schedule on your calendar auto-block here.
            </p>
          </div>
        )}
      </div>

      {/* Send Inquiry */}
      <div className="space-y-3">
        {inquirySent ? (
          <div className="surface-panel p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-feedback-success/15 text-feedback-success text-sm">✓</span>
              <div>
                <p className="font-semibold text-on-surface text-sm">Inquiry sent!</p>
                <p className="text-sm text-text-secondary mt-0.5">
                  Your message has been delivered to the photographer. They&apos;ll respond shortly.
                </p>
              </div>
            </div>
            <button
              onClick={() => { setInquirySent(false); setShowInquiry(true); }}
              className="surface-button text-sm"
            >
              Send another inquiry
            </button>
          </div>
        ) : !showInquiry ? (
          <button
            onClick={() => setShowInquiry(true)}
            className="btn-primary px-6 py-3 text-sm"
          >
            Send Inquiry
          </button>
        ) : (
          <div className="surface-panel space-y-3 p-5">
            <h3 className="text-sm font-semibold text-text-primary">Send an inquiry</h3>
            {sendError && (
              <p className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-3 py-2 text-sm text-feedback-error">
                {sendError}
              </p>
            )}
            <textarea
              value={inquiryMsg}
              onChange={(e) => setInquiryMsg(e.target.value)}
              placeholder="Describe your event, requirements, and preferred dates..."
              className="input-base h-24 w-full resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSendInquiry}
                disabled={sending || !inquiryMsg.trim()}
                className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send"}
              </button>
              <button
                onClick={() => { setShowInquiry(false); setSendError(null); }}
                className="surface-button text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Reviews ({reviews.length})</h2>
          {reviews.map((rev) => (
            <div key={rev.id} className="surface-panel p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className={star <= rev.rating ? "rating-star" : "text-text-secondary/30"}>★</span>
                  ))}
                </div>
                <span className="text-xs text-text-secondary">
                  {new Date(rev.created_at).toLocaleDateString("en-IN")}
                </span>
              </div>
              {rev.review_text && (
                <p className="text-sm text-text-secondary">{rev.review_text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
