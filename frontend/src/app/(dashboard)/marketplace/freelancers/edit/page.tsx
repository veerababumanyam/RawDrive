"use client";

import { useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { createFreelancerListing } from "@/lib/api/marketplace";
import { cn } from "@/lib/utils";

const SPECIALIZATIONS = [
  "wedding",
  "portrait",
  "event",
  "drone",
  "aerial",
  "commercial",
  "fashion",
];

export default function FreelancerProfileEditorPage() {
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [description, setDescription] = useState("");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [isPublished, setIsPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleSpecialization = (value: string) => {
    setSpecializations((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  };

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
      const listing = await createFreelancerListing(token, {
        title,
        city: city || undefined,
        specializations,
        daily_rate_paisa: dailyRate ? Math.round(Number(dailyRate) * 100) : undefined,
        description: description || undefined,
        is_published: isPublished,
      });

      window.location.assign(`/marketplace/freelancers/${listing.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save profile.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">Create Freelancer Profile</h1>
        <p className="text-sm text-text-secondary">
          Publish a profile that clients can browse, shortlist, and contact from the marketplace.
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
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-text-primary">Headline</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="input-base w-full"
              placeholder="Destination wedding photographer"
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">City</span>
            <input
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="input-base w-full"
              placeholder="Berlin"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Daily rate</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={dailyRate}
              onChange={(event) => setDailyRate(event.target.value)}
              className="input-base w-full"
              placeholder="1200"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-text-primary">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="input-base min-h-32 w-full resize-y"
              placeholder="Share the kind of work you shoot, turnaround expectations, and what clients can expect."
            />
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-text-primary">Specializations</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Choose the work you want this listing to surface for.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SPECIALIZATIONS.map((specialization) => (
              <button
                key={specialization}
                type="button"
                onClick={() => toggleSpecialization(specialization)}
                className={cn(
                  "segmented-control-button capitalize",
                  specializations.includes(specialization)
                    ? "segmented-control-button--active"
                    : "segmented-control-button--inactive",
                )}
              >
                {specialization}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-4 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="h-4 w-4"
          />
          Publish this profile as soon as it is created.
        </label>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="btn-primary px-4 py-2.5 text-sm">
            {saving ? "Saving profile..." : "Create profile"}
          </button>
          <button
            type="button"
            className="surface-button text-sm"
            onClick={() => window.location.assign("/marketplace/freelancers")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
