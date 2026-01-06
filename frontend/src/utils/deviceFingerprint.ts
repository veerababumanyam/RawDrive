/**
 * Device fingerprinting utility using FingerprintJS
 *
 * Generates a unique device fingerprint and extracts device metadata
 * for security tracking (remember me, session management, fraud detection).
 */
import FingerprintJS from '@fingerprintjs/fingerprintjs';

export interface DeviceInfo {
  browser: string;
  os: string;
  device_type: 'desktop' | 'mobile' | 'tablet';
  screen_resolution: string;
  timezone: string;
}

interface FingerprintResult {
  fingerprint: string;
  device_info: DeviceInfo;
}

// Lazy-loaded FingerprintJS agent
let fpPromise: Promise<any> | null = null;

/**
 * Initialize FingerprintJS agent (lazy-loaded)
 */
function getFingerprintAgent() {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
}

/**
 * Detect device type based on screen size and user agent
 */
function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const userAgent = navigator.userAgent.toLowerCase();
  const screenWidth = window.screen.width;

  // Tablet detection
  if (/(ipad|tablet|playbook)/.test(userAgent) || (screenWidth >= 768 && screenWidth < 1024)) {
    return 'tablet';
  }

  // Mobile detection
  if (/(mobile|android|iphone|ipod|blackberry|windows phone)/.test(userAgent) || screenWidth < 768) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * Detect browser name from user agent
 */
function getBrowserName(): string {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('edg/')) return 'Edge';
  if (userAgent.includes('chrome/') && !userAgent.includes('edg/')) return 'Chrome';
  if (userAgent.includes('firefox/')) return 'Firefox';
  if (userAgent.includes('safari/') && !userAgent.includes('chrome/')) return 'Safari';
  if (userAgent.includes('opera/') || userAgent.includes('opr/')) return 'Opera';

  return 'Unknown';
}

/**
 * Detect operating system from user agent
 */
function getOperatingSystem(): string {
  const userAgent = navigator.userAgent;

  if (/Windows NT 10/.test(userAgent)) return 'Windows 10/11';
  if (/Windows NT 6.3/.test(userAgent)) return 'Windows 8.1';
  if (/Windows NT 6.2/.test(userAgent)) return 'Windows 8';
  if (/Windows NT 6.1/.test(userAgent)) return 'Windows 7';
  if (/Windows/.test(userAgent)) return 'Windows';

  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  if (/Android/.test(userAgent)) return 'Android';
  if (/iOS|iPhone|iPad|iPod/.test(userAgent)) return 'iOS';

  return 'Unknown';
}

/**
 * Generate device fingerprint and extract device information
 *
 * @returns Promise resolving to fingerprint hash and device metadata
 */
export async function generateDeviceFingerprint(): Promise<FingerprintResult> {
  try {
    // Get FingerprintJS agent
    const fp = await getFingerprintAgent();
    const result = await fp.get();

    // Extract device information
    const device_info: DeviceInfo = {
      browser: getBrowserName(),
      os: getOperatingSystem(),
      device_type: getDeviceType(),
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    // Use FingerprintJS visitor ID as the fingerprint
    // It's already a stable hash that persists across sessions
    const fingerprint = result.visitorId;

    return {
      fingerprint,
      device_info,
    };
  } catch (error) {
    console.error('Failed to generate device fingerprint:', error);

    // Fallback: generate a simple fingerprint from available data
    const fallbackData = [
      navigator.userAgent,
      navigator.language,
      window.screen.width,
      window.screen.height,
      new Date().getTimezoneOffset(),
    ].join('|');

    // Simple hash function for fallback
    const fallbackFingerprint = await hashString(fallbackData);

    const device_info: DeviceInfo = {
      browser: getBrowserName(),
      os: getOperatingSystem(),
      device_type: getDeviceType(),
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    return {
      fingerprint: fallbackFingerprint,
      device_info,
    };
  }
}

/**
 * Hash a string using SHA-256 (via SubtleCrypto API)
 */
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Check if device fingerprinting is supported
 */
export function isDeviceFingerprintingSupported(): boolean {
  return typeof window !== 'undefined' && typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}
