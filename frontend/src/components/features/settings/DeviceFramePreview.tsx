/**
 * DeviceFramePreview
 *
 * Scaled preview container with device chrome.
 * Renders children inside a frame that matches phone/tablet/desktop dimensions,
 * scaled down via CSS transform to fit the available container width.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Smartphone, Tablet, Monitor } from 'lucide-react';
import {
  useProfileEditor,
  useProfileEditorDispatch,
} from '@/contexts/ProfileEditorContext';
import { DEVICE_BREAKPOINTS, type DeviceMode } from '@/types/profileEditor';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_BUTTONS: { mode: DeviceMode; icon: React.ElementType; label: string }[] = [
  { mode: 'phone', icon: Smartphone, label: 'Phone' },
  { mode: 'tablet', icon: Tablet, label: 'Tablet' },
  { mode: 'desktop', icon: Monitor, label: 'Desktop' },
];

// ---------------------------------------------------------------------------
// DeviceFramePreview
// ---------------------------------------------------------------------------

interface DeviceFramePreviewProps {
  children: React.ReactNode;
}

export function DeviceFramePreview({ children }: DeviceFramePreviewProps) {
  const { deviceMode } = useProfileEditor();
  const dispatch = useProfileEditorDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const computeScale = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 32; // account for p-4 padding
    const deviceWidth = DEVICE_BREAKPOINTS[deviceMode].width;
    const newScale = Math.min(1, containerWidth / deviceWidth);
    setScale(newScale);
  }, [deviceMode]);

  useEffect(() => {
    computeScale();

    const observer = new ResizeObserver(() => {
      computeScale();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [computeScale]);

  const { width, height } = DEVICE_BREAKPOINTS[deviceMode];
  const borderRadius = deviceMode === 'phone' ? '2rem' : '0.75rem';

  return (
    <div className="flex flex-col gap-4">
      {/* Device toggle bar */}
      <div className="flex items-center justify-center gap-2">
        {DEVICE_BUTTONS.map(({ mode, icon: Icon, label }) => {
          const isActive = deviceMode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-label={label}
              onClick={() => dispatch({ type: 'SET_DEVICE_MODE', mode })}
              className={`p-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>

      {/* Preview container */}
      <div
        ref={containerRef}
        className="overflow-hidden bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-start justify-center p-4"
        style={{ minHeight: height * scale + 32 }}
      >
        {/* Scaled device frame */}
        <div
          data-testid="device-frame"
          className="bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden origin-top"
          style={{
            width,
            height,
            borderRadius,
            transform: `scale(${scale})`,
          }}
        >
          {/* Phone notch */}
          {deviceMode === 'phone' && (
            <div className="relative z-10 flex justify-center pt-2">
              <div className="w-[30%] h-[24px] bg-black rounded-full" />
            </div>
          )}

          {/* Content */}
          <div className="h-full overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
