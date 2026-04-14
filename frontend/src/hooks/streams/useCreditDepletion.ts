"use client";

/**
 * useCreditDepletion — server-authoritative depletion phase.
 * TODO: real-time — subscribe to depletion.* events on the chat SSE channel and
 * call GET /streams/{id}/credit-status on mount for initial state. For the shell
 * wave this returns phase='ok' so banners are hidden until SSE wiring lands.
 */

import { useState } from "react";
import type { DepletionPhase } from "@/components/streams/live/CreditDepletionBanner";

export function useCreditDepletion(_streamId: string) {
  const [phase] = useState<DepletionPhase>("ok");
  const [remainingSec] = useState<number>(Number.POSITIVE_INFINITY);
  const [graceEndsAt] = useState<Date | null>(null);
  const [autoEndedAt] = useState<Date | null>(null);

  return { phase, remainingSec, graceEndsAt, autoEndedAt };
}
