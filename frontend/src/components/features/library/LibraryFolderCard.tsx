import React, { useState, useRef, useEffect } from 'react';
import { Folder, MoreVertical, Edit, Trash2, FolderOpen, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type { LibraryFolder } from '../../../services/libraryService';

interface LibraryFolderCardProps {
  folder: LibraryFolder;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const LibraryFolderCard: React.FC<LibraryFolderCardProps> = ({
  folder,
  onClick,
  onEdit,
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const folderColor = folder.color || '#3B82F6';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        onClick={onClick}
        className="
          card-glass rounded-xl p-4 cursor-pointer
          border border-white/10 hover:border-white/20
          transition-all duration-300
          hover:shadow-lg hover:shadow-black/20
        "
        style={{
          borderColor: isHovered ? `${folderColor}40` : undefined,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Folder Icon */}
          <div
            className="p-2.5 rounded-xl transition-all duration-300 group-hover:scale-105"
            style={{
              backgroundColor: `${folderColor}20`,
            }}
          >
            {isHovered ? (
              <FolderOpen
                className="w-6 h-6 transition-all duration-300"
                style={{ color: folderColor }}
              />
            ) : (
              <Folder
                className="w-6 h-6 transition-all duration-300"
                style={{ color: folderColor }}
              />
            )}
          </div>

          {/* Folder Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-text-primary truncate group-hover:text-primary transition-colors">
              {folder.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-text-tertiary mt-0.5">
              <span>
                {folder.asset_count} {folder.asset_count === 1 ? 'asset' : 'assets'}
              </span>
              {(folder.subfolder_count ?? 0) > 0 && (
                <>
                  <span className="w-1 h-1 rounded-full bg-text-tertiary" />
                  <span>{folder.subfolder_count} folders</span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Menu Button */}
            <div ref={menuRef} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="
                  p-2 rounded-lg opacity-0 group-hover:opacity-100
                  hover:bg-surface-hover text-text-tertiary hover:text-text-primary
                  transition-all duration-200
                "
                aria-label="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Dropdown Menu */}
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  className="absolute right-0 top-full mt-1 w-36 card-glass rounded-xl shadow-xl z-20 overflow-hidden border border-white/10"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onEdit();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                  >
                    <Edit size={14} />
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onDelete();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </motion.div>
              )}
            </div>

            {/* Navigate Arrow */}
            <ChevronRight 
              className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5" 
            />
          </div>
        </div>

        {/* Description if available */}
        {folder.description && (
          <p className="text-xs text-text-tertiary mt-2 line-clamp-1 pl-[52px]">
            {folder.description}
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default LibraryFolderCard;
