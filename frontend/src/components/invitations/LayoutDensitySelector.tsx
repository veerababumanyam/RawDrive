import React from 'react';
import { AlignJustify, AlignCenter, AlignLeft } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';

interface LayoutDensitySelectorProps {
  value: 'compact' | 'normal' | 'spacious';
  onChange: (value: 'compact' | 'normal' | 'spacious') => void;
  className?: string;
}

export const LayoutDensitySelector: React.FC<LayoutDensitySelectorProps> = ({
  value,
  onChange,
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium text-text-secondary">
        Layout Density
      </label>
      <div className="flex gap-2 p-1 bg-surface-hover rounded-lg border border-border">
        <AppButton
          variant={value === 'compact' ? 'primary' : 'ghost'}
          size="sm"
          className="flex-1"
          onClick={() => onChange('compact')}
        >
          <AlignJustify className="w-4 h-4 mr-2" />
          Compact
        </AppButton>
        <AppButton
          variant={value === 'normal' ? 'primary' : 'ghost'}
          size="sm"
          className="flex-1"
          onClick={() => onChange('normal')}
        >
          <AlignCenter className="w-4 h-4 mr-2" />
          Normal
        </AppButton>
        <AppButton
          variant={value === 'spacious' ? 'primary' : 'ghost'}
          size="sm"
          className="flex-1"
          onClick={() => onChange('spacious')}
        >
          <AlignLeft className="w-4 h-4 mr-2" />
          Spacious
        </AppButton>
      </div>
    </div>
  );
};
