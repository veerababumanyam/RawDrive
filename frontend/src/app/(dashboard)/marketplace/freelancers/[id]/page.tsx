"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getFreelancer, createInquiry, type FreelancerListing, type FreelancerReview } from "@/lib/api/marketplace";

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
    const token = localStorage.getItem("rawdrive_token") || "";
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
              <span key={s} className="px-2.5 py-1 text-xs rounded-full bg-white/5 border border-white/10 text-text-secondary">
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
            <span className="text-yellow-400">★</span>
            <span className="text-sm font-medium text-text-primary">
              {listing.rating_avg?.toFixed(1) || "New"}
            </span>
            <span className="text-xs text-text-secondary">({listing.review_count} reviews)</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {listing.description && (
        <div className="p-5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
          <h2 className="text-base font-semibold text-text-primary mb-2">About</h2>
          <p className="text-sm text-text-secondary leading-relaxed">{listing.description}</p>
        </div>
      )}

      {/* Send Inquiry */}
      <div className="space-y-3">
        {!showInquiry ? (
          <button
            onClick={() => setShowInquiry(true)}
            className="px-6 py-3 rounded-xl bg-accent text-white font-medium hover:opacity-90 transition-opacity min-h-[44px]"
          >
            Send Inquiry
          </button>
        ) : (
          <div className="p-5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Send an inquiry</h3>
            <textarea
              value={inquiryMsg}
              onChange={(e) => setInquiryMsg(e.target.value)}
              placeholder="Describe your event, requirements, and preferred dates..."
              className="w-full h-24 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-primary text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSendInquiry}
                disabled={sending || !inquiryMsg.trim()}
                className="px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
              >
                {sending ? "Sending..." : "Send"}
              </button>
              <button
                onClick={() => setShowInquiry(false)}
                className="px-4 py-2.5 rounded-lg border border-border-default text-text-secondary text-sm hover:bg-surface-sunken min-h-[44px]"
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
            <div key={rev.id} className="p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className={star <= rev.rating ? "text-yellow-400" : "text-text-secondary/30"}>★</span>
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
