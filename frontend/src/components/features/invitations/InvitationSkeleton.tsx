/**
 * InvitationSkeleton: Loading skeleton components for invitation features
 *
 * Provides visual feedback during data fetching for:
 * - Invitation cards
 * - RSVP dashboard
 * - Template gallery
 * - QR code modal
 *
 * Feature: 016-save-the-date
 * Task: T126
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Base Skeleton Components
// ---------------------------------------------------------------------------

interface SkeletonBoxProps {
  className?: string;
}

const SkeletonBox: React.FC<SkeletonBoxProps> = ({ className = '' }) => (
  <div
    className={`animate-pulse bg-surface-hover rounded ${className}`}
    aria-hidden="true"
  />
);

// ---------------------------------------------------------------------------
// Invitation Card Skeleton
// ---------------------------------------------------------------------------

export const InvitationCardSkeleton: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div
    className={`bg-surface rounded-xl border border-border overflow-hidden ${className}`}
    aria-hidden="true"
  >
    {/* Cover image placeholder */}
    <SkeletonBox className="aspect-[16/9]" />

    {/* Content */}
    <div className="p-4 space-y-3">
      {/* Title */}
      <SkeletonBox className="h-5 w-3/4" />

      {/* Date & Venue */}
      <div className="flex items-center gap-4">
        <SkeletonBox className="h-4 w-24" />
        <SkeletonBox className="h-4 w-32" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 pt-2">
        <SkeletonBox className="h-6 w-16 rounded-full" />
        <SkeletonBox className="h-6 w-20 rounded-full" />
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Invitation List Skeleton
// ---------------------------------------------------------------------------

export const InvitationListSkeleton: React.FC<{
  count?: number;
  className?: string;
}> = ({ count = 6, className = '' }) => (
  <div
    className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}
    role="status"
    aria-label="Loading invitations"
  >
    {Array.from({ length: count }).map((_, i) => (
      <InvitationCardSkeleton key={i} />
    ))}
    <span className="sr-only">Loading invitations...</span>
  </div>
);

// ---------------------------------------------------------------------------
// RSVP Dashboard Skeleton
// ---------------------------------------------------------------------------

export const RSVPDashboardSkeleton: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div className={`space-y-6 ${className}`} role="status" aria-label="Loading RSVP dashboard">
    {/* Stats Grid */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-surface rounded-lg border border-border p-4">
          <SkeletonBox className="h-4 w-20 mb-2" />
          <SkeletonBox className="h-8 w-16" />
        </div>
      ))}
    </div>

    {/* RSVP List Header */}
    <div className="flex items-center justify-between">
      <SkeletonBox className="h-6 w-32" />
      <div className="flex gap-2">
        <SkeletonBox className="h-9 w-24 rounded-lg" />
        <SkeletonBox className="h-9 w-20 rounded-lg" />
      </div>
    </div>

    {/* RSVP Table */}
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Table Header */}
      <div className="flex items-center gap-4 p-4 border-b border-border">
        <SkeletonBox className="h-4 w-32" />
        <SkeletonBox className="h-4 w-40" />
        <SkeletonBox className="h-4 w-24" />
        <SkeletonBox className="h-4 w-20" />
      </div>

      {/* Table Rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border-b border-border last:border-0">
          <SkeletonBox className="h-4 w-32" />
          <SkeletonBox className="h-4 w-40" />
          <SkeletonBox className="h-6 w-20 rounded-full" />
          <SkeletonBox className="h-4 w-12" />
        </div>
      ))}
    </div>

    <span className="sr-only">Loading RSVP data...</span>
  </div>
);

// ---------------------------------------------------------------------------
// Template Gallery Skeleton
// ---------------------------------------------------------------------------

export const TemplateGallerySkeleton: React.FC<{
  count?: number;
  className?: string;
}> = ({ count = 9, className = '' }) => (
  <div className={`space-y-6 ${className}`} role="status" aria-label="Loading templates">
    {/* Category filters */}
    <div className="flex gap-2 overflow-x-auto pb-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBox key={i} className="h-8 w-24 rounded-full flex-shrink-0" />
      ))}
    </div>

    {/* Template grid */}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface rounded-lg border border-border overflow-hidden">
          <SkeletonBox className="aspect-[3/4]" />
          <div className="p-3">
            <SkeletonBox className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>

    <span className="sr-only">Loading templates...</span>
  </div>
);

// ---------------------------------------------------------------------------
// Public Invitation Skeleton
// ---------------------------------------------------------------------------

export const PublicInvitationSkeleton: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div className={`max-w-2xl mx-auto ${className}`} role="status" aria-label="Loading invitation">
    {/* Cover image */}
    <SkeletonBox className="aspect-video rounded-xl mb-8" />

    {/* Title */}
    <div className="text-center mb-8">
      <SkeletonBox className="h-8 w-64 mx-auto mb-4" />
      <SkeletonBox className="h-5 w-48 mx-auto" />
    </div>

    {/* Countdown */}
    <div className="flex justify-center gap-4 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="text-center">
          <SkeletonBox className="h-16 w-16 rounded-lg mb-2" />
          <SkeletonBox className="h-3 w-12 mx-auto" />
        </div>
      ))}
    </div>

    {/* Event details */}
    <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBox className="h-10 w-10 rounded-lg" />
        <div className="flex-1">
          <SkeletonBox className="h-4 w-32 mb-2" />
          <SkeletonBox className="h-3 w-48" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SkeletonBox className="h-10 w-10 rounded-lg" />
        <div className="flex-1">
          <SkeletonBox className="h-4 w-40 mb-2" />
          <SkeletonBox className="h-3 w-56" />
        </div>
      </div>
    </div>

    <span className="sr-only">Loading invitation...</span>
  </div>
);

// ---------------------------------------------------------------------------
// Checkin Scanner Skeleton
// ---------------------------------------------------------------------------

export const CheckinScannerSkeleton: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div className={`space-y-6 ${className}`} role="status" aria-label="Loading check-in scanner">
    {/* Stats */}
    <div className="grid grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-surface rounded-lg border border-border p-4 text-center">
          <SkeletonBox className="h-8 w-12 mx-auto mb-2" />
          <SkeletonBox className="h-3 w-16 mx-auto" />
        </div>
      ))}
    </div>

    {/* Scanner area */}
    <SkeletonBox className="aspect-square max-w-sm mx-auto rounded-xl" />

    {/* Mode toggle */}
    <div className="flex gap-2 justify-center">
      <SkeletonBox className="h-10 w-32 rounded-lg" />
      <SkeletonBox className="h-10 w-32 rounded-lg" />
    </div>

    <span className="sr-only">Loading check-in scanner...</span>
  </div>
);

// ---------------------------------------------------------------------------
// Export all
// ---------------------------------------------------------------------------

export default {
  InvitationCardSkeleton,
  InvitationListSkeleton,
  RSVPDashboardSkeleton,
  TemplateGallerySkeleton,
  PublicInvitationSkeleton,
  CheckinScannerSkeleton,
};
