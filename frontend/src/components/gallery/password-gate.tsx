"use client";

import { useState } from "react";
import { verifyGalleryPassword } from "@/lib/api/proofing";

interface PasswordGateProps {
  slug: string;
  studioName?: string;
  studioLogo?: string;
  onAuthenticated: (token: string) => void;
}

export function PasswordGate({ slug, studioName, studioLogo, onAuthenticated }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { token } = await verifyGalleryPassword(slug, password);
      onAuthenticated(token);
    } catch {
      // Generic error message to avoid gallery existence leak (GAL-FR-104)
      setError("Invalid password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center glass-surface">
      <div className="w-full max-w-md p-8 glass-card rounded-2xl shadow-glass">
        {/* Studio branding */}
        <div className="text-center mb-8">
          {studioLogo ? (
            <img src={studioLogo} alt={studioName || "Studio"} className="h-16 mx-auto mb-4 object-contain" />
          ) : (
            <div className="w-16 h-16 mx-auto mb-4 rounded-full glass-surface flex items-center justify-center">
              <span className="text-2xl">📸</span>
            </div>
          )}
          {studioName && <h2 className="text-lg font-medium text-primary">{studioName}</h2>}
          <p className="text-sm text-secondary mt-2">Enter the password to view this gallery</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Gallery password"
              className="w-full px-4 py-3 rounded-xl glass-surface border border-glass-border text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
              aria-label="Gallery password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl bg-accent text-white font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "View Gallery"}
          </button>
        </form>
      </div>
    </div>
  );
}
