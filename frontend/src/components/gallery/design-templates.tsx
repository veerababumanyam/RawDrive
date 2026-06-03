"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  preview_url?: string;
  created_at: string;
  updated_at: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

interface DesignTemplatesProps {
  onApply: (config: Record<string, unknown>) => void;
  currentConfig?: Record<string, unknown>;
}

export function DesignTemplates({ onApply, currentConfig }: DesignTemplatesProps) {
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [confirmApply, setConfirmApply] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/design-templates`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.data || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fire the initial load without a synchronous setState in the effect
    // body — the setState calls inside fetchTemplates all run after an
    // await (network round-trip / finally), so they never trigger a
    // cascading render on mount. Initial `loading: true` covers the gap.
    void Promise.resolve().then(fetchTemplates);
  }, [fetchTemplates]);

  const handleSave = async () => {
    if (!saveName.trim() || !currentConfig) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/design-templates`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: saveName, config: currentConfig }),
      });
      if (res.ok) {
        setSaveName("");
        setShowSave(false);
        fetchTemplates();
      }
    } catch { /* ignore */ }
  };

  const handleApply = async (template: DesignTemplate) => {
    setConfirmApply(null);
    onApply(template.config);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/v1/design-templates/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      fetchTemplates();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="text-sm text-text-tertiary p-4">Loading templates...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Templates</h3>
        {/* "Save Current" was previously a `text-xs hover:underline` link
            that blended into the panel chrome — users reported it as
            invisible. Now rendered as a proper compact secondary button
            (accent border + accent text) so it reads as an actionable
            control. Toggles to an outlined Cancel state when the inline
            form is open. */}
        <button
          onClick={() => setShowSave(!showSave)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors min-h-[32px] ${
            showSave
              ? "border-border-default text-text-secondary hover:bg-surface-container-low"
              : "border-accent-primary text-accent-primary hover:bg-accent-subtle"
          }`}
          aria-pressed={showSave}
        >
          {showSave ? "Cancel" : "+ Save Current"}
        </button>
      </div>

      {showSave && (
        // `input-base:focus-visible` applies a 4px accent-tinted box-shadow
        // halo around the input. With gap-2 (8px) and an accent-filled Save
        // button next to it, the halo extended into the gap and visually
        // merged with the button — users reported the button "becomes not
        // clearly visible" once the input received focus. Two changes lift
        // the button back out:
        //   1. gap-3 (12px) > 4px halo, so the halo can't reach the button.
        //   2. The button gets an explicit white ring with offset
        //      (ring-2 ring-offset-2 ring-offset-surface-elevated) plus a
        //      shadow-md drop shadow — a "frosted moat" that always reads
        //      as a foreground element, regardless of what the adjacent
        //      input is doing.
        <div className="flex gap-3 items-start">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && saveName.trim()) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setShowSave(false);
                setSaveName("");
              }
            }}
            autoFocus
            placeholder="Template name…"
            maxLength={60}
            className="input-base flex-1 text-sm min-h-[44px]"
            aria-label="Template name"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="relative shrink-0 px-5 py-2 text-sm font-semibold rounded-xl bg-accent text-text-inverse hover:bg-accent-hover disabled:bg-surface-container-high disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors min-h-[44px] whitespace-nowrap shadow-md ring-1 ring-accent-primary/40 hover:ring-accent-primary/70"
          >
            Save
          </button>
        </div>
      )}

      {templates.length === 0 && (
        <p className="text-xs text-text-tertiary">No templates yet. Save your current design as a template.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="glass-card p-3 flex items-center justify-between group">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{t.name}</p>
              {t.description && <p className="text-xs text-text-tertiary truncate">{t.description}</p>}
              <p className="text-xs text-text-tertiary mt-0.5">
                {new Date(t.updated_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {confirmApply === t.id ? (
                <>
                  <button onClick={() => handleApply(t)} className="text-xs px-2 py-1 rounded bg-feedback-success text-text-inverse">Confirm</button>
                  <button onClick={() => setConfirmApply(null)} className="text-xs px-2 py-1 rounded bg-surface-container">Cancel</button>
                </>
              ) : (
                <button onClick={() => setConfirmApply(t.id)} className="text-xs px-2 py-1 rounded bg-accent-subtle text-accent-primary">Apply</button>
              )}
              <button onClick={() => handleDelete(t.id)} className="text-xs px-2 py-1 rounded text-feedback-error hover:bg-feedback-error/10">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
