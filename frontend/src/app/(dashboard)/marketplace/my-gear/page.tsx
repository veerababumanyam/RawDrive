"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getMyGearListings, deleteGearListing, type GearListing } from "@/lib/api/gear";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const CATEGORY_LABELS: Record<string, string> = {
  camera_body: "Camera Body",
  lens: "Lens",
  lighting: "Lighting",
  audio: "Audio",
  accessory: "Accessory",
};

export default function MyGearPage() {
  const token = getStoredAccessToken();
  const [gear, setGear] = useState<GearListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchGear = useCallback(async () => {
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    try {
      const data = await getMyGearListings(token);
      setGear(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gear");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchGear();
  }, [fetchGear]);

  const handleDelete = async (id: string) => {
    if (!token || deletingId) return;
    setDeletingId(id);
    try {
      await deleteGearListing(token, id);
      setGear((prev) => prev.filter((g) => g.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete listing");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface-sunken animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">My Gear</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your gear listings for rental
          </p>
        </div>
        <Link href="/marketplace/gear/new" className="btn-primary px-4 py-2.5 text-sm">
          List New Gear
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {gear.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default p-10 text-center space-y-4">
          <p className="font-medium text-text-primary">No gear listed yet</p>
          <p className="text-sm text-text-secondary">
            List your cameras, lenses, and accessories to rent them out to other photographers.
          </p>
          <Link href="/marketplace/gear/new" className="btn-primary px-5 py-2.5 text-sm">
            List Your First Gear
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {gear.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-border-default bg-surface-raised p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-text-primary truncate">
                      {entry.title}
                    </h2>
                    <span
                      className={cn(
                        "status-badge",
                        entry.is_published ? "status-badge--success" : "status-badge--neutral",
                      )}
                    >
                      {entry.is_published ? "Published" : "Draft"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="status-badge status-badge--accent">
                      {CATEGORY_LABELS[entry.category] ?? entry.category}
                    </span>
                    {entry.brand && (
                      <span className="status-badge status-badge--neutral">{entry.brand}</span>
                    )}
                    {entry.condition && (
                      <span className="status-badge status-badge--neutral">
                        {CONDITION_LABELS[entry.condition] ?? entry.condition}
                      </span>
                    )}
                    <span
                      className={cn(
                        "status-badge",
                        entry.is_available ? "status-badge--success" : "status-badge--warning",
                      )}
                    >
                      {entry.is_available ? "Available" : "Booked"}
                    </span>
                  </div>
                  {entry.city && (
                    <p className="text-xs text-text-tertiary mt-1">{entry.city}</p>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-text-primary">
                    ₹{(entry.price_paisa / 100).toLocaleString("en-IN")}
                    <span className="text-xs font-normal text-text-secondary">
                      /{entry.listing_type === "rental" ? "day" : "sale"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border-subtle">
                <Link
                  href={`/marketplace/gear/${entry.id}`}
                  className="surface-button text-sm px-3 py-1.5"
                >
                  View Listing
                </Link>

                {confirmDeleteId === entry.id ? (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm text-text-secondary">Remove this listing?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="text-sm font-medium text-feedback-error hover:underline disabled:opacity-50"
                    >
                      {deletingId === entry.id ? "Removing…" : "Yes, remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-sm text-text-secondary hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(entry.id)}
                    className="ml-auto text-sm text-text-tertiary hover:text-feedback-error transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
