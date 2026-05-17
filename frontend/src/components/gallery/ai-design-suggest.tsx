"use client";

import { useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface AISuggestion {
  theme: string;
  coverStyle: string;
  fontPairing: string;
  reasoning: string;
  confidence: number;
}

function getAuthHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

interface AIDesignSuggestProps {
  galleryId: string;
  onApply: (suggestion: { theme: string; coverStyle: string; fontPairing: string }) => void;
}

export function AIDesignSuggest({ galleryId, onApply }: AIDesignSuggestProps) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRequestedSuggestions, setHasRequestedSuggestions] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    setHasRequestedSuggestions(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/ai-suggest`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "AI suggestions unavailable" }));
        setError(data.error || "Failed to get suggestions");
        return;
      }
      const data = await res.json();
      setSuggestions(data.data || []);
    } catch {
      setError("Failed to connect to AI service");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">AI Suggestions</h3>
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded-xl bg-accent-subtle text-accent-primary hover:bg-accent-muted disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Suggest Design"}
        </button>
      </div>

      {error && (
        <div className="p-2 rounded-lg bg-feedback-error/10 text-feedback-error text-xs">{error}</div>
      )}

      {suggestions.length === 0 && !loading && !error && !hasRequestedSuggestions && (
        <p className="text-xs text-text-tertiary">
          Click &quot;Suggest Design&quot; to get AI-powered recommendations based on your gallery photos.
        </p>
      )}

      {suggestions.length === 0 && !loading && !error && hasRequestedSuggestions && (
        <div className="rounded-lg border border-border-subtle bg-surface-container-low p-3 text-xs text-text-secondary">
          No design suggestions are available for this gallery yet. Run AI analysis after photos finish processing.
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map((s, i) => (
          <div key={i} className="glass-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">Option {i + 1}</span>
              <span className="text-xs text-text-tertiary">{Math.round(s.confidence * 100)}% match</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-text-tertiary block">Theme</span>
                <span className="text-text-primary font-medium">{s.theme}</span>
              </div>
              <div>
                <span className="text-text-tertiary block">Cover</span>
                <span className="text-text-primary font-medium">{s.coverStyle}</span>
              </div>
              <div>
                <span className="text-text-tertiary block">Font</span>
                <span className="text-text-primary font-medium">{s.fontPairing}</span>
              </div>
            </div>
            <p className="text-xs text-text-secondary italic">{s.reasoning}</p>
            <button
              onClick={() => onApply({ theme: s.theme, coverStyle: s.coverStyle, fontPairing: s.fontPairing })}
              className="w-full text-xs py-1.5 rounded-xl bg-accent text-text-inverse hover:bg-accent-hover"
            >
              Apply This Design
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
