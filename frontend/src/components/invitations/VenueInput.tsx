import React, { useEffect, useState } from 'react';
import { MapPin, Globe, Loader2 } from 'lucide-react';
import { VenueInfo } from '../../types/invitations';

interface VenueInputProps {
  value: VenueInfo;
  onChange: (venue: VenueInfo) => void;
  error?: string;
  disabled?: boolean;
}

export const VenueInput: React.FC<VenueInputProps> = ({
  value,
  onChange,
  error,
  disabled = false,
}) => {
  const handleChange = (field: keyof VenueInfo, fieldValue: string) => {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">
          Venue Name
        </label>
        <div className="relative">
          <input
            type="text"
            value={value.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            disabled={disabled}
            placeholder="e.g. The Grand Hotel"
            className={`
              w-full px-4 py-2.5 pl-10 rounded-xl border bg-surface
              transition-all
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-border'
                : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
              }
            `}
          />
          <MapPin 
            size={18} 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" 
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">
          Address
        </label>
        <textarea
          value={value.address || ''}
          onChange={(e) => handleChange('address', e.target.value)}
          disabled={disabled}
          placeholder="Street address"
          rows={2}
          className={`
            w-full px-4 py-2.5 rounded-xl border bg-surface resize-none
            transition-all
            ${disabled
              ? 'opacity-50 cursor-not-allowed border-border'
              : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
            }
          `}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">
            City
          </label>
          <input
            type="text"
            value={value.city || ''}
            onChange={(e) => handleChange('city', e.target.value)}
            disabled={disabled}
            className={`
              w-full px-4 py-2.5 rounded-xl border bg-surface
              transition-all
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-border'
                : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
              }
            `}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">
            State/Province
          </label>
          <input
            type="text"
            value={value.state || ''}
            onChange={(e) => handleChange('state', e.target.value)}
            disabled={disabled}
            className={`
              w-full px-4 py-2.5 rounded-xl border bg-surface
              transition-all
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-border'
                : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
              }
            `}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">
            Country
          </label>
          <input
            type="text"
            value={value.country || 'India'}
            onChange={(e) => handleChange('country', e.target.value)}
            disabled={disabled}
            className={`
              w-full px-4 py-2.5 rounded-xl border bg-surface
              transition-all
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-border'
                : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
              }
            `}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">
            Postal Code
          </label>
          <input
            type="text"
            value={value.postal_code || ''}
            onChange={(e) => handleChange('postal_code', e.target.value)}
            disabled={disabled}
            className={`
              w-full px-4 py-2.5 rounded-xl border bg-surface
              transition-all
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-border'
                : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
              }
            `}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-text-secondary">
          Map URL (Google Maps)
        </label>
        <div className="relative">
          <input
            type="url"
            value={value.map_url || ''}
            onChange={(e) => handleChange('map_url', e.target.value)}
            disabled={disabled}
            placeholder="https://goo.gl/maps/..."
            className={`
              w-full px-4 py-2.5 pl-10 rounded-xl border bg-surface
              transition-all
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-border'
                : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
              }
            `}
          />
          <Globe 
            size={18} 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" 
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-error">{error}</p>
      )}
    </div>
  );
};
