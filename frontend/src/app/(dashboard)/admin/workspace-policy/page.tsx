"use client";

import { useCallback, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  getWorkspaceUploadPolicy,
  setWorkspaceUploadPolicy,
  type UploadPolicyMode,
} from "@/lib/api/admin";

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S2 — Workspace upload policy selector (admin).
//
// Surfaces the three policy modes (standard / strict_client_scan /
// strict_original_preservation) with a short description of each so the
// admin knows exactly what they are opting their workspace into.
//
// Uses the shared design tokens via semantic Tailwind classes — never raw
// colour primitives. Follows the same pattern as the audit-logs and
// moderation pages.
// ─────────────────────────────────────────────────────────────────────────────

interface ModeOption {
  value: UploadPolicyMode;
  label: string;
  description: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "standard",
    label: "Standard",
    description:
      "Browser screening is telemetry-only. Missing manifests are logged but not blocked. Best for small studios and experimentation.",
  },
  {
    value: "strict_client_scan",
    label: "Strict client scan",
    description:
      "Browser screening required for every upload. JPEG, PNG, WebP, GIF, HEIC/HEIF, AVIF, and common camera RAW must produce a passing local scan before the session opens. TIFF and unsupported RAW require RawDrive Desktop.",
  },
  {
    value: "strict_original_preservation",
    label: "Strict original preservation",
    description:
      "All originals require a signed manifest from RawDrive Desktop or the CLI. Browser-only uploads are rejected. Intended for archive-quality wedding and editorial work.",
  },
];

export default function WorkspacePolicyPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [currentMode, setCurrentMode] = useState<UploadPolicyMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPolicy = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      const resp = await getWorkspaceUploadPolicy(token, workspaceId);
      setCurrentMode(resp.mode);
    } catch (e) {
      setError((e as Error).message);
      setCurrentMode(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const handleSelect = async (mode: UploadPolicyMode) => {
    if (!workspaceId) {
      setError("Enter a workspace ID first");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = getStoredAccessToken();
      const resp = await setWorkspaceUploadPolicy(token, workspaceId, mode);
      setCurrentMode(resp.mode);
      setSuccess(`Workspace is now in "${resp.mode}" mode`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-8">
      <div>
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
          Workspace Upload Policy
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          M16 Tier D — configure how strictly incoming uploads are screened for
          this workspace. Changes take effect on the next upload.
        </p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label
            htmlFor="workspace-id"
            className="block text-xs font-label uppercase tracking-wide text-text-secondary mb-2"
          >
            Workspace ID
          </label>
          <input
            id="workspace-id"
            type="text"
            value={workspaceId}
            onChange={(e) => {
              setWorkspaceId(e.target.value);
              setSuccess(null);
            }}
            placeholder="e.g. 11111111-1111-1111-1111-111111111111"
            className="w-full rounded-lg border border-surface-raised bg-surface-sunken px-4 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          type="button"
          onClick={loadPolicy}
          disabled={!workspaceId || loading}
          className="rounded-lg bg-surface-raised px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-raised/80 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-feedback-success/30 bg-feedback-success/10 px-4 py-3 text-sm text-feedback-success">
          {success}
        </div>
      )}

      <div className="space-y-3">
        {MODE_OPTIONS.map((opt) => {
          const active = currentMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              disabled={saving}
              className={`w-full text-left rounded-xl border px-5 py-4 transition-all ${
                active
                  ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                  : "border-surface-raised bg-surface-raised/40 hover:bg-surface-raised/70"
              } ${saving ? "opacity-50 cursor-wait" : ""}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-on-surface">{opt.label}</span>
                {active && (
                  <span className="text-xs font-label uppercase tracking-wide text-accent">
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary">{opt.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
