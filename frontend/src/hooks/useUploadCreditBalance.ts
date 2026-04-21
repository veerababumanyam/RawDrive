"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/api/authFetch";

// M41 FR-UCRT-10 follow-up: upload credit balance hook, sibling of
// `useCreditBalance` (streaming minutes). Mirrors the streaming hook's
// shape so the UploadCreditPill can be a near-clone of CreditPill —
// same polling cadence, same authFetch 401-refresh behaviour, same
// feature-flag disable on 404.

export type UploadCreditBalance = {
  workspaceId: string;
  availableCredits: number;
  planGranted: number;
  purchased: number;
  reserved: number;
  consumed: number;
  refunded: number;
  updatedAt: string;
  lowBalance: boolean;
  lowBalanceThreshold: number;
};

export type UseUploadCreditBalanceOptions = {
  /** Poll interval in ms. Defaults to 60_000. Pass 5_000 while modal open. */
  intervalMs?: number;
  /** Pause polling (e.g. tab hidden). Default false. */
  paused?: boolean;
};

// Backend shape from backend/internal/upload/handlers/balance_handler.go
// `uploadBalanceResponse`. Camel-to-snake wire contract.
type RawUploadBalance = {
  available_credits?: number;
  plan_granted?: number;
  purchased?: number;
  reserved?: number;
  consumed?: number;
  refunded?: number;
  updated_at?: string;
  low_balance?: boolean;
  low_balance_threshold?: number;
};

function toBalance(raw: RawUploadBalance): UploadCreditBalance {
  return {
    workspaceId: "", // backend response omits workspace_id; caller has it from JWT
    availableCredits: raw.available_credits ?? 0,
    planGranted: raw.plan_granted ?? 0,
    purchased: raw.purchased ?? 0,
    reserved: raw.reserved ?? 0,
    consumed: raw.consumed ?? 0,
    refunded: raw.refunded ?? 0,
    updatedAt: raw.updated_at ?? "",
    lowBalance: raw.low_balance ?? false,
    lowBalanceThreshold: raw.low_balance_threshold ?? 100,
  };
}

export function useUploadCreditBalance(opts: UseUploadCreditBalanceOptions = {}) {
  const intervalMs = opts.intervalMs ?? 60_000;
  const paused = opts.paused ?? false;

  const [balance, setBalance] = useState<UploadCreditBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Feature-gated endpoint: backend balance handler returns 404 when
  // `streaming.upload_credit_pill_v1` env flag is off
  // (UPLOAD_CREDIT_PILL_V1_ENABLED not set). Treat as "feature off" and
  // stop polling — UploadCreditPill renders null in that state rather
  // than showing a perpetual "—".
  const [disabled, setDisabled] = useState(false);

  const mountedRef = useRef(true);
  const tabHiddenRef = useRef(false);
  const disabledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (disabledRef.current) return;
    setLoading(true);
    try {
      // authFetch transparently refreshes on 401 so the pill survives a
      // 15-minute JWT expiry without showing stale 0s. Same pattern as
      // useCreditBalance.
      const res = await authFetch("/api/v1/uploads/balance", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) {
        if (!mountedRef.current) return;
        disabledRef.current = true;
        setDisabled(true);
        setBalance(null);
        setError(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as RawUploadBalance;
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      tabHiddenRef.current = document.visibilityState === "hidden";
    };
    tabHiddenRef.current = document.visibilityState === "hidden";
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (paused) {
      return () => {
        mountedRef.current = false;
      };
    }

    void refresh();

    const id = setInterval(() => {
      if (tabHiddenRef.current) return;
      if (disabledRef.current) {
        clearInterval(id);
        return;
      }
      void refresh();
    }, intervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [intervalMs, paused, refresh]);

  return { balance, loading, error, disabled, refresh };
}
