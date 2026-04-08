// Design source: Stitch MCP Liquid Glass — Dealer Registration Form screen
"use client";

import { useState } from "react";
import DealerRegistrationForm from "@/features/dealer/DealerRegistrationForm";

export default function DealerRegisterPage() {
  const [registered, setRegistered] = useState(false);

  if (registered) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="glass-card p-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent-primary/20 flex items-center justify-center">
            <span className="text-3xl text-accent-primary">✓</span>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Registration Submitted</h2>
          <p className="text-text-secondary">
            Your dealer application is under review. You will be notified once approved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Become a RawDrive Dealer</h1>
        <p className="text-text-secondary mt-2">
          Join our dealer network and earn commissions by referring photographers in your state.
        </p>
      </div>
      <DealerRegistrationForm onSuccess={() => setRegistered(true)} />
    </div>
  );
}
