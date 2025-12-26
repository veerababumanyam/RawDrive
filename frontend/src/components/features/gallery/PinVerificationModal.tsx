/**
 * PinVerificationModal Component
 * Modal for visitors to enter PIN to access protected gallery content
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
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (index: number, value: string) => {
    // Only allow numeric input
    const numericValue = value.replace(/\D/g, '');
    if (numericValue.length > 1) return;

    const newPin = [...pin];
    newPin[index] = numericValue;
    setPin(newPin);
    setError(null);

    // Auto-focus next input
    if (numericValue && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newPin = [...pin];
    pastedData.split('').forEach((char, index) => {
      if (index < 6) newPin[index] = char;
    });
    setPin(newPin);
    
    // Focus the next empty input or last input
    const nextEmptyIndex = newPin.findIndex(p => !p);
    if (nextEmptyIndex !== -1) {
      inputRefs.current[nextEmptyIndex]?.focus();
    } else {
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPin = pin.join('');
    
    if (fullPin.length < 4) {
      setError('Please enter at least 4 digits');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const isValid = await onVerify(fullPin);
      if (!isValid) {
        setError('Incorrect PIN. Please try again.');
        setPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
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
            This gallery is protected. Please enter the PIN to continue.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-5">
          {/* PIN Input Grid */}
          <div className="flex justify-center gap-2">
            {pin.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                className={`
                  w-11 h-14 text-center text-xl font-semibold
                  border-2 rounded-lg bg-surface-secondary
                  focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                  transition-all
                  ${error ? 'border-error' : 'border-border'}
                `}
                disabled={isVerifying}
              />
            ))}
          </div>

          {/* Show/Hide PIN */}
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="flex items-center justify-center gap-2 text-sm text-text-secondary hover:text-text-primary mx-auto"
          >
            {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPin ? 'Hide PIN' : 'Show PIN'}
          </button>

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
              disabled={isVerifying || pin.filter(p => p).length < 4}
            >
              {isVerifying ? 'Verifying...' : 'Verify'}
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};
