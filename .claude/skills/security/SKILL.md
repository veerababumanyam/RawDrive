---
name: security
description: Security and data protection guidelines for RawDrive. Use when implementing authentication, handling user data, validating inputs, or reviewing security-sensitive code.
---

# Security & Data Protection Guidelines

## Overview

RawDrive is an enterprise SaaS platform handling sensitive client photos and PII for 20,000+ photographer customers. Security is critical. This skill covers authentication, authorization, data protection, and compliance requirements.

## Monorepo Security Code Locations

| Purpose | Location |
|---------|----------|
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| JWT validation | `apps/api/src/middleware/jwtAuth.ts` |
| RBAC middleware | `apps/api/src/middleware/rbac.ts` |
| Rate limiting | `apps/api/src/middleware/rateLimiter.ts` |
| CSRF protection | `apps/api/src/middleware/csrf.ts` |
| Security headers | `apps/api/src/middleware/securityHeaders.ts` |
| Input sanitization | `apps/api/src/middleware/sanitization.ts` |
| Auth service | `apps/api/src/services/AuthService.ts` |
| 2FA service | `apps/api/src/services/TwoFactorService.ts` |
| Encryption | `apps/api/src/services/EncryptionService.ts` |
| Audit logging | `apps/api/src/services/AuditService.ts` |
| Shared validation | `packages/utils/src/validation.ts` |
| Shared crypto | `packages/utils/src/crypto.ts` |

## Architecture Security Layers

```
                    CloudFlare WAF/DDoS
                          |
                     nginx (TLS 1.3)
                          |
                    Rate Limiting
                          |
                   CSRF Protection
                          |
                  JWT Authentication
                          |
                  RBAC Authorization
                          |
                 Tenant Isolation
                          |
                 Encrypted Storage
```

## Authentication

### JWT Token Flow

```typescript
// apps/api/src/services/AuthService.ts pattern

// Token configuration - load from env, never hardcode secrets
const ACCESS_TOKEN_EXPIRY = '15m';   // Short-lived
const REFRESH_TOKEN_EXPIRY = '7d';   // Long-lived
const JWT_SECRET = process.env.JWT_SECRET!;        // NEVER hardcode
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Generate token pair
async function generateTokens(user: User): Promise<TokenPair> {
  const accessToken = jwt.sign(
    { userId: user.id, workspaceId: user.workspaceId, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  // Store refresh token hash in Redis for revocation
  await cacheSet(`refresh:${user.id}`, hashToken(refreshToken), 7 * 24 * 60 * 60);

  return { accessToken, refreshToken };
}
```

### Password Security

```typescript
// Password hashing (12 rounds bcrypt)
const passwordHash = await bcrypt.hash(password, 12);

// Password validation requirements
function validatePassword(password: string): void {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain special character');
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join(', '));
  }
}
```

### Two-Factor Authentication (2FA)

```typescript
// TwoFactorService.ts pattern
import speakeasy from 'speakeasy';

// Generate TOTP secret
function generate2FASecret(email: string) {
  return speakeasy.generateSecret({
    name: `RawDrive:${email}`,
    issuer: 'RawDrive',
  });
}

// Verify TOTP token
function verify2FAToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1,  // Allow 1 step before/after
  });
}
```

### Session Management

```typescript
// Frontend: Store minimal data
localStorage.setItem('accessToken', token);  // OK - short-lived JWT
sessionStorage.setItem('tempState', state);  // OK - cleared on tab close

// NEVER store:
// - User email/PII
// - Refresh tokens (use httpOnly cookies instead)
// - API keys or secrets
// - LLM provider names or model identifiers
// - Password hashes

// Logout - clear everything
const logout = async () => {
  localStorage.removeItem('accessToken');
  sessionStorage.clear();
  await apiService.post('/v1/auth/logout');
  window.location.href = '/login';
};
```

## Authorization (RBAC)

### Role Hierarchy

```
Platform Admin (system-wide)
    |
Tenant Super Admin (tenant-wide)
    |
Tenant Admin
    |
Photographer (owner)
    |
Studio Manager
    |
Editor
    |
Client (gallery-scoped)
    |
Viewer (read-only)
```

### Permission Checking

```typescript
// apps/api/src/middleware/rbac.ts
import { RBACService } from '../services/RBACService';

const rbacService = RBACService.getInstance();

// Middleware factory
export const requirePermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId, tenantId } = req.user;

    const hasPermission = await rbacService.checkPermission(
      userId,
      tenantId,
      permissions
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
      });
    }

    next();
  };
};

// Usage in routes
router.delete(
  '/galleries/:id',
  authenticate,
  requirePermission('gallery:delete'),
  galleryController.delete
);
```

### Permission Format

```typescript
// Resource-based permissions
type Permission =
  | 'gallery:create'
  | 'gallery:read'
  | 'gallery:update'
  | 'gallery:delete'
  | 'gallery:share'
  | 'photo:upload'
  | 'photo:delete'
  | 'photo:download'
  | 'client:manage'
  | 'user:manage'
  | 'billing:view'
  | 'billing:manage'
  | 'tenant:*';  // Wildcard for super admin
```

## Workspace Data Isolation

### Database Query Pattern

```typescript
// ALWAYS include workspace_id in queries
// This is the PRIMARY security boundary

// Correct pattern
const assets = await pool.query(
  `SELECT * FROM assets
   WHERE workspace_id = $1 AND status != 'deleted'`,
  [req.user.workspaceId]
);

// WRONG - No workspace isolation
const assets = await pool.query(
  `SELECT * FROM assets WHERE asset_id = $1`,
  [assetId]
);

// WRONG - Client-provided workspace_id
const assets = await pool.query(
  `SELECT * FROM assets WHERE workspace_id = $1`,
  [req.body.workspaceId]  // NEVER trust client input
);
```

### Row-Level Security (PostgreSQL)

```sql
-- Enable RLS on sensitive tables
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

-- Create policy for workspace isolation
CREATE POLICY workspace_isolation ON assets
  USING (workspace_id = current_setting('app.workspace_id')::uuid);

-- Set workspace context in connection
SET app.workspace_id = 'uuid-here';
```

### Storage Object Key Pattern

```typescript
// All storage keys MUST include workspace_id prefix
const objectKey = `workspaces/${workspaceId}/assets/${assetId}/original/${filename}`;

// NEVER allow workspace_id to come from user input
// Always derive from authenticated session
```

## Input Validation & Sanitization

### Express Middleware

```typescript
// apps/api/src/middleware/sanitization.ts

// Sanitize all incoming requests
export const sanitizeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query params
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const key of Object.keys(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(obj[key]);
    }
    return sanitized;
  }
  return obj;
}

function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '')           // Remove HTML tags
    .replace(/javascript:/gi, '')    // Remove javascript: protocol
    .replace(/on\w+=/gi, '')         // Remove event handlers
    .trim()
    .slice(0, 10000);                // Limit length
}
```

### Validation with Zod

```typescript
import { z } from 'zod';

// Library creation schema
const createLibrarySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  clientId: z.string().uuid().optional(),
  isPasswordProtected: z.boolean().default(false),
  password: z.string().min(6).max(100).optional(),
  settings: z.object({
    allowDownload: z.boolean().default(true),
    watermarkEnabled: z.boolean().default(false),
    expiresAt: z.string().datetime().optional(),
  }).optional(),
});

// Validate in controller
export const createLibrary = async (req: Request, res: Response) => {
  const result = createLibrarySchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: 'Validation Error',
      details: result.error.flatten(),
    });
  }

  // Use validated data - workspace_id from JWT, not request body
  const library = await libraryService.create(result.data, req.user.workspaceId);
};
```

### File Upload Security

```typescript
// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const MAX_FILE_SIZE = 100 * 1024 * 1024;  // 100MB

// Validate file
function validateUpload(file: Express.Multer.File): void {
  // Check MIME type
  const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new ValidationError(`Invalid file type: ${file.mimetype}`);
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError('File too large (max 100MB)');
  }

  // Verify magic bytes match MIME type
  const magicBytes = file.buffer.slice(0, 12);
  if (!verifyMagicBytes(magicBytes, file.mimetype)) {
    throw new ValidationError('File content does not match type');
  }

  // Check file extension matches MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  if (!isValidExtension(ext, file.mimetype)) {
    throw new ValidationError('File extension does not match type');
  }
}
```

## Rate Limiting

### Backend Rate Limiter

```typescript
// apps/api/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../config/redis';

// General API rate limit
export const apiRateLimit = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 60 * 1000,     // 1 minute
  max: 100,                 // 100 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints (stricter)
export const authRateLimit = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts
  message: { error: 'Too many login attempts, please try again later' },
});

// Upload endpoints (per workspace)
export const uploadRateLimit = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 1000,                  // 1000 uploads per hour
  keyGenerator: (req) => `upload:${req.user?.workspaceId}`,
});
```

### AI Service Rate Limiting

```typescript
// Limit expensive AI operations
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,  // 30 AI operations per minute
  keyGenerator: (req) => `ai:${req.user?.workspaceId}`,
});
```

## CSRF Protection

```typescript
// backend/src/middleware/csrf.ts
import csrf from 'csurf';

// CSRF protection for state-changing requests
export const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
});

// Provide token to frontend
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Frontend: Include CSRF token
const apiRequest = async (url: string, options: RequestInit = {}) => {
  const csrfToken = await getCsrfToken();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-CSRF-Token': csrfToken,
    },
    credentials: 'include',
  });
};
```

## Security Headers

```typescript
// apps/api/src/middleware/securityHeaders.ts
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "*.cloudflare.com", "*.r2.cloudflarestorage.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "*.rawdrive.app", "*.cloudflare.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
});
```

## Data Encryption

### Encryption at Rest

```typescript
// apps/api/src/services/EncryptionService.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
const ALGORITHM = 'aes-256-gcm';

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Use for sensitive fields
await pool.query(
  `INSERT INTO api_keys (tenant_id, key_hash, encrypted_key)
   VALUES ($1, $2, $3)`,
  [tenantId, hashKey(key), encrypt(key)]
);
```

### Secure Token Generation

```typescript
// Generate secure random tokens
import crypto from 'crypto';

// API keys
const apiKey = crypto.randomBytes(32).toString('base64url');

// Email verification tokens
const verificationToken = crypto.randomBytes(32).toString('hex');

// Password reset tokens (time-limited)
const resetToken = crypto.randomBytes(32).toString('hex');
await cacheSet(`reset:${resetToken}`, userId, 3600);  // 1 hour expiry
```

## PII Protection

### Never Log PII

```typescript
// WRONG
logger.info('User registered', { email: user.email, phone: user.phone });

// CORRECT
logger.info('User registered', { userId: user.id, workspaceId: user.workspaceId });

// WRONG - Error contains PII
catch (error) {
  logger.error('Failed', { error, user });
}

// CORRECT - Sanitized error
catch (error) {
  logger.error('Failed', {
    userId: user.id,
    errorCode: error.code,
    errorMessage: sanitizeErrorMessage(error.message),
  });
}
```

### Data Masking

```typescript
// Mask sensitive data in responses
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string): string {
  return phone.slice(0, 3) + '***' + phone.slice(-2);
}

// API response
res.json({
  user: {
    id: user.id,
    email: maskEmail(user.email),
    emailVerified: user.emailVerified,
  },
});
```

## API Key & Secret Security

```typescript
// NEVER expose API keys, secrets, or LLM provider details in frontend
// WRONG
const AI_KEY = 'sk-...';  // Hardcoded in frontend - SECURITY VULNERABILITY!
const AI_PROVIDER = 'openai';  // Never hardcode provider names

// CORRECT - Proxy through backend, load from env
// apps/web/src/services/aiService.ts
const analyzeAsset = async (assetId: string) => {
  return apiService.post('/v1/ai/analyze', { assetId });
};

// backend handles secrets loaded from environment
// apps/api/src/routes/v1/ai.ts
router.post('/analyze', authenticate, async (req, res) => {
  // AI provider and key loaded from process.env, never hardcoded
  const result = await aiService.analyze(req.body.assetId);
  res.json(result);
});

// apps/api/src/services/AIService.ts
class AIService {
  private provider = process.env.AI_PROVIDER;    // From env
  private apiKey = process.env.AI_API_KEY;       // From env
  private model = process.env.AI_MODEL;          // From env
}
```

## Audit Logging

```typescript
// apps/api/src/services/AuditService.ts
export async function auditLog(event: AuditEvent): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (
      workspace_id, user_id, action, resource_type, resource_id,
      ip_address, user_agent, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      event.workspaceId,
      event.userId,
      event.action,
      event.resourceType,
      event.resourceId,
      event.ipAddress,
      event.userAgent,
      JSON.stringify(event.metadata),
    ]
  );
}

// Usage
await auditLog({
  workspaceId: req.user.workspaceId,
  userId: req.user.userId,
  action: 'asset.delete',
  resourceType: 'asset',
  resourceId: assetId,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: { assetName: asset.original_filename },
});
```

## GDPR Compliance

### Data Export

```typescript
// Export all user data
async function exportUserData(userId: string, workspaceId: string): Promise<UserDataExport> {
  const [user, libraries, assets, clients] = await Promise.all([
    getUserData(userId),
    getUserLibraries(userId, workspaceId),
    getUserAssets(userId, workspaceId),
    getUserClients(userId, workspaceId),
  ]);

  return {
    user,
    libraries,
    assets: assets.map(a => ({ ...a, url: getSignedUrl(a.original_object_key) })),
    clients,
    exportedAt: new Date().toISOString(),
  };
}
```

### Data Deletion

```typescript
// Hard delete all user data (right to be forgotten)
async function deleteAllUserData(userId: string, workspaceId: string): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete in reverse dependency order
    await client.query('DELETE FROM face_embeddings WHERE asset_id IN (SELECT asset_id FROM assets WHERE workspace_id = $1)', [workspaceId]);
    await client.query('DELETE FROM assets WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM libraries WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM clients WHERE workspace_id = $1', [workspaceId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    // Delete from storage (respects BYOS if configured)
    await storageService.deleteAllWorkspaceFiles(workspaceId);

    await client.query('COMMIT');

    // Audit the deletion
    await auditLog({
      workspaceId,
      action: 'user.data_deleted',
      resourceType: 'user',
      resourceId: userId,
      metadata: { reason: 'GDPR request' },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

## Security Checklist

### Pre-Deployment

- [ ] All API endpoints require authentication
- [ ] All data queries include workspace_id filter
- [ ] All storage keys include workspace_id prefix
- [ ] Input validation on all user inputs
- [ ] File upload validation (type, size, content, checksum)
- [ ] Rate limiting on all endpoints
- [ ] CSRF tokens on state-changing requests
- [ ] Security headers configured
- [ ] No hardcoded secrets, API keys, or LLM providers in code
- [ ] All secrets loaded from environment variables
- [ ] Environment variables validated on startup
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitization + CSP)
- [ ] Sensitive data encrypted at rest
- [ ] BYOS credentials encrypted with rotation support
- [ ] HTTPS enforced everywhere
- [ ] Audit logging for sensitive operations

### Code Review

- [ ] No PII in logs or error messages
- [ ] No secrets, API keys, or provider names in code or comments
- [ ] Proper error handling (no stack traces to client)
- [ ] Authorization checks before data access
- [ ] Workspace isolation enforced
- [ ] Password/token handling follows best practices

### Incident Response

1. **Detect**: Monitor logs for suspicious activity
2. **Contain**: Disable affected accounts/features
3. **Assess**: Determine scope and impact
4. **Notify**: Alert affected users and authorities if required
5. **Remediate**: Fix vulnerability and restore service
6. **Review**: Post-mortem and preventive measures
