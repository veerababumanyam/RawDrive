/**
 * AvatarEditorControls Component
 *
 * Control panel for the Avatar Editor with:
 * - Zoom slider
 * - Rotation controls (90° buttons, free rotation slider)
 * - Flip controls (horizontal, vertical)
 * - Filter controls (brightness, contrast, saturation)
 * - Reset buttons
 */

import React, { useCallback, useState, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Sun,
  Contrast,
  Palette,
  RotateCcw as ResetIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AvatarEditorControlsProps, CONTROL_RANGES } from './types';

// =============================================================================
// Slider Component
// =============================================================================

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  icon?: React.ReactNode;
  formatValue?: (value: number) => string;
  'aria-label'?: string;
}

const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  icon,
  formatValue,
  'aria-label': ariaLabel,
}) => {
  const displayValue = formatValue ? formatValue(value) : value.toString();

  return (
    <div className="flex items-center gap-3">
      {icon && (
        <div className="flex items-center justify-center w-8 h-8 text-text-secondary">
          {icon}
        </div>
      )}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary">{label}</span>
          <span className="text-xs text-text-tertiary font-mono">{displayValue}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-primary
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:shadow-sm
            [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-primary
            [&::-moz-range-thumb]:cursor-pointer
            [&::-moz-range-thumb]:border-0
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={ariaLabel || label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
        />
      </div>
    </div>
  );
};

// =============================================================================
// Icon Button Component
// =============================================================================

interface IconButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
}

const IconButton: React.FC<IconButtonProps> = ({
  onClick,
  icon,
  label,
  active = false,
  disabled = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`
      flex items-center justify-center min-w-[44px] min-h-[44px] p-2.5 rounded-lg
      transition-colors duration-150
      ${
        active
          ? 'bg-primary/20 text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
    `}
    aria-label={label}
    aria-pressed={active}
  >
    {icon}
  </button>
);

// =============================================================================
// Main Component
// =============================================================================

export const AvatarEditorControls: React.FC<AvatarEditorControlsProps> = ({
  // Current values
  zoom,
  rotation,
  flipHorizontal,
  flipVertical,
  brightness,
  contrast,
  saturation,

  // Feature flags
  enableRotation,
  enableFlip,
  enableFilters,

  // Callbacks
  onZoomChange,
  onRotationChange,
  onRotate90,
  onFlipH,
  onFlipV,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onResetTransforms,
  onResetFilters,
  onResetAll,

  // State
  isDirty,
}) => {
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Detect if we're in compact mode (no advanced features)
  const isCompactMode = !enableRotation && !enableFlip && !enableFilters;

  // Check if any filters are applied
  const hasFilters = brightness !== 0 || contrast !== 0 || saturation !== 0;

  // Check if any transforms are applied
  const hasTransforms =
    zoom !== 1 || rotation !== 0 || flipHorizontal || flipVertical;

  // Format zoom value
  const formatZoom = useCallback((value: number) => `${value.toFixed(1)}x`, []);

  // Format rotation value
  const formatRotation = useCallback((value: number) => `${value}°`, []);

  // Format filter value
  const formatFilter = useCallback((value: number) => {
    if (value > 0) return `+${value}`;
    return value.toString();
  }, []);

  // Debounced slider handlers
  const debouncedZoomChange = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return (value: number) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => onZoomChange(value), 16);
    };
  }, [onZoomChange]);

  // Calculate slider fill percentage for visual feedback
  const zoomPercent = ((zoom - CONTROL_RANGES.zoom.min) / (CONTROL_RANGES.zoom.max - CONTROL_RANGES.zoom.min)) * 100;

  // Compact mode: Clean zoom slider with visible track (like design system)
  if (isCompactMode) {
    return (
      <div className="py-4">
        <div className="relative">
          {/* Track background */}
          <div className="absolute inset-y-0 left-0 right-0 flex items-center pointer-events-none">
            <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              {/* Filled portion */}
              <div
                className="h-full bg-primary rounded-full transition-all duration-75"
                style={{ width: `${zoomPercent}%` }}
              />
            </div>
          </div>
          {/* Actual input */}
          <input
            type="range"
            min={CONTROL_RANGES.zoom.min}
            max={CONTROL_RANGES.zoom.max}
            step={CONTROL_RANGES.zoom.step}
            value={zoom}
            onChange={(e) => debouncedZoomChange(parseFloat(e.target.value))}
            className="relative w-full h-2 bg-transparent appearance-none cursor-pointer z-10
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-6
              [&::-webkit-slider-thumb]:h-6
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:border-[3px]
              [&::-webkit-slider-thumb]:border-primary
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.15)]
              [&::-moz-range-thumb]:w-6
              [&::-moz-range-thumb]:h-6
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-white
              [&::-moz-range-thumb]:border-[3px]
              [&::-moz-range-thumb]:border-primary
              [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-thumb]:border-solid
              focus-visible:outline-none"
            aria-label="Adjust photo size"
            aria-valuemin={CONTROL_RANGES.zoom.min}
            aria-valuemax={CONTROL_RANGES.zoom.max}
            aria-valuenow={zoom}
          />
        </div>
      </div>
    );
  }

  // Full mode: All controls
  return (
    <div className="space-y-4 py-4 px-1">
      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <IconButton
          onClick={() => onZoomChange(Math.max(zoom - 0.1, CONTROL_RANGES.zoom.min))}
          icon={<ZoomOut size={18} />}
          label="Zoom out"
        />
        <div className="flex-1">
          <Slider
            label="Zoom"
            value={zoom}
            min={CONTROL_RANGES.zoom.min}
            max={CONTROL_RANGES.zoom.max}
            step={CONTROL_RANGES.zoom.step}
            onChange={debouncedZoomChange}
            formatValue={formatZoom}
            aria-label="Zoom level"
          />
        </div>
        <IconButton
          onClick={() => onZoomChange(Math.min(zoom + 0.1, CONTROL_RANGES.zoom.max))}
          icon={<ZoomIn size={18} />}
          label="Zoom in"
        />
      </div>

      {/* Rotation Controls */}
      {enableRotation && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Rotation</span>
            <div className="flex items-center gap-1">
              <IconButton
                onClick={() => onRotate90('ccw')}
                icon={<RotateCcw size={18} />}
                label="Rotate 90° counter-clockwise"
              />
              <IconButton
                onClick={() => onRotate90('cw')}
                icon={<RotateCw size={18} />}
                label="Rotate 90° clockwise"
              />
            </div>
          </div>
          <Slider
            label="Fine rotation"
            value={rotation}
            min={CONTROL_RANGES.rotation.min}
            max={CONTROL_RANGES.rotation.max}
            step={CONTROL_RANGES.rotation.step}
            onChange={onRotationChange}
            formatValue={formatRotation}
            aria-label="Rotation angle"
          />
        </div>
      )}

      {/* Flip Controls */}
      {enableFlip && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Flip</span>
          <div className="flex items-center gap-1">
            <IconButton
              onClick={onFlipH}
              icon={<FlipHorizontal2 size={18} />}
              label="Flip horizontal"
              active={flipHorizontal}
            />
            <IconButton
              onClick={onFlipV}
              icon={<FlipVertical2 size={18} />}
              label="Flip vertical"
              active={flipVertical}
            />
          </div>
        </div>
      )}

      {/* Filter Controls (Collapsible) */}
      {enableFilters && (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="w-full flex items-center justify-between text-sm text-text-secondary hover:text-text-primary transition-colors"
            aria-expanded={filtersExpanded}
          >
            <span className="flex items-center gap-2">
              Adjustments
              {hasFilters && (
                <span className="w-2 h-2 rounded-full bg-primary" aria-label="Filters applied" />
              )}
            </span>
            {filtersExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {filtersExpanded && (
            <div className="mt-4 space-y-4">
              <Slider
                label="Brightness"
                value={brightness}
                min={CONTROL_RANGES.brightness.min}
                max={CONTROL_RANGES.brightness.max}
                step={CONTROL_RANGES.brightness.step}
                onChange={onBrightnessChange}
                icon={<Sun size={16} />}
                formatValue={formatFilter}
                aria-label="Brightness adjustment"
              />
              <Slider
                label="Contrast"
                value={contrast}
                min={CONTROL_RANGES.contrast.min}
                max={CONTROL_RANGES.contrast.max}
                step={CONTROL_RANGES.contrast.step}
                onChange={onContrastChange}
                icon={<Contrast size={16} />}
                formatValue={formatFilter}
                aria-label="Contrast adjustment"
              />
              <Slider
                label="Saturation"
                value={saturation}
                min={CONTROL_RANGES.saturation.min}
                max={CONTROL_RANGES.saturation.max}
                step={CONTROL_RANGES.saturation.step}
                onChange={onSaturationChange}
                icon={<Palette size={16} />}
                formatValue={formatFilter}
                aria-label="Saturation adjustment"
              />
              {hasFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  <ResetIcon size={12} />
                  Reset filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reset Buttons */}
      {isDirty && (
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-border">
          {hasTransforms && (
            <button
              type="button"
              onClick={onResetTransforms}
              className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <ResetIcon size={12} />
              Reset transforms
            </button>
          )}
          <button
            type="button"
            onClick={onResetAll}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ResetIcon size={12} />
            Reset all
          </button>
        </div>
      )}
    </div>
  );
};

AvatarEditorControls.displayName = 'AvatarEditorControls';

export default AvatarEditorControls;
