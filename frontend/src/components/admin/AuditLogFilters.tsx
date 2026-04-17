"use client";

import { useEffect, useRef, useState } from "react";

// M39 E8-S2: audit-log filter controls.
//   - actor:      debounced substring filter; invokes onChange after ~300ms
//                 so the list doesn't re-query on every keystroke.
//   - dateFrom/To: datetime-local inputs that are normalized to RFC3339
//                 before being emitted upstream.

export interface AuditLogFiltersValue {
  actor: string;
  dateFromRFC3339: string | null;
  dateToRFC3339: string | null;
}

interface AuditLogFiltersProps {
  initial?: AuditLogFiltersValue;
  onChange: (val: AuditLogFiltersValue) => void;
  debounceMs?: number;
}

// datetime-local values look like "2026-04-17T15:00". Convert to UTC ISO
// (RFC3339) by trusting the local tz and appending :00Z — FE defers to
// backend for precise tz math, but the RFC3339 parser on the backend
// accepts this format.
function toRFC3339(localValue: string): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AuditLogFilters({
  initial,
  onChange,
  debounceMs = 300,
}: AuditLogFiltersProps) {
  const [actor, setActor] = useState(initial?.actor ?? "");
  const [dateFromLocal, setDateFromLocal] = useState<string>("");
  const [dateToLocal, setDateToLocal] = useState<string>("");
  const actorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (actorTimer.current) clearTimeout(actorTimer.current);
    actorTimer.current = setTimeout(() => {
      onChange({
        actor,
        dateFromRFC3339: toRFC3339(dateFromLocal),
        dateToRFC3339: toRFC3339(dateToLocal),
      });
    }, debounceMs);
    return () => {
      if (actorTimer.current) clearTimeout(actorTimer.current);
    };
  }, [actor, dateFromLocal, dateToLocal, debounceMs, onChange]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col">
        <span className="text-sm text-text-secondary mb-1">Actor</span>
        <input
          type="search"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="name or email"
          className="rounded-md border border-border-subtle bg-surface px-3 py-2 w-56"
        />
      </label>
      <label className="flex flex-col">
        <span className="text-sm text-text-secondary mb-1">From</span>
        <input
          type="datetime-local"
          value={dateFromLocal}
          onChange={(e) => setDateFromLocal(e.target.value)}
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
        />
      </label>
      <label className="flex flex-col">
        <span className="text-sm text-text-secondary mb-1">To</span>
        <input
          type="datetime-local"
          value={dateToLocal}
          onChange={(e) => setDateToLocal(e.target.value)}
          className="rounded-md border border-border-subtle bg-surface px-3 py-2"
        />
      </label>
    </div>
  );
}
