"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

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
      const token = typeof window !== "undefined" ? getStoredAccessToken() : "";
      const res = await fetch(`${API_BASE}/api/v1/credits/balance`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
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
