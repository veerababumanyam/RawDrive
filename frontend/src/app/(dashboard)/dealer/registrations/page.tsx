"use client";

import { UserPlus } from "lucide-react";

export default function DealerRegistrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Registrations
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Photographers you have onboarded to RawDrive.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <UserPlus className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Registration tracking and onboarding history will load here.
        </p>
      </div>
    </div>
  );
}
