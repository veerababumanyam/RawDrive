/**
 * Onboarding Service
 * API client for the automated onboarding flow
 * Feature: Automated Onboarding System
 */

import api from './api';

// ============================================================================
// Types
// ============================================================================

export interface OnboardingSession {
  session_id: string;
  current_step: OnboardingStep;
  steps_completed: Record<OnboardingStep, boolean>;
  status: 'active' | 'completed' | 'abandoned' | 'expired';
  plan_id: string | null;
  billing_interval: 'monthly' | 'annual';
  currency: string;
  email_verified: boolean;
  payment_status: 'none' | 'pending' | 'processing' | 'succeeded' | 'failed';
  registration_data: {
    email?: string;
    full_name?: string;
    business_name?: string;
  };
  expires_at: string;
  created_at: string;
}

export type OnboardingStep =
  | 'plan_selection'
  | 'registration'
  | 'email_verification'
  | 'payment'
  | 'workspace_setup'
  | 'completed';

export interface StartOnboardingRequest {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_url?: string;
  landing_page?: string;
  promo_code?: string;
}

export interface StartOnboardingResponse {
  session_id: string;
  current_step: string;
  expires_at: string;
}

export interface SelectPlanRequest {
  plan_id: string;
  billing_interval: 'monthly' | 'annual';
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  business_name?: string;
  phone?: string;
  accept_terms: boolean;
  accept_privacy: boolean;
  marketing_consent?: boolean;
}

export interface GoogleAuthRequest {
  access_token: string;
  id_token?: string;
  accept_terms: boolean;
  accept_privacy: boolean;
  marketing_consent?: boolean;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface PaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
}

export interface ConfirmPaymentRequest {
  payment_intent_id: string;
}

export interface CompleteOnboardingRequest {
  workspace_name?: string;
}

export interface CompleteOnboardingResponse {
  user_id: string;
  workspace_id: string;
  subscription_id: string | null;
  redirect_url: string;
}

export interface OnboardingPlan {
  plan_id: string;
  code: string;
  name: string;
  description?: string;
  price_monthly: number;
  price_annual: number | null;
  price_monthly_usd?: number;
  price_annual_usd?: number;
  currency: string;
  storage_bytes: number;
  max_galleries: number;
  max_clients: number;
  max_team_members: number;
  ai_credits_monthly: number;
  features: Record<string, boolean>;
  feature_bullets: string[];
  highlight_label?: string;
  display_order: number;
}

// ============================================================================
// Service Methods
// ============================================================================

export const onboardingService = {
  /**
   * Start a new onboarding session
   */
  start: async (request?: StartOnboardingRequest): Promise<StartOnboardingResponse> => {
    const response = await api.post<StartOnboardingResponse>(
      '/api/v1/onboarding/start',
      request || {}
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to start onboarding');
    }
    return response.data!;
  },

  /**
   * Get current onboarding session status
   */
  getStatus: async (): Promise<OnboardingSession> => {
    const response = await api.get<OnboardingSession>('/api/v1/onboarding/status');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get onboarding status');
    }
    return response.data!;
  },

  /**
   * Select a subscription plan
   */
  selectPlan: async (request: SelectPlanRequest): Promise<OnboardingSession> => {
    const response = await api.post<OnboardingSession>(
      '/api/v1/onboarding/select-plan',
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to select plan');
    }
    return response.data!;
  },

  /**
   * Register with email and password
   */
  register: async (request: RegisterRequest): Promise<OnboardingSession> => {
    const response = await api.post<OnboardingSession>(
      '/api/v1/onboarding/register',
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to register');
    }
    return response.data!;
  },

  /**
   * Register with Google OAuth
   */
  registerGoogle: async (request: GoogleAuthRequest): Promise<OnboardingSession> => {
    const response = await api.post<OnboardingSession>(
      '/api/v1/onboarding/register/google',
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to register with Google');
    }
    return response.data!;
  },

  /**
   * Verify email with token
   */
  verifyEmail: async (request: VerifyEmailRequest): Promise<OnboardingSession> => {
    const response = await api.post<OnboardingSession>(
      '/api/v1/onboarding/verify-email',
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to verify email');
    }
    return response.data!;
  },

  /**
   * Resend verification email
   */
  resendVerification: async (): Promise<OnboardingSession> => {
    const response = await api.post<OnboardingSession>(
      '/api/v1/onboarding/resend-verification'
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to resend verification');
    }
    return response.data!;
  },

  /**
   * Create Stripe payment intent
   */
  createPaymentIntent: async (): Promise<PaymentIntentResponse> => {
    const response = await api.post<PaymentIntentResponse>(
      '/api/v1/onboarding/payment/create-intent'
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create payment intent');
    }
    return response.data!;
  },

  /**
   * Confirm payment completion
   */
  confirmPayment: async (request: ConfirmPaymentRequest): Promise<OnboardingSession> => {
    const response = await api.post<OnboardingSession>(
      '/api/v1/onboarding/payment/confirm',
      request
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to confirm payment');
    }
    return response.data!;
  },

  /**
   * Complete onboarding: create user, workspace, subscription
   */
  complete: async (request?: CompleteOnboardingRequest): Promise<CompleteOnboardingResponse> => {
    const response = await api.post<CompleteOnboardingResponse>(
      '/api/v1/onboarding/complete',
      request || {}
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to complete onboarding');
    }
    return response.data!;
  },

  /**
   * Abandon onboarding session
   */
  abandon: async (): Promise<void> => {
    const response = await api.delete('/api/v1/onboarding/abandon');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to abandon session');
    }
  },

  /**
   * Get available plans (uses subscription plans endpoint)
   */
  getPlans: async (): Promise<OnboardingPlan[]> => {
    const response = await api.get<{ items: OnboardingPlan[] }>('/api/v1/subscription/plans');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get plans');
    }
    return response.data!.items;
  },
};

export default onboardingService;
