/**
 * SubGallerySelector Component
 * Selector for choosing a sub-gallery destination
 * Used in bulk move operations
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import { Select } from '../../ui/FormControls';

export interface SubGallerySelectorProps {
  subGalleries: Array<{ sub_gallery_id: string; name: string }>;
  value: string | null; // null = Root Gallery
  onChange: (subGalleryId: string | null) => void;
  label?: string;
  className?: string;
}

export const SubGallerySelector: React.FC<SubGallerySelectorProps> = ({
  subGalleries,
  value,
  onChange,
  label = 'Select Sub-Gallery',
  className = '',
}) => {
  // Sort sub-galleries by sort_order
  const sortedSubGalleries = [...subGalleries].sort((a, b) => {
    // If sort_order is available, use it; otherwise sort by name
    const aOrder = 'sort_order' in a ? (a as any).sort_order : 0;
    const bOrder = 'sort_order' in b ? (b as any).sort_order : 0;
    return aOrder - bOrder;
  });

  const options = [
    { value: '', label: 'Root Gallery', icon: FolderOpen },
    ...sortedSubGalleries.map((sg) => ({
      value: sg.sub_gallery_id,
      label: sg.name,
      icon: FolderOpen,
    })),
  ];

  return (
    <div className={className}>
      <Select
        label={label}
        value={value || ''}
        onChange={(e) => {
          const selectedValue = e.target.value;
          onChange(selectedValue === '' ? null : selectedValue);
        }}
        options={options.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
        fullWidth
      />
    </div>
  );
};

