import React from 'react';
import { Palette } from 'lucide-react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  presets?: string[];
  className?: string;
}

const DEFAULT_PRESETS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#1e293b', // Slate
  '#000000', // Black
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
        <Palette className="w-4 h-4" />
        {label}
      </label>
      
      <div className="flex flex-wrap gap-2">
        {presets.map((color) => (
          <button
            key={color}
            type="button"
            className={`w-8 h-8 rounded-full border transition-all ${
              value === color
                ? 'border-primary ring-2 ring-primary/20 scale-110'
                : 'border-transparent hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Select color ${color}`}
            aria-pressed={value === color}
          />
        ))}
        
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded-full opacity-0 absolute inset-0 cursor-pointer"
          />
          <div
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center bg-white cursor-pointer hover:border-text-secondary transition-colors"
            title="Custom color"
          >
            <div
              className="w-6 h-6 rounded-full"
              style={{
                background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
