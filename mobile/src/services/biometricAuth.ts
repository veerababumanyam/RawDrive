/**
 * Biometric authentication service
 * Handles FaceID/TouchID authentication on iOS and fingerprint on Android
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { getBiometricEnabled, setBiometricEnabled } from './secureStorage';

export type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'none';

export interface BiometricStatus {
  isAvailable: boolean;
  isEnrolled: boolean;
  biometricTypes: BiometricType[];
  isEnabled: boolean;
}

/**
 * Map LocalAuthentication types to our BiometricType
 */
function mapBiometricType(type: LocalAuthentication.AuthenticationType): BiometricType {
  switch (type) {
    case LocalAuthentication.AuthenticationType.FINGERPRINT:
      return 'fingerprint';
    case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
      return 'facial';
    case LocalAuthentication.AuthenticationType.IRIS:
      return 'iris';
    default:
      return 'none';
  }
}

/**
 * Get human-readable name for biometric type
 */
export function getBiometricName(type: BiometricType): string {
  switch (type) {
    case 'fingerprint':
      return 'Fingerprint';
    case 'facial':
      return 'Face ID';
    case 'iris':
      return 'Iris';
    default:
      return 'Biometric';
  }
}

/**
 * Check if biometric authentication is available and enrolled
 */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  try {
    // Check if hardware is available
    const isAvailable = await LocalAuthentication.hasHardwareAsync();

    // Check if biometrics are enrolled
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    // Get supported biometric types
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const biometricTypes = supportedTypes.map(mapBiometricType);

    // Check if user has enabled biometric login
    const isEnabled = await getBiometricEnabled();

    return {
      isAvailable,
      isEnrolled,
      biometricTypes,
      isEnabled,
    };
  } catch (error) {
    console.error('Error checking biometric status:', error);
    return {
      isAvailable: false,
      isEnrolled: false,
      biometricTypes: [],
      isEnabled: false,
    };
  }
}

/**
 * Authenticate using biometrics
 */
export async function authenticateWithBiometrics(
  promptMessage: string = 'Authenticate to access RawDrive'
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const status = await getBiometricStatus();

    if (!status.isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication is not available on this device',
      };
    }

    if (!status.isEnrolled) {
      return {
        success: false,
        error: 'No biometrics enrolled. Please set up biometrics in your device settings.',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use password',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // Allow PIN/password fallback
    });

    if (result.success) {
      return { success: true };
    }

    // Handle specific error types
    if (result.error === 'user_cancel') {
      return {
        success: false,
        error: 'Authentication cancelled',
      };
    }

    if (result.error === 'user_fallback') {
      return {
        success: false,
        error: 'User chose password fallback',
      };
    }

    if (result.error === 'lockout') {
      return {
        success: false,
        error: 'Too many failed attempts. Please try again later.',
      };
    }

    return {
      success: false,
      error: result.error || 'Authentication failed',
    };
  } catch (error) {
    console.error('Biometric authentication error:', error);
    return {
      success: false,
      error: 'An error occurred during authentication',
    };
  }
}

/**
 * Enable biometric authentication for the app
 */
export async function enableBiometricAuth(): Promise<{
  success: boolean;
  error?: string;
}> {
  const status = await getBiometricStatus();

  if (!status.isAvailable || !status.isEnrolled) {
    return {
      success: false,
      error: 'Biometric authentication is not available or not enrolled',
    };
  }

  // Verify biometric before enabling
  const authResult = await authenticateWithBiometrics(
    'Authenticate to enable biometric login'
  );

  if (!authResult.success) {
    return authResult;
  }

  await setBiometricEnabled(true);
  return { success: true };
}

/**
 * Disable biometric authentication for the app
 */
export async function disableBiometricAuth(): Promise<void> {
  await setBiometricEnabled(false);
}

/**
 * Check if biometric login should be attempted
 */
export async function shouldUseBiometricLogin(): Promise<boolean> {
  const status = await getBiometricStatus();
  return status.isAvailable && status.isEnrolled && status.isEnabled;
}
