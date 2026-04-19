"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/api/authFetch";

export type CreditBalance = {
  workspaceId: string;
  balancePaise: number;
  balanceMinutes: number;
  lastEntryAt: string | null;
  lowBalance: boolean;
};

export type UseCreditBalanceOptions = {
  /** Poll interval in ms. Defaults to 60_000. Pass 5_000 while modal open. */
  intervalMs?: number;
  /** Pause polling (e.g. tab hidden). Default false. */
  paused?: boolean;
};

type RawBalance = {
  workspace_id?: string;
  balance_paise?: number;
  balance_minutes?: number;
  last_entry_at?: string | null;
  low_balance?: boolean;
};

function toBalance(raw: RawBalance): CreditBalance {
  return {
    workspaceId: raw.workspace_id ?? "",
    balancePaise: raw.balance_paise ?? 0,
    balanceMinutes: raw.balance_minutes ?? 0,
    lastEntryAt: raw.last_entry_at ?? null,
    lowBalance: raw.low_balance ?? false,
  };
}

export function useCreditBalance(opts: UseCreditBalanceOptions = {}) {
  const intervalMs = opts.intervalMs ?? 60_000;
  const paused = opts.paused ?? false;

  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const tabHiddenRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // QA: the prior raw `fetch` read the access token once and sent it
      // with no refresh-on-401 recovery. When the 15-minute JWT TTL
      // lapsed mid-session the balance widget kept producing 401s until
      // the user reloaded. authFetch transparently refreshes the token
      // via /auth/refresh on 401 and replays the request — matching the
      // pattern every other authenticated client in the app already uses.
      const res = await authFetch("/api/v1/credits/balance", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as RawBalance;
      if (!mountedRef.current) return;
      setBalance(toBalance(data));
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Track visibility
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      tabHiddenRef.current = document.visibilityState === "hidden";
    };
    tabHiddenRef.current = document.visibilityState === "hidden";
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Polling effect
  useEffect(() => {
    mountedRef.current = true;
    if (paused) {
      return () => {
        mountedRef.current = false;
      };
    }

    // initial fetch
    void refresh();

    const id = setInterval(() => {
      if (tabHiddenRef.current) return;
      void refresh();
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [intervalMs, paused, refresh]);

  return { balance, loading, error, refresh };
}
