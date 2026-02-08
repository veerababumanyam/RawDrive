/**
 * Mobile app constants
 */

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'rawdrive_access_token',
  REFRESH_TOKEN: 'rawdrive_refresh_token',
  EXPIRES_AT: 'rawdrive_expires_at',
  USER: 'rawdrive_user',
  WORKSPACE: 'rawdrive_workspace',
  BIOMETRIC_ENABLED: 'rawdrive_biometric_enabled',
  DEVICE_ID: 'rawdrive_device_id',
  THEME: 'rawdrive_theme',
} as const;

// API configuration
export const API_CONFIG = {
  TIMEOUT_MS: 60000, // 60 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE: 1000, // 1 second
  TOKEN_REFRESH_BUFFER: 60, // seconds before expiry to refresh
} as const;

// Upload configuration
export const UPLOAD_CONFIG = {
  MAX_IMAGE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_VIDEO_SIZE: 1024 * 1024 * 1024, // 1GB
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB chunks for TUS
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
  SUPPORTED_VIDEO_TYPES: ['video/mp4', 'video/quicktime', 'video/mov'],
} as const;

// UI constants
export const UI_CONSTANTS = {
  ANIMATION_DURATION: 300,
  HAPTIC_IMPACT: 'light' as const,
  THUMBNAIL_SIZE: 150,
  GALLERY_GRID_COLUMNS: 3,
  PULL_TO_REFRESH_DISTANCE: 80,
} as const;

// Colors (matching web design system)
export const COLORS = {
  // Primary
  primary: '#000000',
  primaryForeground: '#FFFFFF',

  // Background
  background: '#FFFFFF',
  backgroundSecondary: '#F5F5F5',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Accent
  accent: '#3B82F6',
  accentLight: '#EFF6FF',

  // Status
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Border
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Dark mode
  dark: {
    background: '#0A0A0A',
    backgroundSecondary: '#1A1A1A',
    textPrimary: '#FAFAFA',
    textSecondary: '#A1A1AA',
    border: '#27272A',
  },
} as const;

// Typography
export const TYPOGRAPHY = {
  fontFamily: {
    sans: 'System',
    mono: 'Courier',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// Spacing
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

// Border radius
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
