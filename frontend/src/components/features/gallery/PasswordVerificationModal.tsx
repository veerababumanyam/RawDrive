/**
 * PasswordVerificationModal Component
 * Modal for visitors to enter password to access protected gallery content
 */

import React, { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

export interface PasswordVerificationModalProps {
  isOpen: boolean;
  onVerify: (password: string) => Promise<boolean>;
  onCancel: () => void;
  galleryTitle?: string;
  companyName?: string;
  logoUrl?: string;
}

export const PasswordVerificationModal: React.FC<PasswordVerificationModalProps> = ({
  isOpen,
  onVerify,
  onCancel,
  galleryTitle,
  companyName,
  logoUrl,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError('Please enter a password');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const isValid = await onVerify(password);
      if (!isValid) {
        setError('Incorrect password. Please try again.');
        setPassword('');
        inputRef.current?.focus();
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 bg-surface-primary rounded-xl shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 text-center">
          {logoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={logoUrl}
                alt={companyName || 'Logo'}
                className="h-12 w-auto object-contain"
              />
            </div>
          )}

          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-primary" />
          </div>

          <h2 className="text-xl font-semibold text-text-primary">
            {galleryTitle ? `Password Required` : 'Password Required'}
          </h2>
          {companyName && (
            <p className="text-sm text-text-secondary mt-1">
              by {companyName}
            </p>
          )}
          <p className="text-sm text-text-tertiary mt-3">
            This gallery is password protected.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-5">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="Enter gallery password"
              className={`
                w-full px-4 py-3 text-lg
                border rounded-lg bg-surface-secondary text-text-primary
                focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                transition-all
                ${error ? 'border-error' : 'border-border'}
              `}
              disabled={isVerifying}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-center">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <AppButton
              type="button"
              variant="outline"
              size="md"
              className="flex-1"
              onClick={onCancel}
              disabled={isVerifying}
            >
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              size="md"
              className="flex-1"
              disabled={isVerifying || !password}
            >
              {isVerifying ? 'Verifying...' : 'Access Gallery'}
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
