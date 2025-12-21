/**
 * Company Profile Preview Component
 *
 * Displays a live preview of the public company profile as users edit it.
 * Uses the same ProfileCard component as PublicProfileView for exact visual parity.
 */

import React, { useState } from 'react';
import {
  Smartphone,
  Tablet,
  Monitor,
  ExternalLink,
  Globe,
} from 'lucide-react';

import { AppButton } from '../../ui/AppButton';
import { ProfileCard } from '../profile/ProfileCard';
import type { CompanyProfile, CompanyVisibilityConfig } from '../../../types/companyProfile';

// =============================================================================
// Types
// =============================================================================

type DeviceMode = 'phone' | 'tablet' | 'desktop';

interface CompanyProfilePreviewProps {
  profile: Partial<CompanyProfile> | null;
  visibility?: Partial<CompanyVisibilityConfig>;
}

// =============================================================================
// Constants
// =============================================================================

const DEVICE_DIMENSIONS: Record<DeviceMode, { width: number; height: number; label: string }> = {
  phone: { width: 280, height: 580, label: 'iPhone' },
  tablet: { width: 400, height: 540, label: 'iPad' },
  desktop: { width: 420, height: 280, label: 'MacBook' },
};

// =============================================================================
// Device Frame Components
// =============================================================================

const IPhoneFrame: React.FC<{ children: React.ReactNode; dimensions: { width: number; height: number } }> = ({
  children,
  dimensions
}) => (
  <div className="relative transition-all duration-500 ease-out">
    {/* iPhone Outer Frame - Titanium */}
    <div
      className="relative p-[3px] rounded-[44px]"
      style={{
        background: 'linear-gradient(145deg, #8B8B8D 0%, #A8A8AA 20%, #6B6B6D 50%, #8B8B8D 80%, #A8A8AA 100%)',
        boxShadow: `
          0 25px 50px -12px rgba(0, 0, 0, 0.4),
          0 0 0 1px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.2),
          0 10px 15px -3px rgba(0, 0, 0, 0.3)
        `,
      }}
    >
      {/* Inner Bezel */}
      <div
        className="p-[10px] rounded-[42px]"
        style={{
          background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
        }}
      >
        {/* Screen Container */}
        <div
          className="relative overflow-hidden rounded-[32px]"
          style={{
            width: dimensions.width,
            height: dimensions.height,
          }}
        >
          {/* Dynamic Island */}
          <div
            className="absolute top-[10px] left-1/2 -translate-x-1/2 z-20 flex items-center justify-center"
            style={{
              width: '90px',
              height: '28px',
              background: '#000',
              borderRadius: '20px',
              boxShadow: 'inset 0 0 3px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Camera lens */}
            <div
              className="absolute left-[58px] w-[10px] h-[10px] rounded-full"
              style={{
                background: 'radial-gradient(circle at 30% 30%, #3a3a4a, #1a1a2a)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            />
          </div>

          {/* Screen */}
          <div className="w-full h-full bg-gray-50 dark:bg-gray-950 overflow-y-auto">
            {children}
          </div>

          {/* Screen glass reflection */}
          <div
            className="absolute inset-0 pointer-events-none rounded-[32px]"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 40%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </div>

    {/* Side Buttons - Right */}
    <div
      className="absolute right-[-2px] top-[120px] w-[3px] h-[60px] rounded-r-sm"
      style={{
        background: 'linear-gradient(90deg, #6B6B6D, #8B8B8D)',
      }}
    />

    {/* Side Buttons - Left (Volume) */}
    <div
      className="absolute left-[-2px] top-[100px] w-[3px] h-[28px] rounded-l-sm"
      style={{
        background: 'linear-gradient(270deg, #6B6B6D, #8B8B8D)',
      }}
    />
    <div
      className="absolute left-[-2px] top-[140px] w-[3px] h-[50px] rounded-l-sm"
      style={{
        background: 'linear-gradient(270deg, #6B6B6D, #8B8B8D)',
      }}
    />
  </div>
);

const IPadFrame: React.FC<{ children: React.ReactNode; dimensions: { width: number; height: number } }> = ({
  children,
  dimensions
}) => (
  <div className="relative transition-all duration-500 ease-out">
    {/* iPad Outer Frame - Space Gray */}
    <div
      className="relative p-[3px] rounded-[24px]"
      style={{
        background: 'linear-gradient(145deg, #7D7D7F 0%, #9D9D9F 20%, #5D5D5F 50%, #7D7D7F 80%, #9D9D9F 100%)',
        boxShadow: `
          0 25px 50px -12px rgba(0, 0, 0, 0.35),
          0 0 0 1px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.15),
          0 10px 15px -3px rgba(0, 0, 0, 0.25)
        `,
      }}
    >
      {/* Inner Bezel */}
      <div
        className="p-[12px] rounded-[22px]"
        style={{
          background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
        }}
      >
        {/* Screen Container */}
        <div
          className="relative overflow-hidden rounded-[12px]"
          style={{
            width: dimensions.width,
            height: dimensions.height,
          }}
        >
          {/* Front Camera */}
          <div
            className="absolute top-[8px] left-1/2 -translate-x-1/2 z-20 w-[8px] h-[8px] rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #2a2a3a, #0a0a1a)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          />

          {/* Screen */}
          <div className="w-full h-full bg-gray-50 dark:bg-gray-950 overflow-y-auto">
            {children}
          </div>

          {/* Screen glass reflection */}
          <div
            className="absolute inset-0 pointer-events-none rounded-[12px]"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 35%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </div>
  </div>
);

const MacBookFrame: React.FC<{ children: React.ReactNode; dimensions: { width: number; height: number } }> = ({
  children,
  dimensions
}) => (
  <div className="relative transition-all duration-500 ease-out">
    {/* MacBook Screen */}
    <div
      className="relative p-[2px] rounded-t-[12px]"
      style={{
        background: 'linear-gradient(145deg, #6D6D6F 0%, #8D8D8F 25%, #4D4D4F 75%, #6D6D6F 100%)',
        boxShadow: `
          0 -2px 20px rgba(0, 0, 0, 0.2),
          0 0 0 1px rgba(0, 0, 0, 0.1)
        `,
      }}
    >
      {/* Screen Bezel */}
      <div
        className="p-[10px] pt-[20px] rounded-t-[10px]"
        style={{
          background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
        }}
      >
        {/* Camera Notch */}
        <div
          className="absolute top-[4px] left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-1"
          style={{
            width: '50px',
            height: '12px',
            background: '#0d0d0d',
            borderRadius: '0 0 8px 8px',
          }}
        >
          <div
            className="w-[6px] h-[6px] rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #2a2a3a, #0a0a1a)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          />
        </div>

        {/* Screen Container */}
        <div
          className="relative overflow-hidden rounded-[4px]"
          style={{
            width: dimensions.width,
            height: dimensions.height,
          }}
        >
          {/* Screen */}
          <div className="w-full h-full bg-gray-50 dark:bg-gray-950 overflow-y-auto">
            {children}
          </div>

          {/* Screen glass reflection */}
          <div
            className="absolute inset-0 pointer-events-none rounded-[4px]"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 30%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </div>

    {/* MacBook Bottom / Keyboard Section */}
    <div
      className="relative h-[8px] rounded-b-[4px]"
      style={{
        background: 'linear-gradient(180deg, #5D5D5F 0%, #7D7D7F 50%, #4D4D4F 100%)',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Hinge Notch */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[80px] h-[4px] rounded-b-full"
        style={{
          background: 'linear-gradient(180deg, #3D3D3F, #2D2D2F)',
        }}
      />
    </div>

    {/* Keyboard Base */}
    <div
      className="relative px-[30px] pt-[6px] pb-[4px] rounded-b-[12px]"
      style={{
        background: 'linear-gradient(180deg, #7D7D7F 0%, #9D9D9F 5%, #6D6D6F 50%, #5D5D5F 95%, #4D4D4F 100%)',
        boxShadow: `
          0 15px 35px -10px rgba(0, 0, 0, 0.35),
          0 0 0 1px rgba(0, 0, 0, 0.1),
          inset 0 -1px 0 rgba(0, 0, 0, 0.2)
        `,
      }}
    >
      {/* Keyboard Area */}
      <div
        className="h-[24px] rounded-[4px] mb-[4px]"
        style={{
          background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Key rows visual hints */}
        <div className="flex flex-col justify-center h-full px-[8px] gap-[2px]">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-[2px]">
              {[...Array(14)].map((_, j) => (
                <div
                  key={j}
                  className="h-[5px] flex-1 rounded-[1px]"
                  style={{
                    background: 'rgba(50, 50, 50, 0.8)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Trackpad */}
      <div
        className="w-[100px] h-[14px] mx-auto rounded-[4px]"
        style={{
          background: 'linear-gradient(180deg, #4a4a4a 0%, #3a3a3a 100%)',
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.2)',
        }}
      />
    </div>
  </div>
);

// =============================================================================
// Component
// =============================================================================

export const CompanyProfilePreview: React.FC<CompanyProfilePreviewProps> = ({
  profile,
  visibility = {},
}) => {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('phone');

  const dimensions = DEVICE_DIMENSIONS[deviceMode];

  if (!profile) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-surface-hover/50 to-surface-hover/30 rounded-lg">
          <div className="text-center text-text-tertiary">
            <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Fill in your profile details to see a preview</p>
          </div>
        </div>
      </div>
    );
  }

  // Render the ProfileCard inside the device frame - fills entire height
  const renderProfileContent = () => (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 flex flex-col m-2 bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800">
        <ProfileCard
          profile={profile}
          visibility={visibility}
          showActions={false}
          compact={true}
        />
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-100 via-slate-50 to-gray-100">
      {/* Device Mode Selector */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-white/80 backdrop-blur-sm">
        <span className="text-sm font-medium text-text-primary">Live Preview</span>
        <div className="flex items-center gap-1 bg-surface-hover rounded-lg p-1">
          <button
            onClick={() => setDeviceMode('phone')}
            className={`p-2 rounded-md transition-all duration-200 ${deviceMode === 'phone'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:bg-white hover:shadow-sm'
              }`}
            aria-label="iPhone preview"
            title="iPhone"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeviceMode('tablet')}
            className={`p-2 rounded-md transition-all duration-200 ${deviceMode === 'tablet'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:bg-white hover:shadow-sm'
              }`}
            aria-label="iPad preview"
            title="iPad"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeviceMode('desktop')}
            className={`p-2 rounded-md transition-all duration-200 ${deviceMode === 'desktop'
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:bg-white hover:shadow-sm'
              }`}
            aria-label="MacBook preview"
            title="MacBook"
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>
        {profile.slug && (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => window.open(`/p/${profile.slug}`, '_blank')}
            title="View live profile"
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            View Live
          </AppButton>
        )}
      </div>

      {/* Preview Container */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div className="transition-all duration-500 ease-out transform hover:scale-[1.02]">
          {deviceMode === 'phone' && (
            <IPhoneFrame dimensions={dimensions}>
              {renderProfileContent()}
            </IPhoneFrame>
          )}
          {deviceMode === 'tablet' && (
            <IPadFrame dimensions={dimensions}>
              {renderProfileContent()}
            </IPadFrame>
          )}
          {deviceMode === 'desktop' && (
            <MacBookFrame dimensions={dimensions}>
              {renderProfileContent()}
            </MacBookFrame>
          )}
        </div>
      </div>

      {/* Preview Mode Banner */}
      <div className="px-4 py-2 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 text-xs text-center font-medium">
        ✨ Preview Mode — Changes are reflected in real-time
      </div>
    </div>
  );
};

export default CompanyProfilePreview;
