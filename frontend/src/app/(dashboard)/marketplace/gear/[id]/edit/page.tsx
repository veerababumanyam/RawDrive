"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { getGear, updateGearListing } from "@/lib/api/gear";
import { getStoredAccessToken } from "@/lib/auth";
import { BackButton } from "@/components/ui/back-button";

const CATEGORY_OPTIONS = [
  { value: "camera_body", label: "Camera body" },
  { value: "lens", label: "Lens" },
  { value: "lighting", label: "Lighting" },
  { value: "audio", label: "Audio" },
  { value: "accessory", label: "Accessory" },
];

export default function GearEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [listingType, setListingType] = useState("rental");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("camera_body");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  useEffect(() => {
    getGear(id)
      .then((gear) => {
        setListingType(gear.listing_type);
        setTitle(gear.title);
        setCategory(gear.category);
        setBrand(gear.brand ?? "");
        setModel(gear.model ?? "");
        setCondition(gear.condition ?? "");
        setPrice(String(gear.price_paisa / 100));
        setCity(gear.city ?? "");
        setDescription(gear.description ?? "");
        setIsPublished(gear.is_published);
      })
      .catch(() => setError("Failed to load listing."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = getStoredAccessToken();
    if (!token) {
      setError("Your session expired. Please sign in again.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateGearListing(token, id, {
        listing_type: listingType,
        title,
        category,
        brand: brand || undefined,
        model: model || undefined,
        condition: condition || undefined,
        price_paisa: Math.round(Number(price || 0) * 100),
        description: description || undefined,
        images: [],
        city: city || undefined,
        is_published: isPublished,
      });
      router.push("/marketplace/camera-rentals");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save listing.",
      );
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-surface-sunken animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <BackButton href={`/marketplace/gear/${id}`} label="Back to listing" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">
          Edit Listing
        </h1>
        <p className="text-sm text-text-secondary">
          Update your gear listing details.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="surface-panel space-y-6 p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">
              Listing type
            </span>
            <select
              value={listingType}
              onChange={(e) => setListingType(e.target.value)}
              className="input-base w-full"
            >
              <option value="rental">Rental</option>
              <option value="sale">Sale</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-base w-full"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-text-primary">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-base w-full"
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Brand</span>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="input-base w-full"
              placeholder="Sony"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Model</span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input-base w-full"
              placeholder="A7 IV"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">
              Condition
            </span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="input-base w-full"
            >
              <option value="">Select condition</option>
              <option value="new">New</option>
              <option value="like_new">Like New</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">
              {listingType === "rental" ? "Daily price (₹)" : "Sale price (₹)"}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="input-base w-full"
              required
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-text-primary">City</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input-base w-full"
              placeholder="Mumbai"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-text-primary">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-base min-h-32 w-full resize-y"
              placeholder="Mention pickup terms, accessories included, and any insurance requirements."
            />
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-4 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4"
          />
          Publish this listing.
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-4 py-2.5 text-sm"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="surface-button text-sm"
            onClick={() => router.back()}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
