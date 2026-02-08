/**
 * Mobile app type definitions
 * Mirrors web frontend types with mobile-specific additions
 */

// Auth types
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  emailVerified: boolean;
  createdAt: string;
  workspace_id?: string;
}

export interface Workspace {
  workspace_id: string;
  id?: string; // Legacy alias
  name: string;
  slug: string;
  role: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  user: User & { workspace_id?: string };
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  workspace?: Workspace;
}

// API types
export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
    timestamp?: string;
    details?: Record<string, unknown>;
    status?: number;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError['error'];
}

// Device info for security tracking
export interface DeviceInfo {
  platform: 'ios' | 'android';
  osVersion: string;
  deviceModel: string;
  appVersion: string;
  deviceId: string;
}

// Gallery types
export interface Gallery {
  id: string;
  name: string;
  description?: string;
  status: GalleryStatus;
  coverImageUrl?: string;
  assetCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  clientName?: string;
  eventDate?: string;
}

export type GalleryStatus = 'draft' | 'published' | 'archived';

export interface Asset {
  id: string;
  galleryId: string;
  filename: string;
  url: string;
  thumbnailUrl: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  isStarred: boolean;
  isRejected: boolean;
  createdAt: string;
}

// Dashboard types
export interface DashboardOverview {
  todaySchedule: ScheduleItem[];
  pendingInvoicesCount: number;
  pendingInvoicesTotal: number;
  activeGalleriesCount: number;
  totalViewsToday: number;
  recentActivity: ActivityItem[];
}

export interface ScheduleItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  clientName?: string;
  location?: string;
  type: 'shoot' | 'meeting' | 'delivery' | 'other';
}

export interface ActivityItem {
  id: string;
  type: 'payment' | 'favorite' | 'comment' | 'view' | 'download';
  message: string;
  timestamp: string;
  galleryId?: string;
  galleryName?: string;
}

// Inquiry types
export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  eventType?: string;
  eventDate?: string;
  status: 'new' | 'contacted' | 'converted' | 'closed';
  createdAt: string;
}

// Client types
export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  galleriesCount: number;
  lastActivity?: string;
}

// Upload types
export interface UploadItem {
  id: string;
  uri: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
  galleryId: string;
}

// Notification types
export interface PushNotification {
  id: string;
  title: string;
  body: string;
  type: 'payment' | 'favorite' | 'comment' | 'inquiry' | 'booking' | 'system';
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
