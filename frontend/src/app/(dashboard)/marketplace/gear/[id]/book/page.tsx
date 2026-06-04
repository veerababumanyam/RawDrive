"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { createGearBooking, getGear, type GearListing } from "@/lib/api/gear";

export default function GearBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [gear, setGear] = useState<GearListing | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadGear = async () => {
      setLoading(true);
      setError("");

      try {
        const listing = await getGear(id);
        if (!cancelled) {
          setGear(listing);
        }
      } catch (loadError) {
        if (!cancelled) {
          setGear(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load gear listing.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadGear();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const totalDays = useMemo(() => {
    if (!startDate || !endDate) {
      return 0;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return 0;
    }

    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [endDate, startDate]);

  const totalPaisa = gear ? totalDays * gear.price_paisa : 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const token = getStoredAccessToken();
    if (!token) {
      setError("Your session expired. Please sign in again.");
      return;
    }

    if (!gear || !gear.is_available || gear.listing_type !== "rental") {
      setError("This listing is not currently bookable.");
      return;
    }

    if (!startDate || !endDate || totalDays < 1) {
      setError("Please choose a valid booking range.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await createGearBooking(token, gear.id, {
        start_date: startDate,
        end_date: endDate,
        total_paisa: totalPaisa,
        deposit_paisa: 0,
        message: message || undefined,
      });
      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create booking request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-surface-sunken" />
          <div className="h-96 rounded-2xl bg-surface-sunken" />
        </div>
      </div>
    );
  }

  if (!gear) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">
          {error || "Gear listing not found."}
        </p>
        <Link
          href="/marketplace/gear"
          className="btn-tertiary mt-4 px-3 py-2 text-sm"
        >
          Back to gear
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="surface-panel space-y-4 p-8 text-center">
          <span className="status-badge status-badge--success">
            Request submitted
          </span>
          <h1 className="text-2xl font-semibold text-text-primary">
            Booking request sent
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">
            RawDrive created the booking request and reserved the date range in
            the workflow. Deposit handling is still manual, so the owner can
            confirm those details in follow-up.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={`/marketplace/gear/${gear.id}`}
              className="btn-primary px-4 py-2.5 text-sm"
            >
              Back to listing
            </Link>
            <Link href="/messages" className="surface-button text-sm">
              Open messages
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <Link
          href={`/marketplace/gear/${gear.id}`}
          className="btn-tertiary px-0 py-0 text-sm"
        >
          Back to listing
        </Link>
        <h1 className="text-2xl font-semibold text-text-primary">
          Book {gear.title}
        </h1>
        <p className="text-sm text-text-secondary">
          Request this rental directly from the protected marketplace workflow.
        </p>
      </div>

      {error && (
        <div
          className="surface-panel p-4 text-sm"
          style={{
            borderColor:
              "color-mix(in srgb, var(--feedback-error) 24%, transparent)",
            color: "var(--feedback-error)",
          }}
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <form onSubmit={handleSubmit} className="surface-panel space-y-6 p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">
                Start date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="input-base w-full"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">
                End date
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="input-base w-full"
                required
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">
              Message to owner
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="input-base min-h-32 w-full resize-y"
              placeholder="Share your shoot dates, pickup preference, and any insurance details."
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary px-4 py-2.5 text-sm"
            >
              {submitting ? "Submitting request..." : "Request booking"}
            </button>
            <Link
              href={`/marketplace/gear/${gear.id}`}
              className="surface-button text-sm"
            >
              Cancel
            </Link>
          </div>
        </form>

        <aside className="surface-panel space-y-4 p-5">
          <h2 className="text-lg font-semibold text-text-primary">
            Booking summary
          </h2>
          <div className="space-y-2 text-sm text-text-secondary">
            <div className="flex items-center justify-between">
              <span>Daily rate</span>
              <span className="font-medium text-text-primary">
                INR {(gear.price_paisa / 100).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Rental days</span>
              <span className="font-medium text-text-primary">
                {totalDays || "Select dates"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Estimated total</span>
              <span className="font-semibold text-text-primary">
                INR {(totalPaisa / 100).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-surface-container-low p-4 text-sm leading-relaxed text-text-secondary">
            Deposits are not collected through this flow yet, so RawDrive sends
            the booking request with a zero deposit and lets the owner confirm
            that manually.
          </div>
        </aside>
      </div>
    </div>
  );
}
