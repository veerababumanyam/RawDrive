/**
 * WebhookCard - Individual webhook subscription card with actions.
 */

import React, { useState } from 'react';
import {
  Activity,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  Settings2,
  Play,
  Loader2,
  Clock,
} from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import { AppBadge } from '../../../ui/AppBadge';
import type { WebhookSubscription } from '../../../../types/webhooks';

interface WebhookCardProps {
  subscription: WebhookSubscription;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggleActive: () => void;
  onViewLogs: () => void;
  isTesting: boolean;
  isDeleting: boolean;
}

export const WebhookCard: React.FC<WebhookCardProps> = ({
  subscription,
  onEdit,
  onDelete,
  onTest,
  onToggleActive,
  onViewLogs,
  isTesting,
  isDeleting,
}) => {
  const [showSecret, setShowSecret] = useState(false);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(subscription.endpoint_url);
  };

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left side: Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-text-primary truncate">{subscription.name}</h3>
            <AppBadge variant={subscription.is_active ? 'success' : 'default'} size="sm">
              {subscription.is_active ? 'Active' : 'Inactive'}
            </AppBadge>
          </div>

          {subscription.description && (
            <p className="text-sm text-text-secondary mb-3 line-clamp-2">{subscription.description}</p>
          )}

          {/* Endpoint URL */}
          <div className="flex items-center gap-2 mb-3">
            <code className="text-xs bg-surface-hover px-2 py-1 rounded font-mono text-text-secondary truncate max-w-md">
              {subscription.endpoint_url}
            </code>
            <button
              onClick={handleCopyUrl}
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
              title="Copy URL"
            >
              <Copy className="w-4 h-4" />
            </button>
            <a
              href={subscription.endpoint_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
              title="Open URL"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Event Types */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {subscription.event_types.slice(0, 5).map((eventType) => (
              <span
                key={eventType}
                className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
              >
                {eventType}
              </span>
            ))}
            {subscription.event_types.length > 5 && (
              <span className="text-xs px-2 py-0.5 bg-surface-hover text-text-secondary rounded-full">
                +{subscription.event_types.length - 5} more
              </span>
            )}
          </div>

          {/* Secret Key (Masked) */}
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>Secret:</span>
            <code className="font-mono bg-surface-hover px-2 py-0.5 rounded">
              {showSecret ? subscription.secret_key_masked : '••••••••••••••••'}
            </code>
            <button
              onClick={() => setShowSecret(!showSecret)}
              className="p-1 hover:text-text-secondary transition-colors"
              title={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <span className="text-text-quaternary">v{subscription.secret_version}</span>
          </div>
        </div>

        {/* Right side: Actions */}
        <div className="flex flex-col gap-2">
          <AppButton
            variant="outline"
            size="sm"
            leftIcon={isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            onClick={onTest}
            disabled={isTesting || !subscription.is_active}
          >
            Test
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            leftIcon={<Activity className="w-4 h-4" />}
            onClick={onViewLogs}
          >
            Logs
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            leftIcon={<Settings2 className="w-4 h-4" />}
            onClick={onEdit}
          >
            Edit
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            leftIcon={isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            onClick={onDelete}
            disabled={isDeleting}
            className="text-error hover:bg-error/10"
          >
            Delete
          </AppButton>
        </div>
      </div>

      {/* Footer: Toggle Active */}
      <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Clock className="w-3.5 h-3.5" />
          <span>Created {new Date(subscription.created_at).toLocaleDateString()}</span>
        </div>
        <button
          onClick={onToggleActive}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${subscription.is_active ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
            }`}
        >
          <span
            className={`${subscription.is_active ? 'translate-x-6' : 'translate-x-1'
              } inline-block h-4 w-4 transform rounded-full bg-white transition`}
          />
        </button>
      </div>
    </div>
  );
};

export default WebhookCard;
