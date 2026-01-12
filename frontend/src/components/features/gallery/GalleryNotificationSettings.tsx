/**
 * GalleryNotificationSettings Component
 * Settings for photographer notifications for this gallery
 */

import React from 'react';
import { Bell, MessageSquare, Heart, CheckSquare, Download, Eye } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle } from '../../ui/FormControls';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

export interface GalleryNotificationSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const GalleryNotificationSettings: React.FC<GalleryNotificationSettingsProps> = ({ gallery, onUpdate }) => {
  return (
    <div className="space-y-6">
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Bell size={20} />
          Notification Preferences
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          Configure which events you want to be notified about for this gallery.
        </p>
        <div className="space-y-4">
          {/* Comment Notifications */}
          <div className="flex items-start gap-4 p-4 bg-surface-hover rounded-lg border border-border">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <MessageSquare size={20} className="text-blue-400" />
            </div>
            <div className="flex-1">
              <Toggle
                label="New comments"
                checked={gallery.notify_on_comment ?? true}
                onChange={(e) => onUpdate({ notify_on_comment: e.target.checked })}
                description="Notify when a client leaves a comment on a photo"
              />
            </div>
          </div>

          {/* Favorite Notifications */}
          <div className="flex items-start gap-4 p-4 bg-surface-hover rounded-lg border border-border">
            <div className="p-2 bg-pink-500/20 rounded-lg">
              <Heart size={20} className="text-pink-400" />
            </div>
            <div className="flex-1">
              <Toggle
                label="New favorites"
                checked={gallery.notify_on_favorite ?? false}
                onChange={(e) => onUpdate({ notify_on_favorite: e.target.checked })}
                description="Notify when a client favorites a photo (can be noisy for large galleries)"
              />
            </div>
          </div>

          {/* Selection Notifications */}
          <div className="flex items-start gap-4 p-4 bg-surface-hover rounded-lg border border-border">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CheckSquare size={20} className="text-green-400" />
            </div>
            <div className="flex-1">
              <Toggle
                label="Selection updates"
                checked={gallery.notify_on_selection ?? true}
                onChange={(e) => onUpdate({ notify_on_selection: e.target.checked })}
                description="Notify when a client adds or removes photos from their selection"
              />
            </div>
          </div>

          {/* Download Notifications */}
          <div className="flex items-start gap-4 p-4 bg-surface-hover rounded-lg border border-border">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Download size={20} className="text-purple-400" />
            </div>
            <div className="flex-1">
              <Toggle
                label="Downloads"
                checked={gallery.notify_on_download ?? true}
                onChange={(e) => onUpdate({ notify_on_download: e.target.checked })}
                description="Notify when a client downloads photos from the gallery"
              />
            </div>
          </div>
        </div>
      </AppCard>

      {/* Activity Tracking */}
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Eye size={20} />
          Activity Tracking
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          Configure what client activity is tracked for analytics and insights.
        </p>
        <div className="space-y-4">
          <Toggle
            label="Track photo views"
            checked={gallery.activity_tracking?.track_views ?? true}
            onChange={(e) => onUpdate({
              activity_tracking: {
                ...gallery.activity_tracking,
                track_views: e.target.checked,
              },
            })}
            description="Track which photos are viewed most frequently"
          />
          <Toggle
            label="Track downloads"
            checked={gallery.activity_tracking?.track_downloads ?? true}
            onChange={(e) => onUpdate({
              activity_tracking: {
                ...gallery.activity_tracking,
                track_downloads: e.target.checked,
              },
            })}
            description="Track download activity for analytics"
          />
          <Toggle
            label="Track shares"
            checked={gallery.activity_tracking?.track_shares ?? true}
            onChange={(e) => onUpdate({
              activity_tracking: {
                ...gallery.activity_tracking,
                track_shares: e.target.checked,
              },
            })}
            description="Track when photos or galleries are shared"
          />
          <Toggle
            label="Anonymous tracking only"
            checked={gallery.activity_tracking?.anonymous_tracking ?? false}
            onChange={(e) => onUpdate({
              activity_tracking: {
                ...gallery.activity_tracking,
                anonymous_tracking: e.target.checked,
              },
            })}
            description="Only track aggregate statistics without identifying individual users"
          />
        </div>
      </AppCard>

      {/* Info Card */}
      <AppCard padding="md" className="bg-blue-500/10 border-blue-500/20">
        <p className="text-sm text-text-secondary">
          <strong className="text-text-primary">Note:</strong> Notification preferences here override your workspace-level settings for this specific gallery.
          To configure default notification settings for all galleries, visit your{' '}
          <a href="/settings/notifications" className="text-primary hover:underline">
            Workspace Settings
          </a>.
        </p>
      </AppCard>
    </div>
  );
};
