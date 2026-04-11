// Admin/Super-Admin Dealers management page.
// Renders DealerAdminReview which lists all dealers via GET /api/v1/admin/dealers
// (backend route at backend/internal/handler/routes_m6.go line 56-63).
"use client";

import DealerAdminReview from "@/features/dealer/DealerAdminReview";

export default function AdminDealersPage() {
  return (
    <div>
      <h2 className="text-2xl font-headline font-semibold text-text-primary mb-2">Dealer Network</h2>
      <p className="text-sm text-text-tertiary mb-6">
        Approve, suspend, and manage all dealers across the platform.
      </p>
      <DealerAdminReview />
    </div>
  );
}
