"use client";

import { useEffect, useState } from "react";
import { getAIConfig, saveAIConfig, validateAIKey, type AIConfig } from "@/lib/api/ai";

interface BYOKSetupProps {
  token: string;
}

export function BYOKSetup({ token }: BYOKSetupProps) {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.0-flash");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validResult, setValidResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getAIConfig(token)
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.model_preference) setModel(cfg.model_preference);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError("");
    try {
      await saveAIConfig(token, apiKey.trim(), model);
      const updated = await getAIConfig(token);
      setConfig(updated);
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidResult(null);
    try {
      const result = await validateAIKey(token);
      setValidResult(result);
    } catch (err) {
      setValidResult({ valid: false, error: err instanceof Error ? err.message : "Validation failed" });
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Gemini API Key</h3>
        <p className="text-sm text-text-secondary">
          Provide your own Google Gemini API key to enable AI features. Your key is encrypted and never shared.
        </p>
      </div>

      {config?.configured && (
        <div className="flex items-center gap-3 rounded-lg bg-surface-sunken px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm text-text-primary">Key configured: {config.key_masked}</span>
          <span className="text-xs text-text-tertiary ml-auto">Model: {config.model_preference}</span>
        </div>
      )}

      <div className="space-y-3">
        <label className="block text-sm font-medium text-text-primary">
          {config?.configured ? "Replace API Key" : "API Key"}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:ring-2 focus:ring-accent min-h-[44px]"
        />

        <label className="block text-sm font-medium text-text-primary">Model Preference</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2.5 text-sm text-text-primary focus:ring-2 focus:ring-accent min-h-[44px]"
        >
          <option value="gemini-2.0-flash">Gemini 2.0 Flash (recommended)</option>
          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro (higher cost)</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={!apiKey.trim() || saving}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 min-h-[44px]"
        >
          {saving ? "Saving..." : "Save Key"}
        </button>

        {config?.configured && (
          <button
            onClick={handleValidate}
            disabled={validating}
            className="rounded-lg border border-border-default px-5 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken disabled:opacity-50 min-h-[44px]"
          >
            {validating ? "Validating..." : "Test Key"}
          </button>
        )}
      </div>

      {validResult && (
        <div className={`rounded-lg px-4 py-3 text-sm ${validResult.valid ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
          {validResult.valid ? "Key is valid and working." : `Key validation failed: ${validResult.error}`}
        </div>
      )}
    </div>
  );
}
