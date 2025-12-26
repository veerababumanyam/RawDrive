/**
 * PinSettings Component
 * Settings for gallery PIN protection (secondary access control)
 */

import React, { useState } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle } from '../../ui/FormControls';
import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

export interface PinSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const PinSettings: React.FC<PinSettingsProps> = ({ gallery, onUpdate }) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const hasPin = gallery.pin_protected || false;

  const handlePinToggle = (enabled: boolean) => {
    if (!enabled) {
      onUpdate({ remove_pin: true });
      setPin('');
    }
  };

  const handlePinChange = (value: string) => {
    // Only allow numeric values for PIN
    const numericValue = value.replace(/\D/g, '');
    setPin(numericValue);
  };

  const handleSetPin = () => {
    if (pin.length >= 4) {
      onUpdate({ pin });
      setPin('');
    }
  };

  return (
    <AppCard padding="md">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Key size={20} />
        PIN Protection
      </h3>
      <div className="space-y-4">
        <Toggle
          label="Require PIN to view gallery"
          checked={hasPin}
          onChange={(e) => handlePinToggle(e.target.checked)}
          description="Visitors must enter a PIN code in addition to any password protection"
        />
        {hasPin && (
          <div className="space-y-3">
            <div className="relative">
              <AppInput
                type={showPin ? 'text' : 'password'}
                label="New PIN"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                placeholder="Enter 4-6 digit PIN"
                maxLength={6}
                helperText="Enter a new PIN to update the existing one"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-[38px] text-text-tertiary hover:text-text-secondary"
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="flex gap-2">
              <AppButton
                variant="primary"
                size="sm"
                onClick={handleSetPin}
                disabled={pin.length < 4}
              >
                Update PIN
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                onClick={() => handlePinToggle(false)}
              >
                Remove PIN
              </AppButton>
            </div>
          </div>
        )}
        {!hasPin && (
          <div className="space-y-3">
            <div className="relative">
              <AppInput
                type={showPin ? 'text' : 'password'}
                label="Set PIN"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                placeholder="Enter 4-6 digit PIN"
                maxLength={6}
                helperText="4-6 numeric digits required"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-[38px] text-text-tertiary hover:text-text-secondary"
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <AppButton
              variant="primary"
              size="sm"
              onClick={handleSetPin}
              disabled={pin.length < 4}
            >
              Enable PIN
            </AppButton>
          </div>
        )}
      </div>
    </AppCard>
  );
};
