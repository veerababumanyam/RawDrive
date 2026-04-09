"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStream } from "@/lib/api/streams";
import { getStoredAccessToken } from "@/lib/auth";

export default function NewStreamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [maxQuality, setMaxQuality] = useState("1080p");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Stream title is required");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const token = getStoredAccessToken();
      await createStream(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_at: scheduledAt || undefined,
        pin_code: pinCode || undefined,
        max_quality: maxQuality,
        chat_enabled: chatEnabled,
      });
      router.push("/streams");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create stream");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">Create Live Stream</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-text-primary mb-1.5">
            Stream Title *
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Sharma-Patel Wedding Live"
            className="w-full rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-text-primary mb-1.5">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Event details for viewers..."
            rows={3}
            className="w-full rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        <div>
          <label htmlFor="scheduledAt" className="block text-sm font-medium text-text-primary mb-1.5">
            Scheduled Start Time
          </label>
          <input
            id="scheduledAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxQuality" className="block text-sm font-medium text-text-primary mb-1.5">
              Max Quality
            </label>
            <select
              id="maxQuality"
              value={maxQuality}
              onChange={(e) => setMaxQuality(e.target.value)}
              className="w-full rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]"
            >
              <option value="1080p">1080p (Full HD)</option>
              <option value="720p">720p (HD)</option>
              <option value="480p">480p (SD)</option>
            </select>
          </div>

          <div>
            <label htmlFor="pinCode" className="block text-sm font-medium text-text-primary mb-1.5">
              PIN Code (optional)
            </label>
            <input
              id="pinCode"
              type="text"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              placeholder="4-6 digit PIN"
              maxLength={6}
              className="w-full rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={chatEnabled}
            onClick={() => setChatEnabled(!chatEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              chatEnabled ? "bg-accent" : "bg-surface-sunken"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                chatEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-text-primary">Enable live chat</span>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-raised transition-colors min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            {submitting ? "Creating..." : "Create Stream"}
          </button>
        </div>
      </form>
    </div>
  );
}
