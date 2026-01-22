/**
 * Full-Page Cover Style Preview - Phase 2.5
 *
 * Displays a realistic gallery preview with the selected cover style
 * Features:
 * - Full-page immersive preview
 * - Mock gallery layout with title, description, and sample gallery items
 * - Responsive design (mobile, tablet, desktop views)
 * - Adjustable aspect ratio (9:16, 4:3, 16:9)
 * - Easy exit and style switching
 * - Focal point preview
 */

import React, { useState } from 'react';
import { X, Smartphone, Maximize2, Minimize2 } from 'lucide-react';

interface CoverStylePreviewProps {
  style: any;
  onClose: () => void;
  onSelectDifferent: () => void;
}

export const CoverStylePreview: React.FC<CoverStylePreviewProps> = ({
  style,
  onClose,
  onSelectDifferent,
}) => {
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '4:3' | '16:9'>('16:9');

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16]';
      case '4:3':
        return 'aspect-video';
      case '16:9':
      default:
        return 'aspect-video';
    }
  };

  const getAspectRatioPadding = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'max-w-sm mx-auto';
      case '4:3':
        return 'max-w-2xl mx-auto';
      case '16:9':
      default:
        return 'w-full';
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-black to-transparent border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{style.name} Preview</h1>
            <p className="text-sm text-gray-400 mt-1">{style.description}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSelectDifferent}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
            >
              Change Style
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              aria-label="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Aspect Ratio Controls */}
        <div className="px-4 py-3 border-t border-white/5 flex gap-2">
          <button
            onClick={() => setAspectRatio('9:16')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              aspectRatio === '9:16'
                ? 'bg-cyan-400 text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 inline mr-1" />
            Mobile (9:16)
          </button>
          <button
            onClick={() => setAspectRatio('4:3')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              aspectRatio === '4:3'
                ? 'bg-cyan-400 text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            Tablet (4:3)
          </button>
          <button
            onClick={() => setAspectRatio('16:9')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              aspectRatio === '16:9'
                ? 'bg-cyan-400 text-black'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5 inline mr-1" />
            Desktop (16:9)
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="py-8 px-4">
        <div className={`${getAspectRatioPadding()}`}>
          {/* Cover Photo Container */}
          <div
            className={`${getAspectRatioClass()} rounded-lg overflow-hidden shadow-2xl bg-gradient-to-b from-gray-800 to-gray-900 mb-8`}
          >
            {/* Cover Render - Fallback visual */}
            {style.thumbnail ? (
              <img
                src={style.thumbnail}
                alt={`${style.name} preview`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                <div className="text-center text-white/70">
                  <div className="text-xl font-bold mb-2">{style.name}</div>
                  <div className="text-sm">Gallery Title</div>
                </div>
              </div>
            )}
          </div>

          {/* Gallery Info Section - After Cover */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Sample Gallery
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              This is a preview of how your gallery will look with the {style.name} cover template. The cover appears at the top, followed by your gallery content.
            </p>

            {/* Sample Gallery Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow cursor-pointer group"
                >
                  <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-400 font-semibold group-hover:scale-105 transition-transform">
                    Photo {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Style Info Card */}
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 rounded-lg p-6 border border-cyan-200 dark:border-cyan-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
              {style.name} Style Details
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Category
                </p>
                <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">
                  {style.category}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Premium
                </p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {style.premium ? '⭐ Pro Only' : '✓ Free'}
                </p>
              </div>

              {style.isNew && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Status
                  </p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    ✨ New
                  </p>
                </div>
              )}

              {style.isTrending && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Trending
                  </p>
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    📈 Popular
                  </p>
                </div>
              )}
            </div>

            <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">
              {style.description}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-gradient-to-t from-black to-transparent border-t border-white/10 px-4 py-6">
        <div className="max-w-7xl mx-auto flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
          >
            Done
          </button>
          <button
            onClick={onSelectDifferent}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200"
          >
            Try Another Style
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoverStylePreview;
