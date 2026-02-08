/**
 * TVActivationPage Component
 * Allows clients to pair their Smart TV with a gallery for ambient display.
 *
 * Flow:
 * 1. User navigates to /tv/activate on their Smart TV
 * 2. Page displays a 6-character activation code
 * 3. User enters the code on their phone/tablet while viewing a gallery
 * 4. TV pairs with the gallery and begins ambient display
 *
 * Features:
 * - QR code for quick mobile pairing
 * - Auto-refreshing activation code
 * - Clear instructions for TV users
 * - Network status indicator
 * - Countdown timer for code expiry
 *
 * @module pages/public/TVActivationPage
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tv2, QrCode, Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle, Timer } from 'lucide-react';
import { AppButton } from '../../components/ui/AppButton';

// ============================================================================
// Types
// ============================================================================

interface ActivationState {
  code: string;
  expiresAt: Date;
  sessionId: string;
  status: 'waiting' | 'paired' | 'expired' | 'error';
  galleryId?: string;
  galleryTitle?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CODE_EXPIRY_MINUTES = 15;
const POLL_INTERVAL_MS = 3000;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random 6-character alphanumeric code
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars (I, O, 0, 1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate a session ID
 */
function generateSessionId(): string {
  return `tv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Component
// ============================================================================

export const TVActivationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [activation, setActivation] = useState<ActivationState>(() => ({
    code: generateCode(),
    expiresAt: new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000),
    sessionId: generateSessionId(),
    status: 'waiting',
  }));

  const [timeRemaining, setTimeRemaining] = useState(CODE_EXPIRY_MINUTES * 60);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showQR, setShowQR] = useState(false);

  // Update countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((activation.expiresAt.getTime() - Date.now()) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0 && activation.status === 'waiting') {
        setActivation((prev) => ({ ...prev, status: 'expired' }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activation.expiresAt, activation.status]);

  // Poll for pairing status
  useEffect(() => {
    if (activation.status !== 'waiting') return;

    const checkPairing = async () => {
      try {
        // In production, this would check the backend for pairing status
        // For now, we'll simulate with localStorage
        const pairingData = localStorage.getItem(`tv_pairing_${activation.code}`);
        if (pairingData) {
          const { galleryId, galleryTitle } = JSON.parse(pairingData);
          setActivation((prev) => ({
            ...prev,
            status: 'paired',
            galleryId,
            galleryTitle,
          }));

          // Clean up pairing data
          localStorage.removeItem(`tv_pairing_${activation.code}`);

          // Navigate to ambient display after short delay
          setTimeout(() => {
            navigate(`/tv/display/${galleryId}?session=${activation.sessionId}`);
          }, 2000);
        }
      } catch {
        // Ignore errors during polling
      }
    };

    pollIntervalRef.current = setInterval(checkPairing, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [activation.code, activation.sessionId, activation.status, navigate]);

  // Track online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Generate new code
  const regenerateCode = useCallback(() => {
    setActivation({
      code: generateCode(),
      expiresAt: new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000),
      sessionId: generateSessionId(),
      status: 'waiting',
    });
  }, []);

  // Build QR code URL
  const qrCodeUrl = `${window.location.origin}/tv/pair?code=${activation.code}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl mb-6"
          >
            <Tv2 className="w-10 h-10 text-white" />
          </motion.div>

          <h1 className="text-4xl font-bold text-white mb-3">
            RawDrive TV
          </h1>
          <p className="text-gray-400 text-lg">
            Transform your TV into a beautiful photo display
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {isOnline ? (
            <div className="flex items-center gap-2 text-green-400">
              <Wifi className="w-4 h-4" />
              <span className="text-sm">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-400">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm">No connection</span>
            </div>
          )}
        </div>

        {/* Main content based on status */}
        <AnimatePresence mode="wait">
          {/* Waiting for pairing */}
          {activation.status === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-10"
            >
              {/* Instructions */}
              <div className="text-center mb-10">
                <h2 className="text-xl text-white font-semibold mb-2">
                  Enter this code on your phone
                </h2>
                <p className="text-gray-400">
                  Open your gallery and tap "Cast to TV" to pair
                </p>
              </div>

              {/* Activation code */}
              <div className="flex justify-center gap-3 mb-8">
                {activation.code.split('').map((char, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="w-16 h-20 bg-gradient-to-b from-white/10 to-white/5 rounded-xl flex items-center justify-center border border-white/20"
                  >
                    <span className="text-4xl font-bold text-white font-mono">
                      {char}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* Timer */}
              <div className="flex items-center justify-center gap-2 text-gray-400 mb-8">
                <Timer className="w-4 h-4" />
                <span className="text-sm">
                  Code expires in {formatTimeRemaining(timeRemaining)}
                </span>
              </div>

              {/* QR Code toggle */}
              <div className="text-center">
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <QrCode className="w-5 h-5" />
                  <span>{showQR ? 'Hide' : 'Show'} QR Code</span>
                </button>

                <AnimatePresence>
                  {showQR && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 flex justify-center"
                    >
                      <div className="bg-white p-4 rounded-xl">
                        {/* In production, use a QR code library */}
                        <div className="w-48 h-48 bg-gray-200 flex items-center justify-center">
                          <QrCode className="w-24 h-24 text-gray-400" />
                        </div>
                        <p className="text-xs text-gray-500 text-center mt-2">
                          Scan with your phone camera
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Paired successfully */}
          {activation.status === 'paired' && (
            <motion.div
              key="paired"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-gradient-to-b from-green-500/20 to-emerald-500/10 backdrop-blur-xl rounded-3xl border border-green-500/30 p-10 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
                className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle className="w-10 h-10 text-white" />
              </motion.div>

              <h2 className="text-2xl font-bold text-white mb-2">
                Connected!
              </h2>
              <p className="text-green-300 mb-4">
                {activation.galleryTitle || 'Gallery'} is loading...
              </p>

              <div className="flex items-center justify-center">
                <div className="animate-pulse flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-green-400 rounded-full"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Code expired */}
          {activation.status === 'expired' && (
            <motion.div
              key="expired"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-10 text-center"
            >
              <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-orange-400" />
              </div>

              <h2 className="text-xl font-semibold text-white mb-2">
                Code Expired
              </h2>
              <p className="text-gray-400 mb-6">
                Generate a new code to continue
              </p>

              <AppButton
                variant="primary"
                onClick={regenerateCode}
                className="inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Get New Code
              </AppButton>
            </motion.div>
          )}

          {/* Error state */}
          {activation.status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-500/10 backdrop-blur-xl rounded-3xl border border-red-500/30 p-10 text-center"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>

              <h2 className="text-xl font-semibold text-white mb-2">
                Connection Error
              </h2>
              <p className="text-gray-400 mb-6">
                Unable to connect. Please check your network and try again.
              </p>

              <AppButton
                variant="primary"
                onClick={regenerateCode}
                className="inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </AppButton>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-gray-500 text-sm">
            Need help? Visit{' '}
            <a href="/help/tv" className="text-violet-400 hover:underline">
              rawdrive.com/help/tv
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default TVActivationPage;
