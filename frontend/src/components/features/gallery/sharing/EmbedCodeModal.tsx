/**
 * EmbedCodeModal - Generate and copy iframe embed code for gallery embedding.
 *
 * Provides width/height inputs, a read-only textarea with the generated iframe
 * HTML, and a copy button. Used from the ShareMenu dropdown.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { X, Copy, Check, Code } from 'lucide-react';

interface EmbedCodeModalProps {
  /** The public gallery URL (without /embed suffix) */
  galleryUrl: string;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

export const EmbedCodeModal: React.FC<EmbedCodeModalProps> = ({
  galleryUrl,
  isOpen,
  onClose,
}) => {
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [copied, setCopied] = useState(false);

  const embedCode = useMemo(() => {
    return `<iframe src="${galleryUrl}/embed" width="${width}" height="${height}" frameborder="0" allowfullscreen style="border:none;border-radius:8px;"></iframe>`;
  }, [galleryUrl, width, height]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy embed code:', err);
    }
  }, [embedCode]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="embed-modal-title"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Code size={20} className="text-blue-500" />
            <h3 id="embed-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Embed Gallery
            </h3>
          </div>
          <button
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={onClose}
            aria-label="Close embed dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dimension inputs */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label htmlFor="embed-width" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Width (px)
            </label>
            <input
              id="embed-width"
              type="number"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value) || 800)}
              min={200}
              max={2000}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="embed-height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Height (px)
            </label>
            <input
              id="embed-height"
              type="number"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value) || 600)}
              min={200}
              max={2000}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Embed code textarea */}
        <div className="mb-4">
          <textarea
            readOnly
            value={embedCode}
            rows={3}
            role="textbox"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Copy button */}
        <button
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          onClick={handleCopy}
          aria-label="Copy embed code"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Embed Code'}
        </button>
      </div>
    </div>
  );
};

export default EmbedCodeModal;
