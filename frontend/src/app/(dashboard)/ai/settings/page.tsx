"use client";

import { BYOKSetup } from "@/components/ai/BYOKSetup";
import { SpendDashboard } from "@/components/ai/SpendDashboard";

export default function AISettingsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem("rawdrive_token") || "" : "";

  return (
    <div className="space-y-8">
      <BYOKSetup token={token} />
      <SpendDashboard token={token} />
    </div>
  );
}
