"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  deleteGearListing,
  getMyGearListings,
  listGear,
  type GearListing,
} from "@/lib/api/gear";
import { getStoredAccessToken, getStoredAccessTokenClaims } from "@/lib/auth";
import { Plus, Trash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";

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

function formatCategory(category: string) {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

function formatPrice(pricePaisa: number) {
  return (pricePaisa / 100).toLocaleString("en-IN");
}

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
        if (!ignore) {
          setRequestState({ key: requestKey, gear: data, error: null });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setRequestState({
            key: requestKey,
            gear: [],
            error: err?.message || "Failed to load rental listings",
          });
        }
      });
    return () => {
      ignore = true;
    };
  }, [category, requestKey]);

  return (
    <div className="marketplace-stack">
      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <div
        aria-label="Gear rental categories"
        className="glass-segmented marketplace-category-tabs"
      >
        {CATEGORIES.map((entry) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={category === entry.value}
            onClick={() => setCategory(entry.value)}
            className="glass-segmented-option"
          >
            {entry.label}
          </button>
        ))}
      </div>

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
      ) : gear.length === 0 ? (
        <Card
          variant="panel"
          padding="none"
          className="marketplace-empty-state"
        >
          No rental listings found. Try a different category.
        </Card>
      ) : (
        <div className="marketplace-card-grid">
          {gear.map((entry) => (
            <Link
              key={entry.id}
              href={`/marketplace/gear/${entry.id}`}
              className="surface-panel card-pad-sm marketplace-listing-card marketplace-gear-card"
            >
              <div className="marketplace-gear-media">
                <span className="marketplace-gear-media__label">
                  {entry.images && entry.images.length > 0
                    ? "Image"
                    : formatCategory(entry.category)}
                </span>
              </div>
              <div className="marketplace-gear-body">
                <div className="marketplace-card-header">
                  <div className="marketplace-card-heading">
                    <h3 className="marketplace-card-title">{entry.title}</h3>
                    {entry.brand && (
                      <p className="marketplace-card-meta">{entry.brand}</p>
                    )}
                  </div>
                  <Badge variant={entry.is_available ? "success" : "warning"}>
                    {entry.is_available ? "Available" : "Booked"}
                  </Badge>
                </div>
                <div className="marketplace-badge-row">
                  <Badge variant="accent">
                    {formatCategory(entry.category)}
                  </Badge>
                  {entry.condition && (
                    <Badge variant="neutral">
                      {CONDITION_LABELS[entry.condition] ?? entry.condition}
                    </Badge>
                  )}
                </div>
                <div className="marketplace-listing-card__footer">
                  <span className="marketplace-rate">
                    ₹{formatPrice(entry.price_paisa)}
                    <span className="marketplace-rate__unit">/day</span>
                  </span>
                  {entry.city && (
                    <span className="marketplace-card-meta">{entry.city}</span>
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
  const [loading, setLoading] = useState(() => !!token);
  const [error, setError] = useState<string | null>(() =>
    token ? null : "Not authenticated",
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMyGearListings(token)
      .then((data) => {
        if (!cancelled) setGear(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load gear");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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
      <div className="marketplace-stack-sm">
        {[1, 2, 3].map((item) => (
          <Card
            key={item}
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
      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {gear.length === 0 ? (
        <Card
          variant="panel"
          padding="none"
          className="marketplace-empty-state"
        >
          <p className="marketplace-empty-state__title">No gear listed yet</p>
          <p className="marketplace-empty-state__copy">
            List your cameras, lenses, and accessories to rent them out to other
            photographers.
          </p>
          <Link
            href="/marketplace/gear/new"
            className="glass-button glass-button--primary glass-button--md"
          >
            <span>List Your First Gear</span>
          </Link>
        </Card>
      ) : (
        <div className="marketplace-stack-sm">
          {gear.map((entry) => (
            <Card
              key={entry.id}
              variant="panel"
              padding="none"
              className="marketplace-profile-card marketplace-gear-row"
            >
              <div className="marketplace-card-header">
                <div className="marketplace-card-heading">
                  <div className="marketplace-title-row">
                    <h2 className="marketplace-card-title">{entry.title}</h2>
                    <Badge variant={entry.is_published ? "success" : "neutral"}>
                      {entry.is_published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <div className="marketplace-badge-row">
                    <Badge variant="accent">
                      {formatCategory(entry.category)}
                    </Badge>
                    {entry.brand && (
                      <Badge variant="neutral">{entry.brand}</Badge>
                    )}
                    {entry.condition && (
                      <Badge variant="neutral">
                        {CONDITION_LABELS[entry.condition] ?? entry.condition}
                      </Badge>
                    )}
                    <Badge variant={entry.is_available ? "success" : "warning"}>
                      {entry.is_available ? "Available" : "Booked"}
                    </Badge>
                  </div>
                  {entry.city && (
                    <p className="marketplace-card-meta">{entry.city}</p>
                  )}
                </div>
                <span className="marketplace-rate">
                  ₹{formatPrice(entry.price_paisa)}
                  <span className="marketplace-rate__unit">
                    /{entry.listing_type === "rental" ? "day" : "sale"}
                  </span>
                </span>
              </div>

              <div className="marketplace-action-row">
                <Link
                  href={`/marketplace/gear/${entry.id}`}
                  className="glass-button glass-button--surface glass-button--sm"
                >
                  <span>View</span>
                </Link>
                <Link
                  href={`/marketplace/gear/${entry.id}/edit`}
                  className="glass-button glass-button--surface glass-button--sm"
                >
                  <span>Edit</span>
                </Link>

                {confirmDeleteId === entry.id ? (
                  <div className="marketplace-confirm-inline">
                    <span className="marketplace-confirm-copy">
                      Remove this listing?
                    </span>
                    <GlassButton
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                    >
                      {deletingId === entry.id ? "Removing…" : "Yes, remove"}
                    </GlassButton>
                    <GlassButton
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </GlassButton>
                  </div>
                ) : (
                  <GlassButton
                    type="button"
                    variant="quiet"
                    size="sm"
                    icon={<Trash aria-hidden="true" />}
                    className="marketplace-action-row__end"
                    onClick={() => setConfirmDeleteId(entry.id)}
                  >
                    Remove
                  </GlassButton>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CameraRentalsPage() {
  const [tab, setTab] = useState<Tab>("gear-rental");

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Camera Rentals"
        description="Rent cameras, lenses, lighting, and accessories from other photographers."
        actions={
          <Link
            href="/marketplace/gear/new"
            className="glass-button glass-button--primary glass-button--md"
          >
            <span className="glass-button__icon">
              <Plus aria-hidden="true" />
            </span>
            <span>List Your Gear</span>
          </Link>
        }
      />

      <div
        role="tablist"
        aria-label="Camera rental marketplace sections"
        className="glass-segmented marketplace-page-tabs"
      >
        {(
          [
            { id: "gear-rental", label: "Gear Rental" },
            { id: "my-gear", label: "My Gear" },
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
        {tab === "gear-rental" ? <GearRentalTab /> : <MyGearTab />}
      </div>
    </PageContainer>
  );
}
