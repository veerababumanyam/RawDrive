/**
 * FlipbookViewer Component
 * Page-turn animation view for album spreads
 *
 * Feature: 026-album-proofing
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AlbumSpreadPublic } from '../../../types/album';

interface FlipbookViewerProps {
  spreads: AlbumSpreadPublic[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  className?: string;
}

type FlipDirection = 'left' | 'right' | null;

export function FlipbookViewer({
  spreads,
  currentIndex,
  onNavigate,
  className = '',
}: FlipbookViewerProps) {
  const { t } = useTranslation('album');
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<FlipDirection>(null);

  // Touch gesture state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const canGoNext = currentIndex < spreads.length - 1;
  const canGoPrev = currentIndex > 0;

  const goNext = useCallback(() => {
    if (canGoNext && !isFlipping) {
      setFlipDirection('left');
      setIsFlipping(true);
      setTimeout(() => {
        onNavigate(currentIndex + 1);
        setIsFlipping(false);
        setFlipDirection(null);
      }, 400);
    }
  }, [canGoNext, isFlipping, currentIndex, onNavigate]);

  const goPrev = useCallback(() => {
    if (canGoPrev && !isFlipping) {
      setFlipDirection('right');
      setIsFlipping(true);
      setTimeout(() => {
        onNavigate(currentIndex - 1);
        setIsFlipping(false);
        setFlipDirection(null);
      }, 400);
    }
  }, [canGoPrev, isFlipping, currentIndex, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  // Touch gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        // Swiped left - go next
        goNext();
      } else {
        // Swiped right - go prev
        goPrev();
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  }, [touchStart, touchEnd, goNext, goPrev]);

  const currentSpread = spreads[currentIndex];

  if (!currentSpread) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Flipbook container */}
      <div className="relative flex-1 flex items-center justify-center bg-gray-900 overflow-hidden rounded-lg perspective-1000">
        {/* Previous page hint */}
        {canGoPrev && (
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10 flex items-center justify-center">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFlipping}
              className="w-full h-full flex items-center justify-center bg-gradient-to-r from-black/30 to-transparent hover:from-black/50 transition-colors"
              aria-label={t('viewer.previous')}
            >
              <ChevronLeft className="w-8 h-8 text-white/80" />
            </button>
          </div>
        )}

        {/* Current spread with flip animation */}
        <div
          className={`relative w-full max-w-4xl transition-transform duration-400 ease-out ${
            isFlipping
              ? flipDirection === 'left'
                ? 'animate-flip-left'
                : 'animate-flip-right'
              : ''
          }`}
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          <img
            src={currentSpread.image_url}
            alt={t('viewer.spreadAlt', { page: currentSpread.page_number })}
            className="w-full h-auto object-contain shadow-2xl"
            draggable={false}
          />

          {/* Page shadow effect */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-y-0 left-1/2 w-8 -ml-4 bg-gradient-to-r from-black/20 via-transparent to-black/10" />
          </div>
        </div>

        {/* Next page hint */}
        {canGoNext && (
          <div className="absolute right-0 top-0 bottom-0 w-8 z-10 flex items-center justify-center">
            <button
              type="button"
              onClick={goNext}
              disabled={isFlipping}
              className="w-full h-full flex items-center justify-center bg-gradient-to-l from-black/30 to-transparent hover:from-black/50 transition-colors"
              aria-label={t('viewer.next')}
            >
              <ChevronRight className="w-8 h-8 text-white/80" />
            </button>
          </div>
        )}
      </div>

      {/* Page indicator */}
      <div className="flex items-center justify-center gap-4 py-4">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev || isFlipping}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={t('viewer.previous')}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {t('viewer.page')} {currentSpread.page_number} / {spreads.length}
        </span>

        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext || isFlipping}
          className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={t('viewer.next')}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Swipe hint for mobile */}
      <p className="text-center text-xs text-gray-500 dark:text-gray-400 pb-2 md:hidden">
        {t('viewer.swipeHint')}
      </p>

      {/* Custom animation styles */}
      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }

        @keyframes flipLeft {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(-90deg);
          }
          100% {
            transform: rotateY(0deg);
          }
        }

        @keyframes flipRight {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(90deg);
          }
          100% {
            transform: rotateY(0deg);
          }
        }

        .animate-flip-left {
          animation: flipLeft 0.4s ease-out;
        }

        .animate-flip-right {
          animation: flipRight 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}

export default FlipbookViewer;
