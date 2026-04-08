"use client";

import { useState } from "react";
import { getStoredAccessToken, getStoredWorkspaceId } from "@/lib/auth";
import { testStorageConnection, type StorageConfig } from "@/lib/api/storage";
import { cn } from "@/lib/utils";

const initialConfig: StorageConfig = {
  driver: "local",
  local_dir: "",
  bucket: "",
  region: "",
  endpoint: "",
  access_key: "",
  secret_key: "",
};

type Notice = {
  tone: "success" | "danger";
  message: string;
};

export default function StorageSettingsPage() {
  const [config, setConfig] = useState<StorageConfig>(initialConfig);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const isLocalDriver = config.driver === "local";

  const updateField = <Key extends keyof StorageConfig>(key: Key, value: StorageConfig[Key]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const token = getStoredAccessToken();
    const workspaceId = getStoredWorkspaceId();

    if (!token || !workspaceId) {
      setNotice({
        tone: "danger",
        message: "You need an active workspace session before RawDrive can verify storage.",
      });
      return;
    }

    setTesting(true);
    setNotice(null);

    try {
      const result = await testStorageConnection(token, workspaceId, config);

      if (result.status === "ok") {
        setNotice({
          tone: "success",
          message: "Connection test passed. RawDrive could write, read, and delete the probe file.",
        });
        return;
      }

      setNotice({
        tone: "danger",
        message: result.error || "Connection test failed. Please double-check the selected driver settings.",
      });
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Storage Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Validate your active storage driver against the backend connection test before sending uploads
            or presigned asset traffic through it.
          </p>
        </div>
        <span className="status-badge status-badge--accent">Connection test only</span>
      </div>

      <div className="surface-panel p-5">
        <p className="text-sm text-text-secondary">
          This screen currently verifies connectivity only. It does not persist a workspace-wide storage
          configuration yet, but it does exercise the same backend validation and provider wiring used by
          uploads.
        </p>
      </div>

      {notice && (
        <div
          className={cn(
            "surface-panel p-4 text-sm",
            notice.tone === "success" ? "status-badge--success" : "status-badge--danger",
          )}
        >
          {notice.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="surface-panel space-y-6 p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Driver</span>
            <select
              value={config.driver}
              onChange={(event) => updateField("driver", event.target.value)}
              className="input-base w-full"
            >
              <option value="local">Local filesystem</option>
              <option value="s3">S3-compatible bucket</option>
            </select>
          </label>

          {isLocalDriver ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">Local directory</span>
              <input
                type="text"
                value={config.local_dir || ""}
                onChange={(event) => updateField("local_dir", event.target.value)}
                className="input-base w-full"
                placeholder="C:/rawdrive/storage"
              />
            </label>
          ) : (
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">Bucket</span>
              <input
                type="text"
                value={config.bucket}
                onChange={(event) => updateField("bucket", event.target.value)}
                className="input-base w-full"
                placeholder="rawdrive-assets"
              />
            </label>
          )}

          {!isLocalDriver && (
            <>
              <label className="space-y-2">
                <span className="text-sm font-medium text-text-primary">Region</span>
                <input
                  type="text"
                  value={config.region}
                  onChange={(event) => updateField("region", event.target.value)}
                  className="input-base w-full"
                  placeholder="eu-central-1"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-primary">Endpoint</span>
                <input
                  type="url"
                  value={config.endpoint}
                  onChange={(event) => updateField("endpoint", event.target.value)}
                  className="input-base w-full"
                  placeholder="https://<account>.r2.cloudflarestorage.com"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-primary">Access key</span>
                <input
                  type="text"
                  value={config.access_key}
                  onChange={(event) => updateField("access_key", event.target.value)}
                  className="input-base w-full"
                  autoComplete="off"
                  placeholder="AKIA..."
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-text-primary">Secret key</span>
                <input
                  type="password"
                  value={config.secret_key}
                  onChange={(event) => updateField("secret_key", event.target.value)}
                  className="input-base w-full"
                  autoComplete="new-password"
                  placeholder="********"
                />
              </label>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={testing} className="btn-primary px-4 py-2.5 text-sm">
            {testing ? "Testing connection..." : "Test storage connection"}
          </button>
          <button
            type="button"
            className="surface-button text-sm"
            onClick={() => {
              setConfig(initialConfig);
              setNotice(null);
            }}
          >
            Reset form
          </button>
        </div>
      </form>
    </div>
  );
}
