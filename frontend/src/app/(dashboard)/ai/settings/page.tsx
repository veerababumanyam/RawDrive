"use client";

import { BYOKSetup } from "@/components/ai/BYOKSetup";
import { SpendDashboard } from "@/components/ai/SpendDashboard";
import { getStoredAccessToken } from "@/lib/auth";

export default function AISettingsPage() {
  const token = getStoredAccessToken();

  return (
    <div className="space-y-8">
      <BYOKSetup token={token} />
      <SpendDashboard token={token} />
    </div>
  );
}
