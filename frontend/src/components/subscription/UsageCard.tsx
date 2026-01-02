/**
 * UsageCard Component
 *
 * Displays subscription usage metrics with progress bars.
 * Shows storage, galleries, clients, team members, and AI credits usage.
 * Feature: 006-user-profile-sidebar
 */

import React from 'react';
import {
  HardDrive,
  Image,
  Users,
  UserPlus,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

import type { UsageStats } from '../../services/subscriptionService';

interface UsageCardProps {
  usage: UsageStats | undefined;
  className?: string;
}

interface UsageItemProps {
  icon: React.ReactNode;
  label: string;
  used: number | string;
  limit: number | string;
  percentage: number;
  unit?: string;
  variant?: 'default' | 'warning' | 'danger';
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Get variant based on usage percentage
 */
function getVariant(percentage: number): 'default' | 'warning' | 'danger' {
  if (percentage >= 90) return 'danger';
  if (percentage >= 75) return 'warning';
  return 'default';
}

/**
 * Individual usage metric row with progress bar
 */
const UsageItem: React.FC<UsageItemProps> = ({
  icon,
  label,
  used,
  limit,
  percentage,
  unit = '',
  variant = 'default',
}) => {
  const progressColors = {
    default: 'bg-gradient-to-r from-primary to-accent',
    warning: 'bg-gradient-to-r from-amber-500 to-orange-500',
    danger: 'bg-gradient-to-r from-red-500 to-rose-500',
  };

  const iconColors = {
    default: 'text-primary',
    warning: 'text-amber-500',
    danger: 'text-red-500',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={iconColors[variant]}>{icon}</span>
          <span className="text-sm font-medium text-text-primary">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">
            {used}
            {unit} / {limit}
            {unit}
          </span>
          {variant === 'danger' && (
            <AlertTriangle className="w-4 h-4 text-red-500" aria-hidden="true" />
          )}
        </div>
      </div>
      <div
        className="h-2 bg-border/50 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${percentage}% used`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${progressColors[variant]}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
};

/**
 * UsageCard - Displays all subscription usage metrics
 */
export const UsageCard: React.FC<UsageCardProps> = ({ usage, className = '' }) => {
  // Defensive check - return null if usage data is not yet loaded
  if (!usage) {
    return null;
  }

  const storagePercentage = Math.round(
    (usage.storage_used_bytes / usage.storage_limit_bytes) * 100
  );
  const galleriesPercentage = Math.round(
    (usage.galleries_count / usage.galleries_limit) * 100
  );
  const clientsPercentage = Math.round(
    (usage.clients_count / usage.clients_limit) * 100
  );
  const teamPercentage = Math.round(
    (usage.team_members_count / usage.team_members_limit) * 100
  );
  const aiPercentage = Math.round(
    (usage.ai_credits_used / usage.ai_credits_limit) * 100
  );

  // Check if any metric is at critical level
  const hasWarning = [
    storagePercentage,
    galleriesPercentage,
    clientsPercentage,
    teamPercentage,
    aiPercentage,
  ].some((p) => p >= 75);

  return (
    <section
      className={`glass-card glass-card-hover rounded-2xl p-4 sm:p-6 ${className}`}
      aria-labelledby="usage-heading"
    >
      <div className="flex items-start gap-4 mb-6">
        <div
          className={`icon-container icon-container-lg rounded-xl shadow-lg ${
            hasWarning ? 'icon-container-warning' : 'icon-container-accent'
          }`}
        >
          <HardDrive size={22} />
        </div>
        <div>
          <h2 id="usage-heading" className="text-lg font-semibold text-text-primary">
            Usage & Limits
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Monitor your resource consumption across your workspace
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Storage */}
        <UsageItem
          icon={<HardDrive size={16} />}
          label="Storage"
          used={formatBytes(usage.storage_used_bytes)}
          limit={formatBytes(usage.storage_limit_bytes)}
          percentage={storagePercentage}
          variant={getVariant(storagePercentage)}
        />

        {/* Galleries */}
        <UsageItem
          icon={<Image size={16} />}
          label="Galleries"
          used={usage.galleries_count}
          limit={usage.galleries_limit}
          percentage={galleriesPercentage}
          variant={getVariant(galleriesPercentage)}
        />

        {/* Clients */}
        <UsageItem
          icon={<Users size={16} />}
          label="Clients"
          used={usage.clients_count}
          limit={usage.clients_limit}
          percentage={clientsPercentage}
          variant={getVariant(clientsPercentage)}
        />

        {/* Team Members */}
        <UsageItem
          icon={<UserPlus size={16} />}
          label="Team Members"
          used={usage.team_members_count}
          limit={usage.team_members_limit}
          percentage={teamPercentage}
          variant={getVariant(teamPercentage)}
        />

        {/* AI Credits */}
        <UsageItem
          icon={<Sparkles size={16} />}
          label="AI Credits"
          used={usage.ai_credits_used}
          limit={usage.ai_credits_limit}
          percentage={aiPercentage}
          variant={getVariant(aiPercentage)}
        />
      </div>

      {hasWarning && (
        <div className="mt-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Approaching Limits
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                Some resources are nearing their limits. Consider upgrading your plan for
                more capacity.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default UsageCard;
