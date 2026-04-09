"use client";

import { useState, useEffect } from "react";
import { getStoredAccessToken } from "@/lib/auth";

interface DesktopSession {
  id: string;
  device_name: string;
  os: string;
  app_version: string;
  last_seen_at: string;
  is_active: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function DesktopPage() {
  const [sessions, setSessions] = useState<DesktopSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredAccessToken();
    fetch(`${API_BASE}/api/v1/desktop/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : [])
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Hero Section */}
      <div className="glass-card rounded-2xl p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
          <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">RawDrive Desktop</h1>
        <p className="text-text-secondary max-w-lg mx-auto mb-6">
          Upload thousands of photos with drag-and-drop, auto-sync from your camera via tethered shooting,
          and work offline with automatic resume.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://releases.rawdrive.app/desktop/latest/RawDrive-Setup.exe"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent/90 transition-colors min-h-[44px]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
            Download for Windows
          </a>
          <a
            href="https://releases.rawdrive.app/desktop/latest/RawDrive.dmg"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-primary bg-surface-base px-6 py-3 text-sm font-medium text-text-primary hover:bg-surface-raised transition-colors min-h-[44px]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
            </svg>
            Download for macOS
          </a>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          {
            title: "Bulk Upload",
            desc: "Drag entire event folders — queue 10,000+ files without freezing",
            icon: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5",
          },
          {
            title: "Tethered Shooting",
            desc: "Watch a folder and auto-upload new photos within 2 seconds",
            icon: "M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z M15 12.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
          },
          {
            title: "Offline Queue",
            desc: "Lost internet? Files queue and resume automatically",
            icon: "M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z",
          },
          {
            title: "RAW Support",
            desc: "CR2, NEF, ARW, DNG, RAF, ORF — all RAW formats supported",
            icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z",
          },
        ].map((feat) => (
          <div key={feat.title} className="glass-card rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={feat.icon} />
              </svg>
            </div>
            <h3 className="font-medium text-text-primary mb-1">{feat.title}</h3>
            <p className="text-sm text-text-secondary">{feat.desc}</p>
          </div>
        ))}
      </div>

      {/* Active Sessions */}
      {!loading && sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Active Sessions</h2>
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-sunken flex items-center justify-center">
                  <span className="text-lg">
                    {session.os === "macos" ? "🍎" : session.os === "windows" ? "🪟" : "🐧"}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text-primary text-sm">{session.device_name}</p>
                  <p className="text-xs text-text-tertiary">
                    v{session.app_version} · Last seen {new Date(session.last_seen_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`w-2 h-2 rounded-full ${session.is_active ? "bg-success" : "bg-text-tertiary"}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
