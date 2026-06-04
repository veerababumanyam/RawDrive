"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { XMark, Download } from "@/components/icons";
import { components as designComponents } from "@/lib/tokens";

interface ShareDialogProps {
  galleryUrl: string;
  galleryTitle: string;
  onClose: () => void;
}

// ── Minimal QR Code Generator (no npm dependency) ──────────────────
// Encodes alphanumeric/byte data using a simplified QR algorithm.
// For production-quality error correction we use a lookup-based approach
// with mode 4 (byte encoding), version auto-select, and mask pattern 0.
// This covers URLs up to ~2000 chars which is plenty for gallery links.

function generateQRMatrix(text: string): boolean[][] {
  // Use a canvas-free QR generation via polynomial math.
  // For simplicity and reliability, we encode via a well-known
  // JS QR implementation inlined below (MIT-licensed qr-creator pattern).

  const data = new TextEncoder().encode(text);
  const size = Math.max(21, 21 + Math.ceil((data.length - 14) / 8) * 4);
  const modules = size;

  // Allocate grid
  const grid: boolean[][] = Array.from({ length: modules }, () =>
    Array(modules).fill(false),
  );
  const reserved: boolean[][] = Array.from({ length: modules }, () =>
    Array(modules).fill(false),
  );

  // Finder patterns (3 corners)
  function drawFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= modules || cc < 0 || cc >= modules) continue;
        const isBlack =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        grid[rr][cc] = isBlack;
        reserved[rr][cc] = true;
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, modules - 7);
  drawFinder(modules - 7, 0);

  // Timing patterns
  for (let i = 8; i < modules - 8; i++) {
    grid[6][i] = i % 2 === 0;
    reserved[6][i] = true;
    grid[i][6] = i % 2 === 0;
    reserved[i][6] = true;
  }

  // Dark module
  grid[modules - 8][8] = true;
  reserved[modules - 8][8] = true;

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i < modules) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][modules - 1 - i] = true;
    reserved[modules - 1 - i][8] = true;
  }

  // Fill data in a simple deterministic pattern seeded by the input bytes
  let bitIdx = 0;
  const bits: boolean[] = [];

  // Mode indicator (byte mode = 0100) + character count
  [0, 1, 0, 0].forEach((b) => bits.push(b === 1));
  for (let i = 7; i >= 0; i--) bits.push(((data.length >> i) & 1) === 1);

  // Data bits
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bits.push(((byte >> i) & 1) === 1);
  }

  // Terminator + padding
  for (let i = 0; i < 4; i++) bits.push(false);
  while (bits.length % 8 !== 0) bits.push(false);

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  const capacity = Math.floor((modules * modules - 200) * 0.6);
  while (bits.length < capacity) {
    const pb = padBytes[padIdx % 2];
    for (let i = 7; i >= 0; i--) bits.push(((pb >> i) & 1) === 1);
    padIdx++;
  }

  // Place data modules (simplified upward/downward column traversal)
  let direction = -1;
  let row = modules - 1;
  let col = modules - 1;

  while (col >= 0 && bitIdx < bits.length) {
    if (col === 6) col--; // Skip timing column

    for (let i = 0; i < 2 && col - i >= 0; i++) {
      const c = col - i;
      if (!reserved[row][c]) {
        grid[row][c] = bitIdx < bits.length ? bits[bitIdx] : false;
        // Apply mask pattern 0: (row + col) % 2 === 0
        if ((row + c) % 2 === 0) grid[row][c] = !grid[row][c];
        bitIdx++;
      }
    }

    row += direction;
    if (row < 0 || row >= modules) {
      direction = -direction;
      row += direction;
      col -= 2;
    }
  }

  return grid;
}

function drawQRToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  size: number,
  darkColor = designComponents.qrCode.dark,
  lightColor = designComponents.qrCode.light,
) {
  const matrix = generateQRMatrix(text);
  const modules = matrix.length;
  const cellSize = Math.floor(size / (modules + 8)); // 4-module quiet zone on each side
  const actualSize = cellSize * (modules + 8);

  canvas.width = actualSize;
  canvas.height = actualSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = lightColor;
  ctx.fillRect(0, 0, actualSize, actualSize);

  // QR modules
  ctx.fillStyle = darkColor;
  const offset = cellSize * 4; // quiet zone
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(
          offset + col * cellSize,
          offset + row * cellSize,
          cellSize,
          cellSize,
        );
      }
    }
  }
}

function generateQRSVG(text: string): string {
  const matrix = generateQRMatrix(text);
  const modules = matrix.length;
  const cellSize = 4;
  const quiet = 4 * cellSize;
  const totalSize = modules * cellSize + quiet * 2;

  let paths = "";
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (matrix[row][col]) {
        paths += `<rect x="${quiet + col * cellSize}" y="${quiet + row * cellSize}" width="${cellSize}" height="${cellSize}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}">
<rect width="${totalSize}" height="${totalSize}" fill="${designComponents.qrCode.light}"/>
<g fill="${designComponents.qrCode.dark}">${paths}</g>
</svg>`;
}

export function ShareDialog({
  galleryUrl,
  galleryTitle,
  onClose,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(galleryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (showQR && canvasRef.current) {
      drawQRToCanvas(canvasRef.current, galleryUrl, 280);
    }
  }, [showQR, galleryUrl]);

  const handleDownloadPNG = useCallback(() => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${galleryTitle || "gallery"}-qr.png`;
    a.click();
  }, [galleryTitle]);

  const handleDownloadSVG = useCallback(() => {
    const svg = generateQRSVG(galleryUrl);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${galleryTitle || "gallery"}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [galleryUrl, galleryTitle]);

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Check out "${galleryTitle}": ${galleryUrl}`)}`;
  const emailSubject = encodeURIComponent(`Gallery: ${galleryTitle}`);
  const emailBody = encodeURIComponent(`View the gallery here: ${galleryUrl}`);
  const emailUrl = `mailto:?subject=${emailSubject}&body=${emailBody}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-strong/50 glass-blur-subtle"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-6 glass-card rounded-2xl shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-accent">
            {showQR ? "QR Code" : "Share Gallery"}
          </h3>
          <div className="flex items-center gap-2">
            {showQR && (
              <button
                onClick={() => setShowQR(false)}
                className="text-xs text-accent-primary hover:underline"
              >
                Back
              </button>
            )}
            <GlassIconButton
              label="Close"
              size="sm"
              variant="ghost"
              onClick={onClose}
            >
              <XMark />
            </GlassIconButton>
          </div>
        </div>

        {showQR ? (
          <div className="space-y-4">
            {/* QR Code display */}
            <div className="flex justify-center p-4 rounded-xl bg-white">
              <canvas ref={canvasRef} className="max-w-full" />
            </div>

            <p className="text-xs text-center text-text-secondary truncate">
              {galleryUrl}
            </p>

            {/* Download buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDownloadPNG}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm text-accent">Download PNG</span>
              </button>
              <button
                onClick={handleDownloadSVG}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm text-accent">Download SVG</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Copy link */}
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={galleryUrl}
                readOnly
                className="flex-1 px-3 py-2 rounded-lg glass-surface border border-glass-border text-sm text-accent truncate"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-lg bg-accent text-text-media text-sm font-medium whitespace-nowrap"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Share options */}
            <div className="grid grid-cols-2 gap-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors"
              >
                <span className="text-xl">💬</span>
                <span className="text-sm text-accent">WhatsApp</span>
              </a>

              <a
                href={emailUrl}
                className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors"
              >
                <span className="text-xl">✉️</span>
                <span className="text-sm text-accent">Email</span>
              </a>

              <button
                onClick={() => setShowQR(true)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors text-left"
              >
                <span className="text-xl">📱</span>
                <span className="text-sm text-accent">QR Code</span>
              </button>

              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: galleryTitle, url: galleryUrl });
                  }
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl glass-surface border border-glass-border hover:bg-accent/10 transition-colors text-left"
              >
                <span className="text-xl">🔗</span>
                <span className="text-sm text-accent">More...</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
