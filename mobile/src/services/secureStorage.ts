/**
 * Secure storage service using Expo SecureStore
 * Handles encrypted storage for sensitive data (tokens, credentials)
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';
import type { StoredTokens, User, Workspace } from '../types';

/**
 * Check if SecureStore is available (not available on web)
 */
async function isSecureStoreAvailable(): Promise<boolean> {
  return await SecureStore.isAvailableAsync();
}

/**
 * Store a value securely
 * Falls back to AsyncStorage if SecureStore is not available
 */
async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    if (await isSecureStoreAvailable()) {
      await SecureStore.setItemAsync(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  } catch (error) {
    console.error(`Failed to store item ${key}:`, error);
    throw error;
  }
}

/**
 * Get a value from secure storage
 */
async function getSecureItem(key: string): Promise<string | null> {
  try {
    if (await isSecureStoreAvailable()) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  } catch (error) {
    console.error(`Failed to get item ${key}:`, error);
    return null;
  }
}

/**
 * Delete a value from secure storage
 */
async function deleteSecureItem(key: string): Promise<void> {
  try {
    if (await isSecureStoreAvailable()) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error(`Failed to delete item ${key}:`, error);
  }
}

// Token storage functions

/**
 * Store authentication tokens securely
 */
export async function setStoredTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    setSecureItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken),
    setSecureItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken),
    setSecureItem(STORAGE_KEYS.EXPIRES_AT, tokens.expiresAt.toString()),
  ]);
}

/**
 * Get stored authentication tokens
 */
export async function getStoredTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken, expiresAt] = await Promise.all([
    getSecureItem(STORAGE_KEYS.ACCESS_TOKEN),
    getSecureItem(STORAGE_KEYS.REFRESH_TOKEN),
    getSecureItem(STORAGE_KEYS.EXPIRES_AT),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt ? parseInt(expiresAt, 10) : 0,
  };
}

/**
 * Clear stored authentication tokens
 */
export async function clearStoredTokens(): Promise<void> {
  await Promise.all([
    deleteSecureItem(STORAGE_KEYS.ACCESS_TOKEN),
    deleteSecureItem(STORAGE_KEYS.REFRESH_TOKEN),
    deleteSecureItem(STORAGE_KEYS.EXPIRES_AT),
    deleteSecureItem(STORAGE_KEYS.USER),
    deleteSecureItem(STORAGE_KEYS.WORKSPACE),
  ]);
}

/**
 * Check if access token is expired or about to expire
 */
export async function isTokenExpired(bufferSeconds: number = 60): Promise<boolean> {
  const tokens = await getStoredTokens();
  if (!tokens) return true;

  const now = Date.now();
  const expiresAt = tokens.expiresAt;

  return now >= expiresAt - bufferSeconds * 1000;
}

// User storage functions

/**
 * Store user data
 */
export async function setStoredUser(user: User): Promise<void> {
  await setSecureItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

/**
 * Get stored user data
 */
export async function getStoredUser(): Promise<User | null> {
  const userJson = await getSecureItem(STORAGE_KEYS.USER);
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

// Workspace storage functions

/**
 * Store workspace data
 */
export async function setStoredWorkspace(workspace: Workspace): Promise<void> {
  await setSecureItem(STORAGE_KEYS.WORKSPACE, JSON.stringify(workspace));
}

/**
 * Get stored workspace data
 */
export async function getStoredWorkspace(): Promise<Workspace | null> {
  const wsJson = await getSecureItem(STORAGE_KEYS.WORKSPACE);
  if (!wsJson) return null;

  try {
    return JSON.parse(wsJson);
  } catch {
    return null;
  }
}

// Biometric settings

/**
 * Set biometric authentication preference
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await setSecureItem(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled ? 'true' : 'false');
}

/**
 * Get biometric authentication preference
 */
export async function getBiometricEnabled(): Promise<boolean> {
  const value = await getSecureItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
  return value === 'true';
}

// Device ID

/**
 * Get or generate a unique device ID
 */
export async function getDeviceId(): Promise<string> {
  let deviceId = await getSecureItem(STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    // Generate a new UUID
    deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    await setSecureItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  return deviceId;
}

// Theme preference

/**
 * Set theme preference
 */
export async function setThemePreference(theme: 'light' | 'dark' | 'system'): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.THEME, theme);
}

/**
 * Get theme preference
 */
export async function getThemePreference(): Promise<'light' | 'dark' | 'system'> {
  const theme = await AsyncStorage.getItem(STORAGE_KEYS.THEME);
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    return theme;
  }
  return 'system';
}
