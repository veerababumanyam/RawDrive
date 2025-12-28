/**
 * Gallery-related constants
 *
 * Centralizes magic numbers and configuration values for gallery features.
 * SOC2 compliant: No hardcoded secrets or sensitive data.
 */

// =============================================================================
// UI Timing Constants
// =============================================================================

/** Delay between bulk downloads to avoid browser overload (ms) */
export const BULK_DOWNLOAD_DELAY_MS = 300;

/** Duration to show "link copied" feedback (ms) */
export const LINK_COPIED_FEEDBACK_MS = 2000;

/** Animation duration for fade transitions (ms) */
export const FADE_ANIMATION_MS = 200;

// =============================================================================
// Visitor Storage Keys (GDPR: visitor data stored locally only)
// =============================================================================

/** Prefix for visitor registration status in localStorage */
export const VISITOR_STORAGE_KEY_PREFIX = 'visitor_registered_';

/** Prefix for visitor ID in localStorage */
export const VISITOR_ID_KEY_PREFIX = 'visitor_id_';

/** Prefix for PIN verification status in localStorage */
export const PIN_VERIFIED_KEY_PREFIX = 'pin_verified_';

/** Prefix for Password verification status in localStorage */
export const PASSWORD_VERIFIED_KEY_PREFIX = 'password_verified_';

/** Prefix for private photos unlock status in localStorage */
export const PRIVATE_UNLOCKED_KEY_PREFIX = 'private_unlocked_';

// =============================================================================
// Gallery Grid Configuration
// =============================================================================

/** Default aspect ratio for photo grid items */
export const GRID_ASPECT_RATIO = '3/2';

/** Number of columns on mobile */
export const GRID_COLS_MOBILE = 2;

/** Number of columns on tablet */
export const GRID_COLS_TABLET = 3;

/** Number of columns on desktop */
export const GRID_COLS_DESKTOP = 4;

// =============================================================================
// Face Search Configuration
// =============================================================================

/** Default similarity threshold for face matching (0.0 - 1.0) */
export const FACE_SEARCH_THRESHOLD_DEFAULT = 0.6;

/** Maximum results to return from face search */
export const FACE_SEARCH_LIMIT_DEFAULT = 50;

// =============================================================================
// Download Policies
// =============================================================================

export const DOWNLOAD_POLICIES = {
  VIEW_ONLY: 'view_only',
  WEB_ONLY: 'web_only',
  WATERMARKED_ONLY: 'watermarked_only',
  ORIGINAL_ALLOWED: 'original_allowed',
} as const;

export type DownloadPolicy = (typeof DOWNLOAD_POLICIES)[keyof typeof DOWNLOAD_POLICIES];

// =============================================================================
// Workflow Tabs
// =============================================================================

export const WORKFLOW_TABS = {
  ALL: 'all',
  FAVORITES: 'favorites',
  SELECTIONS: 'selections',
} as const;

export type WorkflowTab = (typeof WORKFLOW_TABS)[keyof typeof WORKFLOW_TABS];
