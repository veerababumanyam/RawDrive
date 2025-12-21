/**
 * Visibility Controls Component
 *
 * Provides granular per-field and per-platform social media visibility toggles.
 * Includes bulk operations and preset management.
 *
 * Requirements: 1.1, 1.3, 1.6, 1.7
 */

import React, { useCallback, useState } from 'react';
import {
  Eye,
  EyeOff,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Twitter,
  MessageCircle,
  Music2,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import type {
  ProfileVisibilityConfig,
  FieldVisibility,
  SocialVisibility,
  EnhancedCompanyProfile,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface VisibilityControlsProps {
  visibility: ProfileVisibilityConfig | null;
  onUpdate: (updates: {
    field_visibility?: FieldVisibility;
    social_visibility?: SocialVisibility;
  }) => void;
  profile: EnhancedCompanyProfile | null;
}

interface FieldToggleConfig {
  key: string;
  label: string;
  description: string;
}

interface SocialPlatformConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

// =============================================================================
// Constants
// =============================================================================

const FIELD_TOGGLES: FieldToggleConfig[] = [
  { key: 'name', label: 'Business Name', description: 'Your company or studio name' },
  { key: 'tagline', label: 'Tagline', description: 'Short description or slogan' },
  { key: 'logo_url', label: 'Logo', description: 'Your business logo' },
  { key: 'email', label: 'Email', description: 'Contact email address' },
  { key: 'phone', label: 'Phone', description: 'Contact phone number' },
  { key: 'website', label: 'Website', description: 'Your website URL' },
  { key: 'address', label: 'Address', description: 'Business location' },
  { key: 'custom_links', label: 'Custom Links', description: 'Additional navigation links' },
];

const SOCIAL_PLATFORMS: SocialPlatformConfig[] = [
  { key: 'instagram', label: 'Instagram', icon: <Instagram className="w-4 h-4" />, color: '#E4405F' },
  { key: 'facebook', label: 'Facebook', icon: <Facebook className="w-4 h-4" />, color: '#1877F2' },
  { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="w-4 h-4" />, color: '#25D366' },
  { key: 'tiktok', label: 'TikTok', icon: <Music2 className="w-4 h-4" />, color: '#000000' },
  { key: 'linkedin', label: 'LinkedIn', icon: <Linkedin className="w-4 h-4" />, color: '#0A66C2' },
  { key: 'youtube', label: 'YouTube', icon: <Youtube className="w-4 h-4" />, color: '#FF0000' },
  { key: 'twitter', label: 'Twitter/X', icon: <Twitter className="w-4 h-4" />, color: '#1DA1F2' },
];

const PRESETS = [
  { key: 'full', label: 'Full Profile', description: 'Show all fields and social links' },
  { key: 'minimal', label: 'Minimal', description: 'Name, tagline, logo, and select socials' },
  { key: 'business', label: 'Business Only', description: 'Contact info and professional links' },
];

// =============================================================================
// Component
// =============================================================================

export const VisibilityControls: React.FC<VisibilityControlsProps> = ({
  visibility,
  onUpdate,
  profile,
}) => {
  const [showSocials, setShowSocials] = useState(true);

  // Get current visibility state with defaults
  const fieldVisibility = visibility?.field_visibility || {};
  const socialVisibility = visibility?.social_visibility || {};

  // Helper to get field visibility (defaults to true)
  const isFieldVisible = useCallback(
    (field: string): boolean => {
      return (fieldVisibility as Record<string, boolean>)[field] !== false;
    },
    [fieldVisibility]
  );

  // Helper to get social visibility (defaults to true)
  const isSocialVisible = useCallback(
    (platform: string): boolean => {
      return (socialVisibility as Record<string, boolean>)[platform] !== false;
    },
    [socialVisibility]
  );

  // Check if profile has a social link configured
  const hasSocialLink = useCallback(
    (platform: string): boolean => {
      return !!profile?.socials?.[platform];
    },
    [profile]
  );

  // Toggle field visibility
  const toggleField = useCallback(
    (field: string) => {
      onUpdate({
        field_visibility: { [field]: !isFieldVisible(field) },
      });
    },
    [onUpdate, isFieldVisible]
  );

  // Toggle social visibility
  const toggleSocial = useCallback(
    (platform: string) => {
      onUpdate({
        social_visibility: { [platform]: !isSocialVisible(platform) },
      });
    },
    [onUpdate, isSocialVisible]
  );

  // Bulk show all
  const showAll = useCallback(() => {
    const allFieldsVisible = Object.fromEntries(
      FIELD_TOGGLES.map((f) => [f.key, true])
    ) as FieldVisibility;
    const allSocialsVisible = Object.fromEntries(
      SOCIAL_PLATFORMS.map((p) => [p.key, true])
    ) as SocialVisibility;
    onUpdate({
      field_visibility: allFieldsVisible,
      social_visibility: allSocialsVisible,
    });
  }, [onUpdate]);

  // Bulk hide all
  const hideAll = useCallback(() => {
    const allFieldsHidden = Object.fromEntries(
      FIELD_TOGGLES.map((f) => [f.key, false])
    ) as FieldVisibility;
    const allSocialsHidden = Object.fromEntries(
      SOCIAL_PLATFORMS.map((p) => [p.key, false])
    ) as SocialVisibility;
    onUpdate({
      field_visibility: allFieldsHidden,
      social_visibility: allSocialsHidden,
    });
  }, [onUpdate]);

  // Count visible items
  const visibleFieldCount = FIELD_TOGGLES.filter((f) => isFieldVisible(f.key)).length;
  const visibleSocialCount = SOCIAL_PLATFORMS.filter(
    (p) => isSocialVisible(p.key) && hasSocialLink(p.key)
  ).length;

  return (
    <div className="p-4 space-y-6">
      {/* Bulk Controls */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          {visibleFieldCount} of {FIELD_TOGGLES.length} fields visible
        </span>
        <div className="flex gap-2">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={showAll}
            aria-label="Show all fields"
          >
            <Eye className="w-4 h-4 mr-1" />
            Show All
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={hideAll}
            aria-label="Hide all fields"
          >
            <EyeOff className="w-4 h-4 mr-1" />
            Hide All
          </AppButton>
        </div>
      </div>

      {/* Field Toggles */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-text-primary">Profile Fields</h3>
        <div className="space-y-1">
          {FIELD_TOGGLES.map((field) => (
            <VisibilityToggle
              key={field.key}
              label={field.label}
              description={field.description}
              isVisible={isFieldVisible(field.key)}
              onToggle={() => toggleField(field.key)}
            />
          ))}
        </div>
      </div>

      {/* Social Media Section */}
      <div className="space-y-2">
        <button
          onClick={() => setShowSocials(!showSocials)}
          className="flex items-center justify-between w-full text-sm font-medium text-text-primary hover:text-primary transition-colors"
          aria-expanded={showSocials}
        >
          <span>Social Media Platforms</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">
              {visibleSocialCount} visible
            </span>
            {showSocials ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>
        </button>

        {showSocials && (
          <div className="space-y-1 pt-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const hasLink = hasSocialLink(platform.key);
              return (
                <SocialToggle
                  key={platform.key}
                  platform={platform}
                  isVisible={isSocialVisible(platform.key)}
                  hasLink={hasLink}
                  onToggle={() => toggleSocial(platform.key)}
                  disabled={!hasLink}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Presets */}
      <div className="space-y-2 pt-4 border-t border-border">
        <h3 className="text-sm font-medium text-text-primary">Quick Presets</h3>
        <div className="grid grid-cols-1 gap-2">
          {PRESETS.map((preset) => (
            <PresetButton
              key={preset.key}
              preset={preset}
              isActive={visibility?.preset_name === preset.key}
              onClick={() => {
                // Apply preset - this would call the API
                // For now just log
                console.log('Apply preset:', preset.key);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Sub-Components
// =============================================================================

interface VisibilityToggleProps {
  label: string;
  description: string;
  isVisible: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const VisibilityToggle: React.FC<VisibilityToggleProps> = ({
  label,
  description,
  isVisible,
  onToggle,
  disabled,
}) => (
  <button
    onClick={onToggle}
    disabled={disabled}
    className={`
      w-full flex items-center justify-between p-3 rounded-lg border transition-all
      ${
        isVisible
          ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
          : 'border-border bg-surface hover:bg-surface-hover'
      }
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
    `}
    role="switch"
    aria-checked={isVisible}
    aria-label={`Toggle ${label} visibility`}
  >
    <div className="flex-1 text-left">
      <span className="font-medium text-text-primary text-sm">{label}</span>
      <span className="block text-xs text-text-tertiary">{description}</span>
    </div>
    <div
      className={`
        w-10 h-6 rounded-full relative transition-colors
        ${isVisible ? 'bg-primary' : 'bg-border'}
      `}
    >
      <div
        className={`
          absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform
          ${isVisible ? 'translate-x-5' : 'translate-x-1'}
        `}
      />
    </div>
  </button>
);

interface SocialToggleProps {
  platform: SocialPlatformConfig;
  isVisible: boolean;
  hasLink: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const SocialToggle: React.FC<SocialToggleProps> = ({
  platform,
  isVisible,
  hasLink,
  onToggle,
  disabled,
}) => (
  <button
    onClick={onToggle}
    disabled={disabled}
    className={`
      w-full flex items-center gap-3 p-2 rounded-lg transition-all
      ${
        !hasLink
          ? 'opacity-40 cursor-not-allowed'
          : isVisible
          ? 'bg-surface-hover'
          : 'bg-surface hover:bg-surface-hover'
      }
      ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
      focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
    `}
    role="switch"
    aria-checked={isVisible}
    aria-label={`Toggle ${platform.label} visibility`}
    title={!hasLink ? `No ${platform.label} link configured` : undefined}
  >
    <span
      className="p-1.5 rounded"
      style={{ backgroundColor: hasLink ? `${platform.color}20` : undefined }}
    >
      {platform.icon}
    </span>
    <span className="flex-1 text-left text-sm text-text-primary">{platform.label}</span>
    {hasLink ? (
      isVisible ? (
        <Eye className="w-4 h-4 text-primary" />
      ) : (
        <EyeOff className="w-4 h-4 text-text-tertiary" />
      )
    ) : (
      <span className="text-xs text-text-tertiary">Not configured</span>
    )}
  </button>
);

interface PresetButtonProps {
  preset: { key: string; label: string; description: string };
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const PresetButton: React.FC<PresetButtonProps> = ({
  preset,
  isActive,
  onClick,
  disabled,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      flex items-center justify-between p-3 rounded-lg border transition-all text-left
      ${
        isActive
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/30 hover:bg-surface-hover'
      }
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
    `}
  >
    <div>
      <span className="font-medium text-sm text-text-primary">{preset.label}</span>
      <span className="block text-xs text-text-tertiary">{preset.description}</span>
    </div>
    {isActive && <Check className="w-4 h-4 text-primary" />}
  </button>
);

export default VisibilityControls;
