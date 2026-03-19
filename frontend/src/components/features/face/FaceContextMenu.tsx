/**
 * FaceContextMenu Component
 *
 * Right-click context menu for face group cards.
 * Wraps the existing ContextMenu UI component with face-specific actions.
 */

import React from 'react';
import { Edit, Merge, Trash2, Eye } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '../../ui/ContextMenu';
import type { FaceGroup } from '../../../services/faceApiService';

export interface FaceContextMenuProps {
  group: FaceGroup;
  isOpen: boolean;
  position: { x: number; y: number };
  onRename: (group: FaceGroup) => void;
  onMerge: (group: FaceGroup) => void;
  onDelete: (group: FaceGroup) => void;
  onViewPhotos: (group: FaceGroup) => void;
  onClose: () => void;
}

export const FaceContextMenu: React.FC<FaceContextMenuProps> = ({
  group,
  isOpen,
  position,
  onRename,
  onMerge,
  onDelete,
  onViewPhotos,
  onClose,
}) => {
  const items: ContextMenuItem[] = [
    {
      label: 'View all photos',
      icon: <Eye className="w-4 h-4" />,
      onClick: () => onViewPhotos(group),
    },
    {
      label: 'Rename',
      icon: <Edit className="w-4 h-4" />,
      onClick: () => onRename(group),
    },
    {
      label: 'Merge with...',
      icon: <Merge className="w-4 h-4" />,
      onClick: () => onMerge(group),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => onDelete(group),
      variant: 'destructive' as const,
      separator: true,
    },
  ];

  return (
    <ContextMenu
      isOpen={isOpen}
      onClose={onClose}
      items={items}
      x={position.x}
      y={position.y}
    />
  );
};

export default FaceContextMenu;
