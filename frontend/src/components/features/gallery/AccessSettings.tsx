/**
 * AccessSettings Component
 * Settings for gallery access control
 */

import React, { useState } from 'react';
import { Lock, Mail, Calendar, Globe } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle } from '../../ui/FormControls';
import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import { PinSettings } from './PinSettings';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

export interface AccessSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const AccessSettings: React.FC<AccessSettingsProps> = ({ gallery, onUpdate }) => {
  const [password, setPassword] = useState('');
  const [emailRequired, setEmailRequired] = useState(gallery.email_registration_required || false);
  const [expiresAt, setExpiresAt] = useState(
    gallery.expires_at ? new Date(gallery.expires_at).toISOString().slice(0, 16) : ''
  );
  const [customDomain, setCustomDomain] = useState(gallery.custom_domain || '');

  const [isPasswordEnabled, setIsPasswordEnabled] = useState(gallery.password_protected || false);

  const handlePasswordToggle = (enabled: boolean) => {
    setIsPasswordEnabled(enabled);
    if (!enabled) {
      onUpdate({ remove_password: true });
      setPassword('');
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    onUpdate({ password: value });
  };

  const handleEmailRequiredToggle = (enabled: boolean) => {
    setEmailRequired(enabled);
    onUpdate({ email_registration_required: enabled });
  };

  const handleExpiryChange = (value: string) => {
    setExpiresAt(value);
    if (value) {
      const date = new Date(value);
      onUpdate({ expires_at: date.toISOString() });
    } else {
      onUpdate({ expires_at: null });
    }
  };

  const handleCustomDomainChange = (value: string) => {
    setCustomDomain(value);
    onUpdate({ custom_domain: value || null });
  };

  return (
    <div className="space-y-6">
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Lock size={20} />
          Password Protection
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Require password to view gallery"
            checked={isPasswordEnabled}
            onChange={(e) => handlePasswordToggle(e.target.checked)}
          />
          {isPasswordEnabled && (
            <div>
              <AppInput
                type="password"
                label="Password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="Enter new password"
                helperText="Leave empty to remove password protection"
              />
            </div>
          )}
        </div>
      </AppCard>

      {/* PIN Protection */}
      <PinSettings gallery={gallery} onUpdate={onUpdate} />

      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Mail size={20} />
          Email Registration
        </h3>
        <Toggle
          label="Require email registration before viewing"
          checked={emailRequired}
          onChange={(e) => handleEmailRequiredToggle(e.target.checked)}
          description="Visitors must provide their email address before accessing the gallery"
        />
      </AppCard>

      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Calendar size={20} />
          Expiry Date
        </h3>
        <div>
          <AppInput
            type="datetime-local"
            label="Gallery Expires"
            value={expiresAt}
            onChange={(e) => handleExpiryChange(e.target.value)}
            helperText="Gallery will automatically become unavailable after this date"
          />
          {expiresAt && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpiresAt('');
                handleExpiryChange('');
              }}
              className="mt-2"
            >
              Clear expiry date
            </AppButton>
          )}
        </div>
      </AppCard>

      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Globe size={20} />
          Custom Domain
        </h3>
        <div>
          <AppInput
            type="text"
            label="Custom Domain (CNAME)"
            value={customDomain}
            onChange={(e) => handleCustomDomainChange(e.target.value)}
            placeholder="photos.yourstudio.com"
            helperText="Point a CNAME record to gallery.rawdrive.ai to use your own domain"
          />
        </div>
      </AppCard>
    </div>
  );
};


