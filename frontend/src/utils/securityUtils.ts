/**
 * Security Utilities
 *
 * Client-side security utilities for the profile editor
 * including input sanitization, CSRF protection, and validation.
 *
 * Requirements: 13.2, 13.3, 13.4, 13.7
 */

// =============================================================================
// Types
// =============================================================================

export interface SanitizeOptions {
  /** Allow specific HTML tags */
  allowedTags?: string[];
  /** Allow specific HTML attributes */
  allowedAttributes?: string[];
  /** Allow URLs in href/src */
  allowUrls?: boolean;
  /** Strip all HTML */
  stripHtml?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: string;
}

export interface CsrfToken {
  token: string;
  expiresAt: number;
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: number;
  isLimited: boolean;
}

// =============================================================================
// Input Sanitization
// =============================================================================

/**
 * Check if URL uses a safe protocol
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    // Relative URLs are considered safe
    return !url.includes(':') || url.startsWith('/');
  }
}

/**
 * Simple HTML sanitizer that strips unsafe content
 * Requirement 13.2: Input sanitization for XSS prevention
 */
export function sanitizeHtml(
  input: string,
  options: SanitizeOptions = {}
): string {
  const allowedTags = options.allowedTags || [
    'b',
    'i',
    'em',
    'strong',
    'a',
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'span',
  ];
  const allowedAttributes = options.allowedAttributes || ['href', 'title', 'class'];

  if (options.stripHtml) {
    // Strip all HTML tags
    const div = document.createElement('div');
    div.innerHTML = input;
    return div.textContent || '';
  }

  // Create a temporary element to parse HTML
  const div = document.createElement('div');
  div.innerHTML = input;

  // Walk through all elements and sanitize
  const sanitizeElement = (element: Element) => {
    const nodeName = element.nodeName.toLowerCase();

    // Remove disallowed tags
    if (!allowedTags.includes(nodeName)) {
      element.remove();
      return;
    }

    // Remove disallowed attributes
    const attributesToRemove: string[] = [];
    for (const attr of element.attributes) {
      if (!allowedAttributes.includes(attr.name.toLowerCase())) {
        attributesToRemove.push(attr.name);
      }
    }
    attributesToRemove.forEach((attr) => element.removeAttribute(attr));

    // Sanitize href/src attributes
    const href = element.getAttribute('href');
    if (href && !isSafeUrl(href)) {
      element.removeAttribute('href');
    }

    const src = element.getAttribute('src');
    if (src && !isSafeUrl(src)) {
      element.removeAttribute('src');
    }

    // Add rel="noopener noreferrer" to links
    if (nodeName === 'a' && element.hasAttribute('href')) {
      element.setAttribute('rel', 'noopener noreferrer');
    }

    // Recursively sanitize children
    Array.from(element.children).forEach(sanitizeElement);
  };

  Array.from(div.children).forEach(sanitizeElement);

  return div.innerHTML;
}

/**
 * Sanitize plain text (escape HTML entities)
 */
export function escapeHtml(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Sanitize for use in URLs
 */
export function sanitizeUrlParam(input: string): string {
  return encodeURIComponent(input.trim());
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(input: string): string {
  // Remove path separators and special characters
  return input
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .trim();
}

// =============================================================================
// Input Validation
// =============================================================================

/**
 * Validate email address
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  const trimmed = email.trim();

  if (!trimmed) {
    errors.push('Email is required');
    return { isValid: false, errors };
  }

  // RFC 5322 simplified regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    errors.push('Invalid email format');
  }

  // Check for potentially malicious patterns
  if (trimmed.includes('<') || trimmed.includes('>')) {
    errors.push('Invalid characters in email');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: trimmed.toLowerCase(),
  };
}

/**
 * Validate URL
 */
export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];
  const trimmed = url.trim();

  if (!trimmed) {
    return { isValid: true, errors, sanitizedValue: '' };
  }

  try {
    const parsed = new URL(trimmed);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push('URL must use http or https protocol');
    }

    // Check for JavaScript URLs
    if (
      trimmed.toLowerCase().includes('javascript:') ||
      trimmed.toLowerCase().includes('data:')
    ) {
      errors.push('Invalid URL protocol');
    }
  } catch {
    errors.push('Invalid URL format');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: trimmed,
  };
}

/**
 * Validate phone number
 */
export function validatePhone(phone: string): ValidationResult {
  const errors: string[] = [];
  const trimmed = phone.trim();

  if (!trimmed) {
    return { isValid: true, errors, sanitizedValue: '' };
  }

  // Remove all non-numeric except + at start
  const cleaned = trimmed.replace(/(?!^\+)[^\d]/g, '');

  // Check length (international format)
  if (cleaned.length < 10 || cleaned.length > 15) {
    errors.push('Phone number must be 10-15 digits');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: cleaned,
  };
}

/**
 * Validate color hex code
 */
export function validateColor(color: string): ValidationResult {
  const errors: string[] = [];
  const trimmed = color.trim();

  if (!trimmed) {
    return { isValid: true, errors, sanitizedValue: '' };
  }

  // Check hex format
  const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  if (!hexRegex.test(trimmed)) {
    errors.push('Invalid color format (use #RGB or #RRGGBB)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: trimmed.toLowerCase(),
  };
}

/**
 * Validate text content
 */
export function validateText(
  text: string,
  options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowHtml?: boolean;
  } = {}
): ValidationResult {
  const errors: string[] = [];
  const { minLength = 0, maxLength = 10000, pattern, allowHtml = false } = options;

  let sanitized = text.trim();

  // Sanitize HTML if not allowed
  if (!allowHtml) {
    sanitized = sanitizeHtml(sanitized, { stripHtml: true });
  }

  // Check length
  if (sanitized.length < minLength) {
    errors.push(`Must be at least ${minLength} characters`);
  }

  if (sanitized.length > maxLength) {
    errors.push(`Must be no more than ${maxLength} characters`);
  }

  // Check pattern if provided
  if (pattern && !pattern.test(sanitized)) {
    errors.push('Invalid format');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedValue: sanitized,
  };
}

// =============================================================================
// CSRF Protection
// =============================================================================

const CSRF_STORAGE_KEY = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Get or generate CSRF token
 * Requirement 13.3: CSRF protection
 */
export function getCsrfToken(): string {
  const stored = sessionStorage.getItem(CSRF_STORAGE_KEY);

  if (stored) {
    try {
      const parsed: CsrfToken = JSON.parse(stored);
      if (parsed.expiresAt > Date.now()) {
        return parsed.token;
      }
    } catch {
      // Invalid stored token, generate new
    }
  }

  // Generate new token
  const token = generateSecureToken();
  const csrfData: CsrfToken = {
    token,
    expiresAt: Date.now() + 3600000, // 1 hour
  };

  sessionStorage.setItem(CSRF_STORAGE_KEY, JSON.stringify(csrfData));
  return token;
}

/**
 * Get CSRF header for API requests
 */
export function getCsrfHeader(): Record<string, string> {
  return { [CSRF_HEADER_NAME]: getCsrfToken() };
}

/**
 * Generate cryptographically secure token
 */
export function generateSecureToken(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// Rate Limiting (Client-side tracking)
// =============================================================================

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for an action
 * Requirement 13.4: Rate limiting
 */
export function checkRateLimit(
  action: string,
  limit: number,
  windowMs: number
): RateLimitInfo {
  const now = Date.now();
  const stored = rateLimitStore.get(action);

  // Reset if window expired
  if (!stored || stored.resetAt <= now) {
    rateLimitStore.set(action, { count: 1, resetAt: now + windowMs });
    return { remaining: limit - 1, resetAt: now + windowMs, isLimited: false };
  }

  // Increment count
  stored.count++;
  rateLimitStore.set(action, stored);

  const remaining = Math.max(0, limit - stored.count);
  const isLimited = stored.count > limit;

  return { remaining, resetAt: stored.resetAt, isLimited };
}

/**
 * Reset rate limit for an action
 */
export function resetRateLimit(action: string): void {
  rateLimitStore.delete(action);
}

// =============================================================================
// Content Security
// =============================================================================

/**
 * Check if content passes security checks
 */
export function checkContentSecurity(content: string): {
  safe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check for potential XSS patterns
  const xssPatterns = [
    /<script\b/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:\s*text\/html/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(content)) {
      warnings.push('Content contains potentially unsafe patterns');
      break;
    }
  }

  // Check for excessive length
  if (content.length > 1000000) {
    warnings.push('Content exceeds maximum length');
  }

  return { safe: warnings.length === 0, warnings };
}

/**
 * Generate nonce for inline scripts
 */
export function generateNonce(): string {
  return generateSecureToken(16);
}

// =============================================================================
// File Security
// =============================================================================

/**
 * Validate file for upload
 */
export function validateFile(
  file: File,
  options: {
    allowedTypes?: string[];
    maxSize?: number;
    allowedExtensions?: string[];
  } = {}
): ValidationResult {
  const errors: string[] = [];
  const {
    allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSize = 10 * 1024 * 1024, // 10MB
    allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  } = options;

  // Check MIME type
  if (!allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed`);
  }

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size exceeds maximum of ${maxSize / (1024 * 1024)}MB`);
  }

  // Check extension
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    errors.push(`File extension ${extension} is not allowed`);
  }

  // Check for double extensions (potential bypass)
  const parts = file.name.split('.');
  if (parts.length > 2) {
    const secondLast = parts[parts.length - 2].toLowerCase();
    if (['php', 'js', 'html', 'exe', 'bat'].includes(secondLast)) {
      errors.push('Invalid file name');
    }
  }

  return { isValid: errors.length === 0, errors };
}

// =============================================================================
// Secure Storage
// =============================================================================

/**
 * Securely store sensitive data (encrypted)
 */
export async function secureStore(key: string, value: string): Promise<void> {
  // In production, use Web Crypto API for encryption
  // For now, use base64 encoding as a placeholder
  const encoded = btoa(encodeURIComponent(value));
  sessionStorage.setItem(`secure_${key}`, encoded);
}

/**
 * Retrieve securely stored data
 */
export async function secureRetrieve(key: string): Promise<string | null> {
  const stored = sessionStorage.getItem(`secure_${key}`);
  if (!stored) return null;

  try {
    return decodeURIComponent(atob(stored));
  } catch {
    return null;
  }
}

/**
 * Clear all secure storage
 */
export function secureClear(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith('secure_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
}

// =============================================================================
// Audit Logging (Client-side)
// =============================================================================

interface AuditEvent {
  action: string;
  resource: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

const auditLog: AuditEvent[] = [];
const MAX_AUDIT_ENTRIES = 100;

/**
 * Log security-relevant action
 * Requirement 13.7: Audit logging
 */
export function logSecurityEvent(
  action: string,
  resource: string,
  details?: Record<string, unknown>
): void {
  const event: AuditEvent = {
    action,
    resource,
    details,
    timestamp: Date.now(),
  };

  auditLog.push(event);

  // Keep only recent entries
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.shift();
  }

  // In production, send to backend for persistent logging
  if (import.meta.env.PROD) {
    sendAuditLog(event).catch(() => {
      // Silent fail for audit logging
    });
  }
}

/**
 * Send audit log to backend
 */
async function sendAuditLog(event: AuditEvent): Promise<void> {
  await fetch('/api/v1/audit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getCsrfHeader(),
    },
    body: JSON.stringify(event),
  });
}

/**
 * Get audit log entries
 */
export function getAuditLog(): AuditEvent[] {
  return [...auditLog];
}
