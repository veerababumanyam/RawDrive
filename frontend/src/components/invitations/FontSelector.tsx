import React from 'react';
import { Type } from 'lucide-react';
import { Select } from '@/components/ui/FormControls';

interface FontSelectorProps {
  label: string;
  value: string;
  onChange: (font: string) => void;
  className?: string;
  error?: string;
}

const ALLOWED_FONTS = [
  "Inter",
  "Playfair Display",
  "Lora",
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Lato",
  "Merriweather",
  "Oswald",
  "Source Sans Pro",
  "Slabo 27px",
  "Raleway",
  "PT Sans",
  "Great Vibes",
  "Dancing Script",
  "Parisienne",
  "Allura",
  "Sacramento",
  "Satisfy",
  "Cookie",
].sort();

export const FontSelector: React.FC<FontSelectorProps> = ({
  label,
  value,
  onChange,
  className = '',
  error,
}) => {
  const options = ALLOWED_FONTS.map((font) => ({
    label: font,
    value: font,
  }));

  return (
    <div className={className}>
      <Select
        label={label}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        options={options}
        error={error}
      />
      {/* Dynamic style tag to load the selected font for preview if not already loaded */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=${value.replace(/ /g, '+')}&display=swap');`}
      </style>
      <div className="mt-2 p-3 border border-border rounded-md bg-surface-hover">
        <p className="text-sm" style={{ fontFamily: value }}>
          The quick brown fox jumps over the lazy dog.
        </p>
      </div>
    </div>
  );
};
