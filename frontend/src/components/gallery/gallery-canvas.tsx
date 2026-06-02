"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/api/assets";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { InfoCircle } from "@/components/icons";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";

type Density = "dense" | "standard" | "spacious";

interface GalleryCanvasProps {
  assets: Asset[];
  onAssetClick?: (asset: Asset, index: number) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  density?: Density;
  isProofing?: boolean;
}

const DENSITY_GAP: Record<Density, number> = {
  dense: 4,
  standard: 8,
  spacious: 16,
};

const ITEM_HEIGHT = 280;
const OVERSCAN = 5;

export function GalleryCanvas({
  assets,
  onAssetClick,
  onSelectionChange,
  density = "standard",
  isProofing = false,
}: GalleryCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [columns, setColumns] = useState(3);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Responsive column calculation
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width < 640) setColumns(1);
      else if (width < 1024) setColumns(2);
      else if (width < 1536) setColumns(3);
      else setColumns(4);
      setContainerHeight(entries[0]?.contentRect.height ?? 0);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const gap = DENSITY_GAP[density];
  const rowCount = Math.ceil(assets.length / columns);
  const totalHeight = rowCount * (ITEM_HEIGHT + gap);

  // Virtual scroll: only render visible rows
  const visibleRange = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / (ITEM_HEIGHT + gap)) - OVERSCAN);
    const endRow = Math.min(rowCount, Math.ceil((scrollTop + containerHeight) / (ITEM_HEIGHT + gap)) + OVERSCAN);
    return { startRow, endRow };
  }, [scrollTop, containerHeight, rowCount, gap]);

  const visibleAssets = useMemo(() => {
    const startIdx = visibleRange.startRow * columns;
    const endIdx = Math.min(visibleRange.endRow * columns, assets.length);
    return assets.slice(startIdx, endIdx).map((asset, i) => ({
      asset,
      index: startIdx + i,
    }));
  }, [assets, visibleRange, columns]);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange?.(next);
      return next;
    });
  }, [onSelectionChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 glass-surface border-b border-glass-border">
        <div className="flex items-center gap-2">
          <span className="text-sm text-secondary">{assets.length} photos</span>
          {selectedIds.size > 0 && (
            <span className="text-sm text-accent font-medium">{selectedIds.size} selected</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(["dense", "standard", "spacious"] as Density[]).map(d => (
            <button
              key={d}
              onClick={() => {/* density change handled by parent */}}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                density === d ? "bg-accent/20 text-accent" : "text-secondary hover:text-primary"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Virtual scroll container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ position: "relative" }}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: `${gap}px`,
              padding: `${gap}px`,
              position: "absolute",
              top: visibleRange.startRow * (ITEM_HEIGHT + gap),
              left: 0,
              right: 0,
            }}
          >
            {visibleAssets.map(({ asset, index }) => (
              <PhotoCard
                key={asset.id}
                asset={asset}
                isSelected={selectedIds.has(asset.id)}
                isHovered={hoveredId === asset.id}
                onMouseEnter={() => setHoveredId(asset.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onAssetClick?.(asset, index)}
                onSelect={() => toggleSelection(asset.id)}
                isProofing={isProofing}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// PhotoCard component with compound states
interface PhotoCardProps {
  asset: Asset;
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  onSelect: () => void;
  isProofing: boolean;
}

function PhotoCard({
  asset, isSelected, isHovered, onMouseEnter, onMouseLeave, onClick, onSelect, isProofing,
}: PhotoCardProps) {
  const thumbnailUrl = getAssetPreviewUrl(asset);
  const isFavorite = (asset as unknown as Record<string, unknown>).is_favorite === true;
  const isLocked = (asset as unknown as Record<string, unknown>).is_sensitive === true;

  return (
    <div
      className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 group ${
        isSelected ? "ring-2 ring-accent shadow-lg scale-[0.98]" : "hover:shadow-md"
      }`}
      style={{ height: ITEM_HEIGHT }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Image */}
      {isLocked ? (
        <div className="w-full h-full glass-surface flex items-center justify-center">
          <span className="text-4xl opacity-50">🔒</span>
        </div>
      ) : (
        <img
          src={thumbnailUrl}
          alt={asset.filename || "Photo"}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Selection checkbox */}
      {(isProofing || isHovered || isSelected) && (
        <button
          className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            isSelected
              ? "bg-accent border-accent text-white"
              : "bg-black/30 border-white/60 hover:border-white"
          }`}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          {isSelected && <span className="text-xs">✓</span>}
        </button>
      )}

      {/* Favorite indicator */}
      {isFavorite && (
        <div className="absolute top-2 right-2">
          <span className="text-red-500 text-lg">♥</span>
        </div>
      )}

      {/* Hover action bar */}
      {isHovered && !isLocked && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent flex gap-1 justify-end">
          <GlassIconButton
            label="Info"
            size="sm"
            variant="glass"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); }}
          >
            <InfoCircle className="w-4 h-4" />
          </GlassIconButton>
        </div>
      )}
    </div>
  );
}
