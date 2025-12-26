/**
 * Workspace Activity Types
 * TypeScript interfaces for the dashboard activity feed
 */

// ---------------------------------------------------------------------------
// Activity Types
// ---------------------------------------------------------------------------

export type ActivityType =
  | 'gallery_viewed'
  | 'gallery_published'
  | 'gallery_created'
  | 'photo_downloaded'
  | 'photos_downloaded'
  | 'comment_added'
  | 'favorite_added'
  | 'favorite_removed'
  | 'selection_added'
  | 'selection_removed'
  | 'upload_completed'
  | 'visitor_registered'
  | 'face_search_performed';

export type ActorType = 'user' | 'visitor' | 'guest';

export type TargetType = 'gallery' | 'asset' | 'comment' | 'visitor';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface ActivityActor {
  type: ActorType;
  user_id?: string;
  visitor_id?: string;
  name: string;
  email?: string;
  avatar_url?: string;
}

export interface ActivityTarget {
  type: TargetType;
  id: string;
  name?: string;
  thumbnail_url?: string;
}

export interface ActivityGallery {
  id: string;
  name?: string;
}

export interface Activity {
  activity_id: string;
  workspace_id: string;
  activity_type: ActivityType;
  actor: ActivityActor;
  target: ActivityTarget;
  gallery?: ActivityGallery;
  description?: string;
  metadata: Record<string, unknown>;
  count: number;
  created_at: string;
}

export interface ActivityListResponse {
  data: Activity[];
  meta: {
    limit: number;
    count: number;
    filters: {
      activity_type?: string;
      actor_type?: string;
      gallery_id?: string;
    };
  };
}

export interface ActivitySummary {
  total_activities: number;
  by_type: Record<string, number>;
  by_actor_type: Record<string, number>;
  top_galleries: Array<{
    gallery_id: string;
    gallery_name: string;
    activity_count: number;
  }>;
  period_days: number;
}

// ---------------------------------------------------------------------------
// Activity Type Metadata (for UI display)
// ---------------------------------------------------------------------------

export interface ActivityTypeConfig {
  icon: string;
  color: string;
  gradient: string;
  label: string;
  actionVerb: string;
}

export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, ActivityTypeConfig> = {
  gallery_viewed: {
    icon: 'Eye',
    color: 'blue',
    gradient: 'from-blue-500 to-cyan-500',
    label: 'View',
    actionVerb: 'viewed gallery',
  },
  gallery_published: {
    icon: 'Globe',
    color: 'green',
    gradient: 'from-emerald-500 to-teal-500',
    label: 'Published',
    actionVerb: 'published gallery',
  },
  gallery_created: {
    icon: 'FolderPlus',
    color: 'purple',
    gradient: 'from-violet-500 to-purple-600',
    label: 'Created',
    actionVerb: 'created a new gallery',
  },
  photo_downloaded: {
    icon: 'Download',
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    label: 'Download',
    actionVerb: 'downloaded a photo',
  },
  photos_downloaded: {
    icon: 'Download',
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    label: 'Downloads',
    actionVerb: 'downloaded photos',
  },
  comment_added: {
    icon: 'MessageCircle',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500',
    label: 'Comment',
    actionVerb: 'left a comment',
  },
  favorite_added: {
    icon: 'Heart',
    color: 'pink',
    gradient: 'from-pink-500 to-rose-500',
    label: 'Favorite',
    actionVerb: 'favorited a photo',
  },
  favorite_removed: {
    icon: 'HeartOff',
    color: 'gray',
    gradient: 'from-gray-400 to-gray-500',
    label: 'Unfavorite',
    actionVerb: 'removed a favorite',
  },
  selection_added: {
    icon: 'CheckCircle',
    color: 'green',
    gradient: 'from-green-500 to-emerald-500',
    label: 'Selected',
    actionVerb: 'selected a photo',
  },
  selection_removed: {
    icon: 'XCircle',
    color: 'gray',
    gradient: 'from-gray-400 to-gray-500',
    label: 'Deselected',
    actionVerb: 'removed a selection',
  },
  upload_completed: {
    icon: 'Upload',
    color: 'blue',
    gradient: 'from-blue-500 to-cyan-500',
    label: 'Upload',
    actionVerb: 'uploaded photos',
  },
  visitor_registered: {
    icon: 'UserPlus',
    color: 'amber',
    gradient: 'from-amber-500 to-orange-500',
    label: 'New Visitor',
    actionVerb: 'registered as a visitor',
  },
  face_search_performed: {
    icon: 'ScanFace',
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    label: 'Face Search',
    actionVerb: 'searched for faces',
  },
};
