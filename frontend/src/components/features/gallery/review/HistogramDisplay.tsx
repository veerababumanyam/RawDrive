/**
 * HistogramDisplay Component
 * Luminance and RGB histogram visualization for Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T055
 *
 * Features:
 * - Luminance histogram with smooth curve
 * - RGB channel histograms (overlay mode)
 * - Toggle between luminance and RGB modes
 * - Exposure clipping warnings
 * - Responsive sizing
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface HistogramData {
  /** Luminance values (0-255 range, 256 buckets) */
  luminance: number[];
  /** Red channel values (optional) */
  red?: number[];
  /** Green channel values (optional) */
  green?: number[];
  /** Blue channel values (optional) */
  blue?: number[];
}

export interface HistogramDisplayProps {
  /** Histogram data */
  data: HistogramData | null;
  /** Display mode */
  mode?: 'luminance' | 'rgb';
  /** Height of the histogram */
  height?: number;
  /** Show clipping warnings */
  showClipping?: boolean;
  /** Clipping threshold (percentage) */
  clippingThreshold?: number;
  /** Loading state */
  isLoading?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Calculate clipping percentages for shadows and highlights
 */
const calculateClipping = (data: number[], threshold: number = 1): { shadows: number; highlights: number } => {
  if (!data || data.length === 0) return { shadows: 0, highlights: 0 };

  const total = data.reduce((sum, val) => sum + val, 0);
  if (total === 0) return { shadows: 0, highlights: 0 };

  // Count pixels in extreme shadow/highlight ranges (0-5 and 250-255)
  const shadowRange = data.slice(0, 6).reduce((sum, val) => sum + val, 0);
  const highlightRange = data.slice(250, 256).reduce((sum, val) => sum + val, 0);

  return {
    shadows: (shadowRange / total) * 100,
    highlights: (highlightRange / total) * 100,
  };
};

/**
 * Draw histogram on canvas
 */
const drawHistogram = (
  canvas: HTMLCanvasElement,
  data: HistogramData,
  mode: 'luminance' | 'rgb',
  showClipping: boolean
): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 2;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, width, height);

  // Get the max value for normalization
  const getMax = (arr: number[]): number => Math.max(...arr, 1);

  if (mode === 'luminance') {
    // Draw luminance histogram
    const maxLum = getMax(data.luminance);
    const barWidth = (width - padding * 2) / 256;

    // Fill gradient
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.moveTo(padding, height - padding);

    for (let i = 0; i < 256; i++) {
      const x = padding + i * barWidth;
      const barHeight = (data.luminance[i] / maxLum) * (height - padding * 2);
      const y = height - padding - barHeight;

      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        // Smooth curve using quadratic bezier
        const prevX = padding + (i - 1) * barWidth;
        const prevY = height - padding - (data.luminance[i - 1] / maxLum) * (height - padding * 2);
        const cpX = (prevX + x) / 2;
        ctx.quadraticCurveTo(cpX, prevY, x, y);
      }
    }

    ctx.lineTo(width - padding, height - padding);
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding - (data.luminance[0] / maxLum) * (height - padding * 2));

    for (let i = 1; i < 256; i++) {
      const x = padding + i * barWidth;
      const barHeight = (data.luminance[i] / maxLum) * (height - padding * 2);
      const y = height - padding - barHeight;
      const prevX = padding + (i - 1) * barWidth;
      const prevY = height - padding - (data.luminance[i - 1] / maxLum) * (height - padding * 2);
      const cpX = (prevX + x) / 2;
      ctx.quadraticCurveTo(cpX, prevY, x, y);
    }

    ctx.stroke();
  } else if (mode === 'rgb' && data.red && data.green && data.blue) {
    // Draw RGB histograms overlaid
    const channels = [
      { data: data.red, color: 'rgba(255, 0, 0, 0.5)' },
      { data: data.green, color: 'rgba(0, 255, 0, 0.5)' },
      { data: data.blue, color: 'rgba(0, 0, 255, 0.5)' },
    ];

    const maxVal = Math.max(getMax(data.red), getMax(data.green), getMax(data.blue));
    const barWidth = (width - padding * 2) / 256;

    channels.forEach(({ data: channelData, color }) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(padding, height - padding);

      for (let i = 0; i < 256; i++) {
        const x = padding + i * barWidth;
        const barHeight = (channelData[i] / maxVal) * (height - padding * 2);
        const y = height - padding - barHeight;

        if (i === 0) {
          ctx.lineTo(x, y);
        } else {
          const prevX = padding + (i - 1) * barWidth;
          const prevY = height - padding - (channelData[i - 1] / maxVal) * (height - padding * 2);
          const cpX = (prevX + x) / 2;
          ctx.quadraticCurveTo(cpX, prevY, x, y);
        }
      }

      ctx.lineTo(width - padding, height - padding);
      ctx.closePath();
      ctx.fill();
    });
  }

  // Draw clipping indicators
  if (showClipping && mode === 'luminance') {
    const clipping = calculateClipping(data.luminance);

    // Shadow clipping (left side, blue indicator)
    if (clipping.shadows > 1) {
      ctx.fillStyle = 'rgba(0, 100, 255, 0.7)';
      ctx.fillRect(padding, height - padding - 4, 3, 4);
    }

    // Highlight clipping (right side, red indicator)
    if (clipping.highlights > 1) {
      ctx.fillStyle = 'rgba(255, 50, 50, 0.7)';
      ctx.fillRect(width - padding - 3, height - padding - 4, 3, 4);
    }
  }

  // Draw border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
};

/**
 * HistogramDisplay - Visual histogram component
 */
export const HistogramDisplay: React.FC<HistogramDisplayProps> = ({
  data,
  mode = 'luminance',
  height = 80,
  showClipping = true,
  clippingThreshold = 1,
  isLoading = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentMode, setCurrentMode] = useState<'luminance' | 'rgb'>(mode);
  const [canvasWidth, setCanvasWidth] = useState(200);

  // Calculate clipping warnings
  const clipping = useMemo(() => {
    if (!data?.luminance) return { shadows: 0, highlights: 0 };
    return calculateClipping(data.luminance, clippingThreshold);
  }, [data, clippingThreshold]);

  const hasClipping = clipping.shadows > clippingThreshold || clipping.highlights > clippingThreshold;

  // Resize observer for responsive canvas
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) {
          setCanvasWidth(Math.floor(newWidth));
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Draw histogram when data or mode changes
  useEffect(() => {
    if (!canvasRef.current || !data) return;

    // Set canvas size with device pixel ratio for sharpness
    const dpr = window.devicePixelRatio || 1;
    canvasRef.current.width = canvasWidth * dpr;
    canvasRef.current.height = height * dpr;

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    drawHistogram(canvasRef.current, data, currentMode, showClipping);
  }, [data, currentMode, canvasWidth, height, showClipping]);

  // Toggle mode on click
  const handleClick = () => {
    if (data?.red && data?.green && data?.blue) {
      setCurrentMode((prev) => (prev === 'luminance' ? 'rgb' : 'luminance'));
    }
  };

  const hasRgb = data?.red && data?.green && data?.blue;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* Header with mode indicator and clipping warnings */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-tertiary uppercase tracking-wide">
          {currentMode === 'luminance' ? 'Luminance' : 'RGB'}
        </span>
        {hasClipping && showClipping && (
          <div className="flex items-center gap-1 text-amber-500">
            <AlertTriangle size={12} />
            <span>Clipping</span>
          </div>
        )}
      </div>

      {/* Histogram canvas */}
      <div
        ref={containerRef}
        className={`
          relative w-full rounded overflow-hidden
          ${hasRgb ? 'cursor-pointer' : ''}
        `}
        onClick={handleClick}
        role={hasRgb ? 'button' : undefined}
        aria-label={hasRgb ? `Click to toggle ${currentMode === 'luminance' ? 'RGB' : 'Luminance'} histogram` : undefined}
        title={hasRgb ? `Click to toggle histogram mode` : undefined}
      >
        {isLoading ? (
          <div
            className="flex items-center justify-center bg-black/30 rounded"
            style={{ height }}
          >
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : data ? (
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height,
              display: 'block',
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center bg-black/30 rounded text-text-tertiary text-xs"
            style={{ height }}
          >
            No histogram data
          </div>
        )}
      </div>

      {/* Clipping details */}
      {showClipping && data && (
        <div className="flex justify-between text-[10px] text-text-tertiary px-1">
          <span className={clipping.shadows > clippingThreshold ? 'text-blue-400' : ''}>
            {clipping.shadows.toFixed(1)}% shadows
          </span>
          <span className={clipping.highlights > clippingThreshold ? 'text-red-400' : ''}>
            {clipping.highlights.toFixed(1)}% highlights
          </span>
        </div>
      )}
    </div>
  );
};

export default HistogramDisplay;
