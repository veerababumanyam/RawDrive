"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getFreelancer, createInquiry, type FreelancerListing, type FreelancerReview } from "@/lib/api/marketplace";
import { getStoredAccessToken } from "@/lib/auth";

export default function FreelancerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [listing, setListing] = useState<FreelancerListing | null>(null);
  const [reviews, setReviews] = useState<FreelancerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiryMsg, setInquiryMsg] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getFreelancer(id)
      .then((res) => {
        setListing(res.data);
        setReviews(res.reviews || []);
      })
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSendInquiry = async () => {
    if (!inquiryMsg.trim() || !listing) return;
    setSending(true);
    const token = getStoredAccessToken();
    await createInquiry(token, {
      type: "freelancer",
      listing_id: listing.id,
      message: inquiryMsg,
    });
    setSending(false);
    setShowInquiry(false);
    setInquiryMsg("");
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

      {/* Send Inquiry */}
      <div className="space-y-3">
        {!showInquiry ? (
          <button
            onClick={() => setShowInquiry(true)}
            className="btn-primary px-6 py-3 text-sm"
          >
            Send Inquiry
          </button>
        ) : (
          <div className="surface-panel space-y-3 p-5">
            <h3 className="text-sm font-semibold text-text-primary">Send an inquiry</h3>
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
                onClick={() => setShowInquiry(false)}
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
