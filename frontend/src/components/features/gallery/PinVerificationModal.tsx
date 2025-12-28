/**
 * PinVerificationModal Component
 * Modal for visitors to enter PIN to access protected gallery content
 * Uses a simple text input without length restrictions
 */

import React, { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

export interface PinVerificationModalProps {
  isOpen: boolean;
  onVerify: (pin: string) => Promise<boolean>;
  onCancel: () => void;
  galleryTitle?: string;
  companyName?: string;
  logoUrl?: string;
}

export const PinVerificationModal: React.FC<PinVerificationModalProps> = ({
  isOpen,
  onVerify,
  onCancel,
  galleryTitle,
  companyName,
  logoUrl,
}) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setIsVerifying(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pin.trim()) {
      setError('Please enter the PIN');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const isValid = await onVerify(pin);
      if (!isValid) {
        setError('Incorrect PIN. Please try again.');
        setPin('');
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
            {galleryTitle ? `Enter PIN for ${galleryTitle}` : 'Enter PIN'}
          </h2>
          {companyName && (
            <p className="text-sm text-text-secondary mt-1">
              by {companyName}
            </p>
          )}
          <p className="text-sm text-text-tertiary mt-3">
            This content is protected. Please enter the PIN to continue.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-5" autoComplete="off">
          {/* Simple PIN Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(null);
              }}
              placeholder="Enter PIN"
              autoComplete="off"
              className={`
                w-full px-4 py-3 text-center text-lg font-medium tracking-wider
                border-2 rounded-lg bg-surface-secondary
                focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                transition-all
                ${error ? 'border-error' : 'border-border'}
              `}
              disabled={isVerifying}
            />
            
            {/* Show/Hide PIN toggle */}
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
            >
              {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
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
              disabled={isVerifying || !pin.trim()}
            >
              {isVerifying ? 'Verifying...' : 'Verify'}
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
