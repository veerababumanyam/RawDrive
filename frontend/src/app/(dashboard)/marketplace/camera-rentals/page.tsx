"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { listGear, getMyGearListings, deleteGearListing, type GearListing } from "@/lib/api/gear";
import { getStoredAccessTokenClaims, getStoredAccessToken } from "@/lib/auth";
import { availabilityClasses } from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";
import { Plus } from "@/components/icons";

type Tab = "gear-rental" | "my-gear";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "camera_body", label: "Camera Bodies" },
  { value: "lens", label: "Lenses" },
  { value: "lighting", label: "Lighting" },
  { value: "audio", label: "Audio" },
  { value: "accessory", label: "Accessories" },
];

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

function GearRentalTab() {
  const myUserID =
    typeof window !== "undefined"
      ? (getStoredAccessTokenClaims()?.sub ?? "")
      : "";

  const [category, setCategory] = useState("");
  const requestKey = category || "__all__";
  const [requestState, setRequestState] = useState<{
    key: string;
    gear: GearListing[];
    error: string | null;
  }>({ key: "", gear: [], error: null });

  const allGear = requestState.key === requestKey ? requestState.gear : [];
  const error = requestState.key === requestKey ? requestState.error : null;
  const loading = requestState.key !== requestKey;

  const gear = allGear.filter(
    (item) =>
      item.listing_type === "rental" &&
      (myUserID === "" || item.user_id !== myUserID),
  );

  useEffect(() => {
    let ignore = false;
    listGear({ category: category || undefined })
      .then((data) => {
        if (!ignore) setRequestState({ key: requestKey, gear: data, error: null });
      })
      .catch((err) => {
        if (!ignore)
          setRequestState({
            key: requestKey,
            gear: [],
            error: err?.message || "Failed to load rental listings",
          });
      });
    return () => { ignore = true; };
  }, [category, requestKey]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

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
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-surface-sunken rounded-xl animate-pulse" />
          ))}
        </div>
      ) : gear.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          No rental listings found. Try a different category.
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
                  <span className="text-text-secondary text-xs">
                    {entry.category.replace(/_/g, " ")}
                  </span>
                </div>
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary leading-snug">
                    {entry.title}
                  </h3>
                  <span
                    className={cn(
                      "shrink-0",
                      availabilityClasses[entry.is_available ? "available" : "unavailable"],
                    )}
                  >
                    {entry.is_available ? "Available" : "Booked"}
                  </span>
                </div>
                {entry.brand && (
                  <span className="status-badge status-badge--neutral">{entry.brand}</span>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-base font-bold text-text-primary">
                    ₹{(entry.price_paisa / 100).toLocaleString("en-IN")}
                    <span className="text-xs font-normal text-text-secondary">/day</span>
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

function MyGearTab() {
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

  useEffect(() => { fetchGear(); }, [fetchGear]);

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
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface-sunken animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                  View
                </Link>
                <Link
                  href={`/marketplace/gear/${entry.id}/edit`}
                  className="surface-button text-sm px-3 py-1.5"
                >
                  Edit
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

export default function CameraRentalsPage() {
  const [tab, setTab] = useState<Tab>("gear-rental");

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Camera Rentals</h1>
          <p className="text-sm text-text-secondary mt-1">
            Rent cameras, lenses, lighting, and accessories from other photographers
          </p>
        </div>
        <Link href="/marketplace/gear/new" className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm">
          <Plus className="h-4 w-4" />
          List Your Gear
        </Link>
      </div>

      <div className="flex gap-2 border-b border-border-default pb-0">
        {([
          { id: "gear-rental", label: "Gear Rental" },
          { id: "my-gear", label: "My Gear" },
        ] as const).map(({ id, label }) => (
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

      {tab === "gear-rental" ? <GearRentalTab /> : <MyGearTab />}
    </div>
  );
}
