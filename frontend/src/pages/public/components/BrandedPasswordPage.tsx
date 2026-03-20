/**
 * BrandedPasswordPage - Custom-branded password entry page for protected galleries.
 *
 * Renders photographer logo, gallery title, welcome message, and accent-colored
 * password input with submit button. Falls back to default RawDrive branding
 * when no branding profile is linked.
 */
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

interface BrandedPasswordPageProps {
  galleryTitle: string;
  welcomeMessage?: string;
  brandingLogoUrl?: string;
  brandingAccentColor?: string;
  onPasswordSubmit: (password: string) => void;
  error?: string;
}

const DEFAULT_ACCENT = '#6366f1';

export const BrandedPasswordPage: React.FC<BrandedPasswordPageProps> = ({
  galleryTitle,
  welcomeMessage,
  brandingLogoUrl,
  brandingAccentColor,
  onPasswordSubmit,
  error: externalError,
}) => {
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [shake, setShake] = useState(false);

  const accentColor = brandingAccentColor || DEFAULT_ACCENT;
  const displayError = externalError || localError;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError('');

      if (!password.trim()) {
        setLocalError('Please enter a password');
        setShake(true);
        setTimeout(() => setShake(false), 500);
        return;
      }

      onPasswordSubmit(password);
    },
    [password, onPasswordSubmit]
  );

  // Trigger shake on external error change
  React.useEffect(() => {
    if (externalError) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }, [externalError]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        '--brand-accent': accentColor,
        background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}08 50%, transparent 100%)`,
      } as React.CSSProperties}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`
          w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl
          p-8 text-center
          ${shake ? 'animate-shake' : ''}
        `}
      >
        {/* Logo / Default branding */}
        {brandingLogoUrl ? (
          <div className="mb-6 flex justify-center">
            <img
              src={brandingLogoUrl}
              alt="Photographer logo"
              className="h-16 w-auto object-contain max-w-[200px]"
            />
          </div>
        ) : (
          <div
            data-testid="default-branding"
            className="mb-6 flex justify-center"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <Lock
                className="w-8 h-8"
                style={{ color: accentColor }}
              />
            </div>
          </div>
        )}

        {/* Gallery title */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {galleryTitle}
        </h1>

        {/* Welcome message */}
        {welcomeMessage && (
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm leading-relaxed">
            {welcomeMessage}
          </p>
        )}

        {/* Password form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLocalError('');
              }}
              className="
                w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700
                bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-2 transition-shadow
              "
              style={{
                '--tw-ring-color': accentColor,
              } as React.CSSProperties}
              autoFocus
            />
          </div>

          {/* Error message */}
          {displayError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-500 text-sm"
            >
              {displayError}
            </motion.p>
          )}

          <button
            type="submit"
            className="
              w-full py-3 px-4 rounded-lg text-white font-medium
              transition-opacity hover:opacity-90 focus:outline-none focus:ring-2
              focus:ring-offset-2
            "
            style={{
              backgroundColor: accentColor,
              '--tw-ring-color': accentColor,
            } as React.CSSProperties}
          >
            Unlock Gallery
          </button>
        </form>
      </motion.div>

      {/* Shake animation keyframes */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default BrandedPasswordPage;
