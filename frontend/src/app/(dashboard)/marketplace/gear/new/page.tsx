"use client";

import { useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { createGearListing } from "@/lib/api/gear";

const CATEGORY_OPTIONS = [
  { value: "camera_body", label: "Camera body" },
  { value: "lens", label: "Lens" },
  { value: "lighting", label: "Lighting" },
  { value: "audio", label: "Audio" },
  { value: "accessory", label: "Accessory" },
];

export default function GearListingEditorPage() {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      const listing = await createGearListing(token, {
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

      window.location.assign(`/marketplace/gear/${listing.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create listing.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">List Your Gear</h1>
        <p className="text-sm text-text-secondary">
          Create a rental or sale listing that can be discovered directly from the protected marketplace.
        </p>
      </div>

      {error && (
        <div
          className="surface-panel p-4 text-sm"
          style={{ borderColor: "color-mix(in srgb, var(--feedback-error) 24%, transparent)", color: "var(--feedback-error)" }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="surface-panel space-y-6 p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Listing type</span>
            <select
              value={listingType}
              onChange={(event) => setListingType(event.target.value)}
              className="input-base w-full"
            >
              <option value="rental">Rental</option>
              <option value="sale">Sale</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
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
              onChange={(event) => setTitle(event.target.value)}
              className="input-base w-full"
              placeholder="Sony A7 IV body with extra batteries"
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Brand</span>
            <input
              type="text"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              className="input-base w-full"
              placeholder="Sony"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Model</span>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="input-base w-full"
              placeholder="A7 IV"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Condition</span>
            <input
              type="text"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className="input-base w-full"
              placeholder="Excellent"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">
              {listingType === "rental" ? "Daily price" : "Sale price"}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="input-base w-full"
              placeholder="85"
              required
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-text-primary">City</span>
            <input
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="input-base w-full"
              placeholder="Berlin"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-text-primary">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="input-base min-h-32 w-full resize-y"
              placeholder="Mention pickup terms, accessories included, and any insurance requirements."
            />
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-4 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="h-4 w-4"
          />
          Publish this listing immediately.
        </label>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="btn-primary px-4 py-2.5 text-sm">
            {saving ? "Creating listing..." : "Create listing"}
          </button>
          <button
            type="button"
            className="surface-button text-sm"
            onClick={() => window.location.assign("/marketplace/gear")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
