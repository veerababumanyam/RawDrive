"use client";

import { useCallback, useEffect, useState } from "react";

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
  const token = typeof window !== "undefined" ? localStorage.getItem("rawdrive_token") : null;
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
      const res = await fetch(`${API_BASE}/api/v1/galleries/templates`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.data || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSave = async () => {
    if (!saveName.trim() || !currentConfig) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/galleries/templates`, {
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
      await fetch(`${API_BASE}/api/v1/galleries/templates/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      fetchTemplates();
    } catch { /* ignore */ }
  };

  if (loading) return <div className="text-sm text-text-tertiary p-4">Loading templates...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Templates</h3>
        <button
          onClick={() => setShowSave(!showSave)}
          className="text-xs text-accent-primary hover:underline"
        >
          {showSave ? "Cancel" : "Save Current"}
        </button>
      </div>

      {showSave && (
        <div className="flex gap-2">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Template name..."
            className="input-base flex-1 text-sm min-h-[44px]"
            aria-label="Template name"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="px-3 py-2 text-sm rounded-xl bg-accent-default text-text-inverse disabled:opacity-50"
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
