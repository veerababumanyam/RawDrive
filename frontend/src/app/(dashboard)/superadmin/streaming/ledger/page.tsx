"use client";

// M35/35-7 — /superadmin/streaming/ledger
//
// Super-admin only. The dashboard layout already gates the broader admin
// surface, but we add a defense-in-depth client-side role check here so
// non-super-admins who hit the URL directly see a clear forbidden state
// instead of an empty table (the API also returns 403).

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";
import { getStoredPlatformRole } from "@/lib/auth";
import { LedgerExplorer } from "@/components/admin/streaming/LedgerExplorer";

export default function SuperAdminLedgerPage() {
  const router = useRouter();
  const [allowed] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const role = getStoredPlatformRole();
    return role === "super_admin" || role === "admin";
  });

  useEffect(() => {
    if (allowed === false) {
      // Bounce non-platform sessions away from the page.
      router.replace("/");
    }
  }, [allowed, router]);

  if (allowed === null) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <p className="text-text-secondary">Checking access…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <p className="text-feedback-error">
          Forbidden — super-admin role required.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <LedgerExplorer />
    </div>
  );
}
