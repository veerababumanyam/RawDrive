/**
 * Onboarding Context
 * Provides shared state management for the onboarding flow
 * Feature: Automated Onboarding System
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  onboardingService,
  type OnboardingSession,
  type OnboardingStep,
  type OnboardingPlan,
  type SelectPlanRequest,
  type RegisterRequest,
  type VerifyEmailRequest,
  type ConfirmPaymentRequest,
  type CompleteOnboardingRequest,
  type CompleteOnboardingResponse,
  type PaymentIntentResponse,
} from '../services/onboardingService';

// ============================================================================
// Context Types
// ============================================================================

interface OnboardingContextValue {
  // State
  session: OnboardingSession | null;
  plans: OnboardingPlan[];
  selectedPlan: OnboardingPlan | null;
  isLoading: boolean;
  error: string | null;

  // Session actions
  startOnboarding: () => Promise<void>;
  refreshSession: () => Promise<void>;

  // Step actions
  selectPlan: (request: SelectPlanRequest) => Promise<void>;
  register: (request: RegisterRequest) => Promise<void>;
  verifyEmail: (request: VerifyEmailRequest) => Promise<void>;
  resendVerification: () => Promise<void>;
  createPaymentIntent: () => Promise<PaymentIntentResponse>;
  confirmPayment: (request: ConfirmPaymentRequest) => Promise<void>;
  completeOnboarding: (request?: CompleteOnboardingRequest) => Promise<CompleteOnboardingResponse>;
  abandonOnboarding: () => Promise<void>;

  // Navigation helpers
  currentStep: OnboardingStep;
  canProceedToStep: (step: OnboardingStep) => boolean;
  getStepIndex: (step: OnboardingStep) => number;

  // Utility
  clearError: () => void;
}

// ============================================================================
// Step Configuration
// ============================================================================

const STEP_ORDER: OnboardingStep[] = [
  'plan_selection',
  'registration',
  'email_verification',
  'payment',
  'workspace_setup',
  'completed',
];

// ============================================================================
// Context Creation
// ============================================================================

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

interface OnboardingProviderProps {
  children: ReactNode;
}

export const OnboardingProvider: React.FC<OnboardingProviderProps> = ({ children }) => {
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [plans, setPlans] = useState<OnboardingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const currentStep = session?.current_step ?? 'plan_selection';
  const selectedPlan = session?.plan_id
    ? plans.find((p) => p.plan_id === session.plan_id) || null
    : null;

  // Load plans on mount
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const fetchedPlans = await onboardingService.getPlans();
        setPlans(fetchedPlans.sort((a, b) => a.display_order - b.display_order));
      } catch (err) {
        console.error('Failed to load plans:', err);
      }
    };
    loadPlans();
  }, []);

  // Try to restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const existingSession = await onboardingService.getStatus();
        setSession(existingSession);
      } catch {
        // No existing session, that's fine
      }
    };
    restoreSession();
  }, []);

  // Clear error helper
  const clearError = useCallback(() => setError(null), []);

  // Start new onboarding session
  const startOnboarding = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Capture UTM params from URL
      const params = new URLSearchParams(window.location.search);
      await onboardingService.start({
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_content: params.get('utm_content') || undefined,
        utm_term: params.get('utm_term') || undefined,
        referrer_url: document.referrer || undefined,
        landing_page: window.location.pathname,
        promo_code: params.get('promo') || params.get('code') || undefined,
      });
      // Refresh to get full session
      const newSession = await onboardingService.getStatus();
      setSession(newSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start onboarding';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh session
  const refreshSession = useCallback(async () => {
    try {
      const updatedSession = await onboardingService.getStatus();
      setSession(updatedSession);
    } catch (err) {
      // Session may have expired
      setSession(null);
    }
  }, []);

  // Select plan
  const selectPlan = useCallback(async (request: SelectPlanRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSession = await onboardingService.selectPlan(request);
      setSession(updatedSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select plan';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Register
  const register = useCallback(async (request: RegisterRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSession = await onboardingService.register(request);
      setSession(updatedSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Verify email
  const verifyEmail = useCallback(async (request: VerifyEmailRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSession = await onboardingService.verifyEmail(request);
      setSession(updatedSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify email';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Resend verification
  const resendVerification = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSession = await onboardingService.resendVerification();
      setSession(updatedSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resend verification';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create payment intent
  const createPaymentIntent = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      return await onboardingService.createPaymentIntent();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create payment intent';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Confirm payment
  const confirmPayment = useCallback(async (request: ConfirmPaymentRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedSession = await onboardingService.confirmPayment(request);
      setSession(updatedSession);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm payment';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Complete onboarding
  const completeOnboarding = useCallback(async (request?: CompleteOnboardingRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await onboardingService.complete(request);
      // Clear session after completion
      setSession(null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete onboarding';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Abandon onboarding
  const abandonOnboarding = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onboardingService.abandon();
      setSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to abandon session';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Navigation helpers
  const getStepIndex = useCallback((step: OnboardingStep) => {
    return STEP_ORDER.indexOf(step);
  }, []);

  const canProceedToStep = useCallback(
    (step: OnboardingStep) => {
      if (!session) return step === 'plan_selection';

      const targetIndex = getStepIndex(step);
      const currentIndex = getStepIndex(currentStep);

      // Can only go to current step or previous steps
      if (targetIndex > currentIndex) return false;

      // Check if required steps are completed
      const requiredSteps = STEP_ORDER.slice(0, targetIndex);
      return requiredSteps.every((s) => session.steps_completed[s]);
    },
    [session, currentStep, getStepIndex]
  );

  const value: OnboardingContextValue = {
    session,
    plans,
    selectedPlan,
    isLoading,
    error,
    startOnboarding,
    refreshSession,
    selectPlan,
    register,
    verifyEmail,
    resendVerification,
    createPaymentIntent,
    confirmPayment,
    completeOnboarding,
    abandonOnboarding,
    currentStep,
    canProceedToStep,
    getStepIndex,
    clearError,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

export default OnboardingContext;
