/**
 * ClientInteractionSettings Component
 * Settings for client interaction features: Comments, Favorites, Selections, Ratings
 */

import React from 'react';
import { MessageSquare, Heart, CheckSquare, Star, Info } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle } from '../../ui/FormControls';
import { AppInput } from '../../ui/AppInput';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

export interface ClientInteractionSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const ClientInteractionSettings: React.FC<ClientInteractionSettingsProps> = ({ gallery, onUpdate }) => {
  return (
    <div className="space-y-6">
      {/* Comments Setting */}
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <MessageSquare size={20} />
          Comments
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Allow client comments"
            checked={gallery.comments_enabled ?? true}
            onChange={(e) => onUpdate({ comments_enabled: e.target.checked })}
            description="Clients can leave comments on individual photos"
          />
          <div className="p-4 bg-surface-hover rounded-lg border border-border">
            <p className="text-sm text-text-secondary">
              When enabled, clients can comment on photos. You&apos;ll receive notifications for new comments based on your notification settings.
            </p>
          </div>
        </div>
      </AppCard>

      {/* Favorites Setting */}
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Heart size={20} />
          Favorites
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Allow client favorites"
            checked={gallery.favorites_enabled ?? true}
            onChange={(e) => onUpdate({ favorites_enabled: e.target.checked })}
            description="Clients can mark photos as favorites"
          />
          <div className="p-4 bg-surface-hover rounded-lg border border-border">
            <p className="text-sm text-text-secondary">
              Favorites help you understand which photos resonate most with your clients. Popular photos are highlighted in the workspace view.
            </p>
          </div>
        </div>
      </AppCard>

      {/* Selections Setting */}
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <CheckSquare size={20} />
          Selections
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Allow client selections"
            checked={gallery.selections_enabled ?? true}
            onChange={(e) => onUpdate({ selections_enabled: e.target.checked })}
            description="Clients can select photos for albums, prints, or other products"
          />

          {(gallery.selections_enabled ?? true) && (
            <div className="pt-4 border-t border-border">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Selection Limit
              </label>
              <div className="flex items-center gap-4">
                <AppInput
                  type="number"
                  value={gallery.selection_limit?.toString() || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    onUpdate({ selection_limit: val });
                  }}
                  placeholder="Unlimited"
                  min={1}
                  max={1000}
                  className="w-32"
                />
                <span className="text-sm text-text-secondary">
                  {gallery.selection_limit
                    ? `Max ${gallery.selection_limit} photos`
                    : 'No limit set'}
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                Limit how many photos clients can select. Leave empty for unlimited.
              </p>
            </div>
          )}

          <div className="p-4 bg-surface-hover rounded-lg border border-border">
            <p className="text-sm text-text-secondary">
              Selections are typically used for album design or print orders. You can export selections from the workspace gallery view.
            </p>
          </div>
        </div>
      </AppCard>

      {/* Star Ratings Setting */}
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Star size={20} />
          Star Ratings
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Allow client ratings"
            checked={gallery.ratings_enabled ?? false}
            onChange={(e) => onUpdate({ ratings_enabled: e.target.checked })}
            description="Clients can rate photos from 1 to 5 stars"
          />

          {gallery.ratings_enabled && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <Info size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-text-primary font-medium">Rating Display</p>
                <p className="text-xs text-text-secondary mt-1">
                  Average ratings are shown on photo cards. You can view detailed ratings in the workspace gallery.
                </p>
              </div>
            </div>
          )}

          <div className="p-4 bg-surface-hover rounded-lg border border-border">
            <p className="text-sm text-text-secondary">
              Star ratings help you understand which photos your clients love most. Use this data to prioritize editing or album inclusion.
            </p>
          </div>
        </div>
      </AppCard>
    </div>
  );
};
