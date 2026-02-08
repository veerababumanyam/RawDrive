/**
 * Device fingerprinting for mobile
 * Generates device info and fingerprint for security tracking
 */

import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getDeviceId } from '../services/secureStorage';
import type { DeviceInfo } from '../types';

export interface FingerprintResult {
  fingerprint: string;
  device_info: DeviceInfo;
}

/**
 * Get device information
 */
async function getDeviceInfo(): Promise<DeviceInfo> {
  const deviceId = await getDeviceId();
  const appVersion = Application.nativeApplicationVersion || '1.0.0';

  return {
    platform: Platform.OS as 'ios' | 'android',
    osVersion: Device.osVersion || 'unknown',
    deviceModel: Device.modelName || 'unknown',
    appVersion,
    deviceId,
  };
}

/**
 * Generate a SHA-256 hash of a string
 */
async function hashString(str: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    str
  );
  return digest;
}

/**
 * Generate device fingerprint and info
 * Used for security tracking and session management
 */
export async function generateDeviceFingerprint(): Promise<FingerprintResult> {
  const deviceInfo = await getDeviceInfo();

  // Create fingerprint from device characteristics
  const fingerprintData = [
    deviceInfo.platform,
    deviceInfo.osVersion,
    deviceInfo.deviceModel,
    deviceInfo.deviceId,
    Device.manufacturer || 'unknown',
    Device.brand || 'unknown',
    // Add timezone for additional uniqueness
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');

  const fingerprint = await hashString(fingerprintData);

  return {
    fingerprint,
    device_info: deviceInfo,
  };
}

/**
 * Get simplified device info for API requests
 * Used in login/auth requests for device tracking
 */
export async function getDeviceInfoForApi(): Promise<{
  device_fingerprint: string;
  device_info: {
    platform: string;
    os_version: string;
    device_model: string;
    app_version: string;
    device_id: string;
  };
}> {
  const { fingerprint, device_info } = await generateDeviceFingerprint();

  return {
    device_fingerprint: fingerprint,
    device_info: {
      platform: device_info.platform,
      os_version: device_info.osVersion,
      device_model: device_info.deviceModel,
      app_version: device_info.appVersion,
      device_id: device_info.deviceId,
    },
  };
}
