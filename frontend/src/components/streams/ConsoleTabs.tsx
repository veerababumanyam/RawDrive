"use client";

/**
 * ConsoleTabs — /streams/[id] dashboard shell (story 34-1).
 *
 * Renders 5 tabs (Overview, Setup, Live, Replay, Audit) using GlassIconButton
 * for every tab head. Live/Replay/Audit are shells — sub-widgets from stories
 * 34-4/34-5/34-6/34-7 mount into named slots. Permission-gated tabs hide when
 * the corresponding bit is absent from the payload.
 *
 * Project rules applied:
 *  - GlassIconButton for every icon button (label prop mandatory)
 *  - Design tokens only; no hardcoded colors / arbitrary values
 *  - aria-selected + keyboard arrow navigation for a11y
 */

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  Broadcast,
  ChatBubble,
  ClipboardList,
  InfoCircle,
  Replay,
  Wrench,
} from "@/components/icons";
import { IngestRevealPanel } from "./IngestRevealPanel";

export type TabId = "overview" | "setup" | "live" | "replay" | "audit";

export interface ConsoleStreamView {
  id: string;
  title: string;
  status: string;
  scheduled_at?: string;
  description?: string;
}

export interface ConsolePermissions {
  can_control: boolean;
  can_moderate: boolean;
  can_view_audit: boolean;
}

export interface IngestCredsView {
  rtmps_url: string;
  stream_key: string;
  srt_url: string;
  srt_passkey: string;
  revealed_at: string;
}

export interface RevealAuditRow {
  revealed_at: string;
  user_email_domain: string;
  ip_hash: string;
}

export interface ModerationAuditRow {
  occurred_at: string;
  actor_email_domain: string;
  action: string;
  ip_hash: string;
}

export interface ConsolePayload {
  stream: ConsoleStreamView;
  permissions: ConsolePermissions;
  ingest_creds: IngestCredsView | null;
  audit: {
    reveal_rows: RevealAuditRow[];
    moderation_rows: ModerationAuditRow[];
  };
  overview?: unknown;
  setup?: unknown;
  live?: unknown;
  replay?: unknown;
}

export interface ConsoleTabsProps {
  payload: ConsolePayload;
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

interface TabDef {
  id: TabId;
  label: string;
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.JSX.Element;
  visible: boolean;
}

export function ConsoleTabs({ payload, activeTab, onTabChange }: ConsoleTabsProps) {
  const [internalActive, setInternalActive] = useState<TabId>(activeTab ?? "overview");
  const current: TabId = activeTab ?? internalActive;

  const tabs = useMemo<TabDef[]>(
    () => [
      { id: "overview", label: "Overview", Icon: InfoCircle, visible: true },
      { id: "setup", label: "Setup", Icon: Wrench, visible: true },
      { id: "live", label: "Live", Icon: Broadcast, visible: true },
      { id: "replay", label: "Replay", Icon: Replay, visible: true },
      {
        id: "audit",
        label: "Audit",
        Icon: ClipboardList,
        visible: payload.permissions.can_view_audit,
      },
    ],
    [payload.permissions.can_view_audit],
  );

  const visibleTabs = tabs.filter((t) => t.visible);
  const tablistRef = useRef<HTMLDivElement>(null);

  const selectTab = useCallback(
    (id: TabId) => {
      setInternalActive(id);
      onTabChange?.(id);
    },
    [onTabChange],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const idx = visibleTabs.findIndex((t) => t.id === current);
      if (idx < 0) return;
      const nextIdx =
        e.key === "ArrowRight"
          ? (idx + 1) % visibleTabs.length
          : (idx - 1 + visibleTabs.length) % visibleTabs.length;
      const next = visibleTabs[nextIdx];
      selectTab(next.id);
      // move focus to the newly selected tab button
      const el = tablistRef.current?.querySelector<HTMLButtonElement>(
        `[data-testid="tab-${next.id}"]`,
      );
      el?.focus();
    },
    [current, visibleTabs, selectTab],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white/90">{payload.stream.title}</h1>
        <span
          data-testid="status-pill"
          className="inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs uppercase tracking-wider text-white/70"
        >
          {payload.stream.status}
        </span>
      </header>

      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Stream console tabs"
        onKeyDown={onKeyDown}
        className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3"
      >
        {visibleTabs.map((t) => {
          const isActive = t.id === current;
          return (
            <div key={t.id} className="flex items-center gap-2">
              <GlassIconButton
                data-testid={`tab-${t.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.id}`}
                tabIndex={isActive ? 0 : -1}
                label={`${t.label} tab`}
                size="md"
                variant="glass"
                active={isActive}
                onClick={() => selectTab(t.id)}
              >
                <t.Icon />
              </GlassIconButton>
              <span className={`text-sm ${isActive ? "text-white/90" : "text-white/60"}`}>
                {t.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="min-h-[240px]">
        {current === "overview" && <OverviewPanel payload={payload} />}
        {current === "setup" && <SetupPanel payload={payload} />}
        {current === "live" && <LivePanel />}
        {current === "replay" && <ReplayPanel />}
        {current === "audit" && payload.permissions.can_view_audit && (
          <AuditPanel payload={payload} />
        )}
      </div>
    </div>
  );
}

function Panel({
  id,
  children,
}: {
  id: TabId;
  children: React.ReactNode;
}) {
  return (
    <section
      role="tabpanel"
      id={`panel-${id}`}
      data-testid={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="rounded-2xl border border-white/10 bg-white/5 p-6"
    >
      {children}
    </section>
  );
}

function OverviewPanel({ payload }: { payload: ConsolePayload }) {
  return (
    <Panel id="overview">
      <h2 className="mb-3 text-lg font-medium text-white/90">Overview</h2>
      <p className="text-sm text-white/70">
        {payload.stream.description ?? "Summary widgets (balance, package, peak viewers) mount here."}
      </p>
    </Panel>
  );
}

function SetupPanel({ payload }: { payload: ConsolePayload }) {
  return (
    <Panel id="setup">
      <div className="flex flex-col gap-6">
        {payload.stream.scheduled_at ? (
          <IngestRevealPanel
            streamId={payload.stream.id}
            scheduledStartAt={payload.stream.scheduled_at}
          />
        ) : (
          <p className="text-sm text-white/60">
            Schedule this stream to unlock ingest credentials.
          </p>
        )}
        <div
          data-testid="setup-invite-slot"
          className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50"
        >
          Invite QR widget mounts here (story 34-5).
        </div>
        <div
          data-testid="setup-preflight-slot"
          className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50"
        >
          Desktop preflight panel mounts here (story 34-7).
        </div>
      </div>
    </Panel>
  );
}

function LivePanel() {
  return (
    <Panel id="live">
      <h2 className="mb-3 text-lg font-medium text-white/90">Live</h2>
      <p className="text-sm text-white/70">
        Not live yet. Live widgets (health, viewers, moderation, waiting-room) will appear here
        once the stream is broadcasting.
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs text-white/50">
        <ChatBubble width={16} height={16} />
        Coming soon — wired by story 34-6.
      </div>
    </Panel>
  );
}

function ReplayPanel() {
  return (
    <Panel id="replay">
      <h2 className="mb-3 text-lg font-medium text-white/90">Replay</h2>
      <p className="text-sm text-white/70">
        Replay controls (enable, expiry, copy link) appear here after the stream ends.
      </p>
    </Panel>
  );
}

function AuditPanel({ payload }: { payload: ConsolePayload }) {
  const reveals = payload.audit.reveal_rows;
  const mods = payload.audit.moderation_rows;
  const empty = reveals.length === 0 && mods.length === 0;
  return (
    <Panel id="audit">
      <h2 className="mb-3 text-lg font-medium text-white/90">Audit log</h2>
      {empty ? (
        <p data-testid="audit-empty" className="text-sm text-white/60">
          No reveal or moderation events recorded yet.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <section>
            <h3 className="mb-2 text-sm font-medium text-white/80">Ingest reveals</h3>
            <ul className="flex flex-col gap-1 text-sm text-white/70">
              {reveals.map((r, i) => (
                <li key={i} className="font-mono text-xs">
                  {new Date(r.revealed_at).toLocaleString()} — {r.user_email_domain} ({r.ip_hash})
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-medium text-white/80">Moderation actions</h3>
            <ul className="flex flex-col gap-1 text-sm text-white/70">
              {mods.map((r, i) => (
                <li key={i} className="font-mono text-xs">
                  {new Date(r.occurred_at).toLocaleString()} — {r.actor_email_domain} {r.action} ({r.ip_hash})
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Panel>
  );
}
