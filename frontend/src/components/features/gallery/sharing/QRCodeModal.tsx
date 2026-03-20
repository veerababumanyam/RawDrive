/**
 * QRCodeModal - Re-export of QR code functionality from ShareMenu.
 *
 * The QR code modal is built into the ShareMenu component.
 * This module provides a standalone version for direct use.
 */

import React, { useRef, useCallback } from 'react';
import { X, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const QR_CODE_SIZE = 256;

interface QRCodeModalProps {
  /** The URL to encode in the QR code */
  galleryUrl: string;
  /** Gallery title for the download filename */
  title?: string;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Optional foreground color (defaults to black) */
  fgColor?: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  galleryUrl,
  title = 'Gallery',
  isOpen,
  onClose,
  fgColor = '#000000',
}) => {
  const qrRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(() => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = QR_CODE_SIZE * 2;
      canvas.height = QR_CODE_SIZE * 2;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-qr-code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    img.src = url;
  }, [title]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 id="qr-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Scan to View Gallery
          </h3>
          <button
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={onClose}
            aria-label="Close QR code dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex justify-center p-4 bg-white rounded-xl mb-4" ref={qrRef}>
          <QRCodeSVG
            value={galleryUrl}
            size={QR_CODE_SIZE}
            level="H"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor={fgColor}
          />
        </div>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-4 truncate">
          {title}
        </p>

        <button
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm transition-colors"
          onClick={handleDownload}
        >
          <Download size={16} />
          Download QR Code
        </button>
      </div>
    </div>
  );
};

export default QRCodeModal;
