/**
 * Focal Point Picker Component
 *
 * Interactive focal point selector with:
 * - Click-to-set focal point
 * - Drag crosshair positioning
 * - 3x3 grid overlay (rule of thirds)
 * - Real-time preview update
 *
 * Feature: Gallery Design Studio - Cover Photo Positioning
 */

import React, { useRef, useState, useEffect } from 'react';

interface FocalPoint {
  x: number;
  y: number;
}

interface FocalPointPickerProps {
  imageUrl: string;
  focalPoint: FocalPoint;
  onChange: (point: FocalPoint) => void;
}

export const FocalPointPicker: React.FC<FocalPointPickerProps> = ({
  imageUrl,
  focalPoint,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || (!isDragging && e.type !== 'click')) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    onChange({ x, y });
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove as any);

      return () => {
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMove as any);
      };
    }
  }, [isDragging]);

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-sm text-text-primary">Focal Point</h3>
      <p className="text-xs text-text-secondary">
        Click or drag to set the focal point. The grid shows rule of thirds.
      </p>

      {/* Image Container with Focal Point */}
      <div
        ref={containerRef}
        className="relative w-full aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-bg-secondary to-bg-tertiary border border-border-default cursor-crosshair group"
        onClick={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
      >
        {/* Background Image */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Cover preview"
            className="w-full h-full object-cover"
            style={{
              objectPosition: `${focalPoint.x}% ${focalPoint.y}%`,
            }}
            draggable={false}
          />
        )}

        {/* Rule of Thirds Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-30 group-hover:opacity-50 transition-opacity">
          <svg className="w-full h-full" preserveAspectRatio="none">
            {/* Vertical lines */}
            <line x1="33.333%" y1="0" x2="33.333%" y2="100%" stroke="white" strokeWidth="1" />
            <line x1="66.666%" y1="0" x2="66.666%" y2="100%" stroke="white" strokeWidth="1" />
            {/* Horizontal lines */}
            <line x1="0" y1="33.333%" x2="100%" y2="33.333%" stroke="white" strokeWidth="1" />
            <line x1="0" y1="66.666%" x2="100%" y2="66.666%" stroke="white" strokeWidth="1" />
          </svg>
        </div>

        {/* Focal Point Crosshair */}
        <div
          className="absolute w-8 h-8 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${focalPoint.x}%`,
            top: `${focalPoint.y}%`,
          }}
        >
          {/* Crosshair */}
          <svg className="w-full h-full" viewBox="0 0 32 32">
            {/* Outer circle */}
            <circle cx="16" cy="16" r="14" fill="none" stroke="white" strokeWidth="1" opacity="0.8" />
            {/* Inner circle */}
            <circle cx="16" cy="16" r="8" fill="none" stroke="white" strokeWidth="1" opacity="0.8" />
            {/* Horizontal line */}
            <line x1="2" y1="16" x2="30" y2="16" stroke="white" strokeWidth="1" opacity="0.6" />
            {/* Vertical line */}
            <line x1="16" y1="2" x2="16" y2="30" stroke="white" strokeWidth="1" opacity="0.6" />
            {/* Center dot */}
            <circle cx="16" cy="16" r="2" fill="white" />
          </svg>
        </div>

        {/* Center indicator for rule of thirds */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-1 h-1 bg-white/50 rounded-full" />
        </div>
      </div>

      {/* Numerical Input */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-text-secondary">X Position</label>
          <div className="flex items-center gap-1 mt-1">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(focalPoint.x)}
              onChange={(e) => onChange({ ...focalPoint, x: parseInt(e.target.value) })}
              className="flex-1 h-1 bg-border-default rounded appearance-none"
            />
            <span className="text-xs text-text-primary w-8 text-right">
              {Math.round(focalPoint.x)}%
            </span>
          </div>
        </div>

        <div>
          <label className="text-xs text-text-secondary">Y Position</label>
          <div className="flex items-center gap-1 mt-1">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(focalPoint.y)}
              onChange={(e) => onChange({ ...focalPoint, y: parseInt(e.target.value) })}
              className="flex-1 h-1 bg-border-default rounded appearance-none"
            />
            <span className="text-xs text-text-primary w-8 text-right">
              {Math.round(focalPoint.y)}%
            </span>
          </div>
        </div>
      </div>

      {/* Preset Positions */}
      <div>
        <label className="text-xs text-text-secondary block mb-2">Quick Presets</label>
        <div className="grid grid-cols-3 gap-1">
          {[
            { label: '↖', x: 25, y: 25 },
            { label: '↑', x: 50, y: 25 },
            { label: '↗', x: 75, y: 25 },
            { label: '←', x: 25, y: 50 },
            { label: '●', x: 50, y: 50 },
            { label: '→', x: 75, y: 50 },
            { label: '↙', x: 25, y: 75 },
            { label: '↓', x: 50, y: 75 },
            { label: '↘', x: 75, y: 75 },
          ].map(({ label, x, y }) => (
            <button
              key={`${x}-${y}`}
              onClick={() => onChange({ x, y })}
              className={`p-2 text-sm rounded border transition-all ${
                Math.abs(focalPoint.x - x) < 5 && Math.abs(focalPoint.y - y) < 5
                  ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                  : 'border-border-default hover:border-accent-primary'
              }`}
              title={`Set to ${x}%, ${y}%`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FocalPointPicker;
