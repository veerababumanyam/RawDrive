/**
 * SubGalleryTree - Hierarchical display component for nested sub-galleries
 *
 * Displays sub-galleries in a tree structure with expand/collapse support.
 * Supports up to 3 levels of nesting.
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US7 - Nested Sub-Galleries
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  Image,
} from 'lucide-react';

export interface SubGalleryTreeNode {
  /** Sub-gallery ID */
  sub_gallery_id: string;
  /** Display name */
  name: string;
  /** Number of photos */
  photo_count: number;
  /** Cover asset ID */
  cover_asset_id?: string | null;
  /** Parent sub-gallery ID */
  parent_sub_gallery_id?: string | null;
  /** Nesting depth (1-3) */
  depth: number;
  /** Whether visible in public gallery */
  visible: boolean;
  /** Child sub-galleries */
  children?: SubGalleryTreeNode[];
}

interface SubGalleryTreeProps {
  /** List of sub-galleries (flat or nested) */
  subGalleries: SubGalleryTreeNode[];
  /** Currently selected sub-gallery ID */
  selectedId?: string | null;
  /** Callback when a sub-gallery is selected */
  onSelect?: (subGallery: SubGalleryTreeNode) => void;
  /** Callback to add a new sub-gallery */
  onAdd?: (parentId?: string) => void;
  /** Callback to edit a sub-gallery */
  onEdit?: (subGallery: SubGalleryTreeNode) => void;
  /** Callback to delete a sub-gallery */
  onDelete?: (subGallery: SubGalleryTreeNode) => void;
  /** Whether to show add/edit/delete actions */
  showActions?: boolean;
  /** Maximum depth for adding new sub-galleries */
  maxDepth?: number;
  /** Optional className */
  className?: string;
}

/**
 * Build tree structure from flat list of sub-galleries
 */
function buildTree(subGalleries: SubGalleryTreeNode[]): SubGalleryTreeNode[] {
  const nodeMap = new Map<string, SubGalleryTreeNode>();
  const roots: SubGalleryTreeNode[] = [];

  // First pass: create nodes with empty children
  subGalleries.forEach(sg => {
    nodeMap.set(sg.sub_gallery_id, { ...sg, children: [] });
  });

  // Second pass: build hierarchy
  subGalleries.forEach(sg => {
    const node = nodeMap.get(sg.sub_gallery_id)!;
    if (sg.parent_sub_gallery_id && nodeMap.has(sg.parent_sub_gallery_id)) {
      const parent = nodeMap.get(sg.parent_sub_gallery_id)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort by depth, then by name
  const sortNodes = (nodes: SubGalleryTreeNode[]): SubGalleryTreeNode[] => {
    return nodes
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(node => ({
        ...node,
        children: node.children ? sortNodes(node.children) : [],
      }));
  };

  return sortNodes(roots);
}

/**
 * Single tree node component
 */
interface TreeNodeProps {
  node: SubGalleryTreeNode;
  selectedId?: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect?: (node: SubGalleryTreeNode) => void;
  onAdd?: (parentId?: string) => void;
  onEdit?: (node: SubGalleryTreeNode) => void;
  onDelete?: (node: SubGalleryTreeNode) => void;
  showActions: boolean;
  maxDepth: number;
  level: number;
}

function TreeNode({
  node,
  selectedId,
  expandedIds,
  onToggleExpand,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  showActions,
  maxDepth,
  level,
}: TreeNodeProps) {
  const { t } = useTranslation('gallery');
  const [showMenu, setShowMenu] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.sub_gallery_id);
  const isSelected = selectedId === node.sub_gallery_id;
  const canAddChild = node.depth < maxDepth;

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(node.sub_gallery_id);
  }, [node.sub_gallery_id, onToggleExpand]);

  const handleSelect = useCallback(() => {
    onSelect?.(node);
  }, [node, onSelect]);

  const handleAddChild = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onAdd?.(node.sub_gallery_id);
  }, [node.sub_gallery_id, onAdd]);

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onEdit?.(node);
  }, [node, onEdit]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete?.(node);
  }, [node, onDelete]);

  return (
    <div className="select-none">
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer
          transition-colors group
          ${isSelected
            ? 'bg-primary/10 text-primary dark:bg-primary/20'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            aria-label={isExpanded ? t('subGallery.collapse', 'Collapse') : t('subGallery.expand', 'Expand')}
          >
            {isExpanded ? (
              <ChevronDown size={16} className="text-gray-500" />
            ) : (
              <ChevronRight size={16} className="text-gray-500" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Folder icon */}
        {isExpanded && hasChildren ? (
          <FolderOpen size={18} className="text-amber-500 flex-shrink-0" />
        ) : (
          <Folder size={18} className="text-amber-500 flex-shrink-0" />
        )}

        {/* Name and count */}
        <span className="flex-1 truncate text-sm font-medium">
          {node.name}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
          {node.photo_count}
        </span>

        {/* Visibility indicator */}
        {!node.visible && (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic mr-2">
            {t('subGallery.hidden', 'Hidden')}
          </span>
        )}

        {/* Actions menu */}
        {showActions && (
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              aria-label={t('subGallery.moreOptions', 'More options')}
            >
              <MoreVertical size={16} />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                  }}
                />
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                  {canAddChild && onAdd && (
                    <button
                      onClick={handleAddChild}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <Plus size={16} />
                      {t('subGallery.addChild', 'Add sub-folder')}
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <Edit2 size={16} />
                      {t('subGallery.edit', 'Edit')}
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 size={16} />
                      {t('subGallery.delete', 'Delete')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div role="group">
          {node.children!.map(child => (
            <TreeNode
              key={child.sub_gallery_id}
              node={child}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              showActions={showActions}
              maxDepth={maxDepth}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SubGalleryTree component for displaying nested sub-galleries
 *
 * @example
 * ```tsx
 * <SubGalleryTree
 *   subGalleries={gallery.sub_galleries}
 *   selectedId={activeSubGallery}
 *   onSelect={(sg) => setActiveSubGallery(sg.sub_gallery_id)}
 *   showActions={true}
 *   onAdd={(parentId) => handleAddSubGallery(parentId)}
 * />
 * ```
 */
export function SubGalleryTree({
  subGalleries,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  showActions = false,
  maxDepth = 3,
  className = '',
}: SubGalleryTreeProps) {
  const { t } = useTranslation('gallery');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Build tree structure from flat list
  const treeNodes = useMemo(() => buildTree(subGalleries), [subGalleries]);

  // Auto-expand ancestors of selected node
  React.useEffect(() => {
    if (selectedId) {
      const findAncestors = (nodes: SubGalleryTreeNode[], targetId: string, ancestors: string[] = []): string[] | null => {
        for (const node of nodes) {
          if (node.sub_gallery_id === targetId) {
            return ancestors;
          }
          if (node.children && node.children.length > 0) {
            const found = findAncestors(node.children, targetId, [...ancestors, node.sub_gallery_id]);
            if (found) return found;
          }
        }
        return null;
      };

      const ancestors = findAncestors(treeNodes, selectedId);
      if (ancestors && ancestors.length > 0) {
        setExpandedIds(prev => {
          const next = new Set(prev);
          ancestors.forEach(id => next.add(id));
          return next;
        });
      }
    }
  }, [selectedId, treeNodes]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (treeNodes.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
        <Folder size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t('subGallery.empty', 'No sub-galleries yet')}</p>
        {showActions && onAdd && (
          <button
            onClick={() => onAdd()}
            className="mt-3 text-primary hover:underline text-sm font-medium"
          >
            {t('subGallery.create', 'Create sub-gallery')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`space-y-0.5 ${className}`}
      role="tree"
      aria-label={t('subGallery.title', 'Sub-galleries')}
    >
      {/* "All Photos" option */}
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer
          transition-colors
          ${!selectedId
            ? 'bg-primary/10 text-primary dark:bg-primary/20'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }
        `}
        onClick={() => onSelect?.(null as any)}
        role="treeitem"
        aria-selected={!selectedId}
      >
        <span className="w-5" />
        <Image size={18} className="text-gray-500 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium">
          {t('subGallery.all', 'All Photos')}
        </span>
      </div>

      {/* Tree nodes */}
      {treeNodes.map(node => (
        <TreeNode
          key={node.sub_gallery_id}
          node={node}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          onSelect={onSelect}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          showActions={showActions}
          maxDepth={maxDepth}
          level={0}
        />
      ))}

      {/* Add root sub-gallery button */}
      {showActions && onAdd && (
        <button
          onClick={() => onAdd()}
          className="flex items-center gap-2 px-2 py-1.5 w-full rounded-lg text-sm text-primary hover:bg-primary/5 transition-colors"
        >
          <span className="w-5" />
          <Plus size={18} />
          <span>{t('subGallery.create', 'Create sub-gallery')}</span>
        </button>
      )}
    </div>
  );
}

export default SubGalleryTree;
