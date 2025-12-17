# Authentication and Security

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive implements comprehensive authentication and security measures to protect user accounts, data, and platform integrity. This document covers authentication mechanisms, security protocols, and best practices.

## Purpose

Authentication and security features serve to:
- **Protect Accounts**: Secure user authentication and session management
- **Prevent Unauthorized Access**: Control who can access what data
- **Protect Data**: Encrypt data in transit and at rest
- **Detect Threats**: Monitor and prevent security incidents
- **Comply with Standards**: Meet industry security standards
- **Enable Recovery**: Provide account recovery mechanisms

## Authentication

### User Authentication

Authenticate users securely.

**Decision (direct users / self-serve):**
- Primary signup/login: **Google OAuth (OIDC)**.
- Also support **local users** (email/password) for users without Google IDs.
- Accounts can be **linked** (Google ↔ local) using verified email to avoid duplicate accounts.

**Authentication Methods:**
```typescript
type AuthMethod = 'email_password' | 'google_oauth' | 'two_factor';

interface AuthenticationFlow {
  // Email/Password
  emailPassword: {
    email: string;
    password: string;
    rememberMe: boolean;
  },
  
  // Google OAuth
  googleOAuth: {
    clientId: string;
    redirectUri: string;
    scope: string[];
  },
  
  // Two-Factor Authentication
  twoFactor: {
    method: 'totp' | 'sms' | 'email';
    code: string;
  },
}
```

### Identity linking and account uniqueness

To avoid painful rewrites later (duplicate accounts, broken memberships), treat "how a user logs in" as **identities** attached to a single `User`.

**Recommended model:**
```typescript
type IdentityProvider = 'google' | 'local';

interface UserIdentity {
  userId: string;
  provider: IdentityProvider;
  providerUserId?: string; // required for google
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}
```

**Rules:**
- `users.email` is globally unique.
- Google OAuth login: if `email` matches an existing user and Google asserts `email_verified=true`, link the Google identity to that user.
- Local signup: require email verification before allowing sensitive actions.
- Never trust the frontend for linking decisions; always enforce on backend.

### Password Requirements

Enforce strong password policies.

**Password Rules:**
```typescript
interface PasswordPolicy {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  expirationDays: 90,
  historyCount: 5, // Cannot reuse last 5 passwords
  lockoutAttempts: 5,
  lockoutDuration: 900, // 15 minutes
}
```

**Password Validation:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*)
- Cannot contain username or email
- Cannot reuse last 5 passwords

### Password Hashing

Securely hash passwords.

**Hashing Algorithm:**
```typescript
interface PasswordHashing {
  algorithm: 'argon2id', // Recommended
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
  saltLength: 16,
}

// Alternative: bcrypt
interface BcryptHashing {
  algorithm: 'bcrypt',
  rounds: 12,
  saltLength: 16,
}
```

### Token signing (JWT)

- **Algorithm:** `EdDSA` with **Ed25519** keypair (preferred over RSA for smaller keys and modern security).
- **Key handling:**
  - Private key stored only on the backend (see `.env` paths `JWT_PRIVATE_KEY_PATH` and `JWT_PUBLIC_KEY_PATH`).
  - Public key can be shared with trusted services for verification if needed.
  - Keys are generated locally and kept out of version control; the `backend/secrets/` folder is git-ignored.
- **Rotation:** Generate a new Ed25519 pair and update env paths; keep prior public key available until all tokens signed with it expire.

**Hashing Process:**
1. Generate random salt
2. Hash password with salt
3. Store hash (never store plaintext)
4. Verify on login by hashing input and comparing

### Session Management

Manage user sessions securely.

**Session Configuration:**
```typescript
interface SessionManagement {
  // Session creation
  sessionTimeout: 3600, // 1 hour
  absoluteTimeout: 86400, // 24 hours
  
  // Session storage
  storage: 'secure_cookie' | 'http_only_cookie',
  sameSite: 'Strict' | 'Lax' | 'None',
  secure: true, // HTTPS only
  httpOnly: true, // No JavaScript access
  
  // Session tracking
  trackIpAddress: true,
  trackUserAgent: true,
  trackDeviceId: true,
  
  // Session renewal
  renewalThreshold: 300, // Renew if < 5 min remaining
  maxSessions: 5, // Max concurrent sessions per user
}
```

**Session Lifecycle:**
1. User logs in
2. Session created with token
3. Token stored in secure cookie
4. Token validated on each request
5. Session renewed if near expiration
6. Session destroyed on logout

### Two-Factor Authentication

Enable two-factor authentication (2FA).

**2FA Methods:**
```typescript
type TwoFactorMethod = 'totp' | 'sms' | 'email' | 'backup_codes';

interface TwoFactorSetup {
  // TOTP (Time-based One-Time Password)
  totp: {
    algorithm: 'SHA1',
    period: 30, // seconds
    digits: 6,
    qrCode: string,
    secret: string,
  },
  
  // SMS
  sms: {
    phoneNumber: string,
    codeLength: 6,
    expirationTime: 300, // 5 minutes
  },
  
  // Email
  email: {
    emailAddress: string,
    codeLength: 6,
    expirationTime: 600, // 10 minutes
  },
  
  // Backup codes
  backupCodes: {
    count: 10,
    length: 8,
    oneTimeUse: true,
  },
}
```

**2FA Enforcement:**
- Optional for all users
- Required for admin accounts
- Required for enterprise tier
- Backup codes for account recovery

### Social Login

Allow login via social providers.

**Supported Providers (initial):**
- Google OAuth 2.0 / OIDC (primary)

**Future candidates:** Facebook, GitHub, Microsoft.

**OAuth Flow:**
1. User clicks "Sign in with [Provider]"
2. Redirect to provider's authorization page
3. User authorizes RawDrive
4. Provider redirects back with authorization code
5. Exchange code for access token
6. Fetch user information
7. Create or link account
8. Create session

**Data Mapping:**
```typescript
interface OAuthUserData {
  // From provider
  providerId: string,
  providerUserId: string,
  email: string,
  name: string,
  picture?: string,
  
  // RawDrive mapping
  userId: string,
  linkedAt: Date,
  provider: 'google' | 'facebook' | 'github' | 'microsoft',
}
```

## Authorization

### Role-Based Access Control

Control access based on user roles.

**Authorization Checks:**
```typescript
// Check if user has permission
type AuthRealm = 'workspace' | 'platform_admin';

const hasPermission = (
  ctx: { authRealm: AuthRealm; workspacePermissions?: string[] },
  resource: string,
  action: string
): boolean => {
  // Platform admins operate through a separate Admin Console and do not
  // automatically bypass workspace RBAC on customer APIs.
  if (ctx.authRealm === 'platform_admin') return false;

  // Workspace-scoped RBAC (customer APIs)
  const permission = `${resource}:${action}`;
  return (ctx.workspacePermissions ?? []).includes(permission);
};

// Enforce on backend
app.get('/api/galleries/:id', (req, res) => {
  const gallery = await Gallery.findById(req.params.id);
  
  // NOTE: all customer API routes must be scoped to workspace_id and membership.
  if (!hasPermission(req.authContext, 'gallery', 'read')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  return res.json(gallery);
});
```

### Resource-Level Access Control

Control access to specific resources.

**Resource Ownership:**
```typescript
interface ResourceAccess {
  resourceId: string,
  ownerId: string,
  sharedWith: {
    userId: string,
    permission: 'view' | 'edit' | 'admin',
  }[],
  isPublic: boolean,
  accessCode?: string,
}

// Check access
const canAccess = (userId: string, resource: Resource): boolean => {
  // Owner has full access
  if (resource.ownerId === userId) return true;
  
  // Check shared access
  const sharedAccess = resource.sharedWith.find(s => s.userId === userId);
  if (sharedAccess) return true;
  
  // Check public access
  if (resource.isPublic) return true;
  
  return false;
};
```

## Data Security

### Encryption in Transit

Encrypt data during transmission.

**TLS/SSL Configuration:**
```typescript
interface TLSConfiguration {
  protocol: 'TLS 1.3', // Minimum
  cipherSuites: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
  ],
  certificateProvider: 'Let\'s Encrypt',
  certificateRenewal: 'automatic',
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubdomains: true,
    preload: true,
  },
}
```

**HTTPS Enforcement:**
- All traffic over HTTPS
- HTTP redirects to HTTPS
- HSTS headers enabled
- Certificate pinning (mobile apps)

### Encryption at Rest

Encrypt data stored on servers.

**Encryption Configuration:**
```typescript
interface EncryptionAtRest {
  algorithm: 'AES-256-GCM',
  keyManagement: 'AWS KMS' | 'Azure Key Vault' | 'HashiCorp Vault' | 'self-managed',
  keyRotation: 'annual',
  
  // Data to encrypt
  encryptedData: [
    'user_passwords',
    'payment_methods',
    'api_keys',
    'sensitive_metadata',
  ],
  
  // Database encryption
  databaseEncryption: true,
  backupEncryption: true,
}
```

**Encryption Scope:**
- User passwords (hashed + encrypted)
- Payment information
- API keys and tokens
- Sensitive metadata
- Database backups

### API Key Security

Secure API key management.

**API Key Generation:**
```typescript
interface APIKey {
  id: string,
  key: string, // Hashed
  name: string,
  createdAt: Date,
  lastUsedAt?: Date,
  expiresAt?: Date,
  
  // Permissions
  permissions: string[],
  
  // Restrictions
  ipWhitelist?: string[],
  rateLimit?: number,
}
```

**API Key Best Practices:**
- Generate cryptographically secure keys
- Hash keys before storage
- Rotate keys regularly
- Revoke unused keys
- Restrict by IP address
- Restrict by permissions
- Set expiration dates
- Monitor usage

## Threat Prevention

### SQL Injection Prevention

Prevent SQL injection attacks.

**Prevention Measures:**
```typescript
// ❌ Bad: Vulnerable to SQL injection
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Good: Use parameterized queries
const query = 'SELECT * FROM users WHERE email = ?';
const result = await db.query(query, [email]);

// ✅ Good: Use ORM
const user = await User.findOne({ email });
```

### Cross-Site Scripting (XSS) Prevention

Prevent XSS attacks.

**Prevention Measures:**
```typescript
// ❌ Bad: Vulnerable to XSS
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ Good: Escape user input
<div>{userInput}</div>

// ✅ Good: Sanitize if HTML needed
import DOMPurify from 'dompurify';
const sanitized = DOMPurify.sanitize(userInput);
<div dangerouslySetInnerHTML={{ __html: sanitized }} />
```

**Content Security Policy:**
```typescript
interface CSPHeaders {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' cdn.example.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' api.example.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}
```

### Cross-Site Request Forgery (CSRF) Prevention

Prevent CSRF attacks.

**CSRF Token Implementation:**
```typescript
// Generate token
const csrfToken = generateRandomToken();
session.csrfToken = csrfToken;

// Include in form
<form method="POST" action="/api/galleries">
  <input type="hidden" name="_csrf" value={csrfToken} />
  {/* form fields */}
</form>

// Verify on backend
app.post('/api/galleries', (req, res) => {
  const token = req.body._csrf || req.headers['x-csrf-token'];
  
  if (token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }
  
  // Process request
});
```

### Rate Limiting

Prevent brute force and DoS attacks.

**Rate Limiting Configuration:**
```typescript
interface RateLimiting {
  // Login attempts
  loginAttempts: {
    maxAttempts: 5,
    windowMs: 900000, // 15 minutes
    lockoutMs: 1800000, // 30 minutes
  },
  
  // API requests
  apiRequests: {
    maxRequests: 1000,
    windowMs: 3600000, // 1 hour
    perUser: true,
  },
  
  // File uploads
  fileUploads: {
    maxRequests: 100,
    windowMs: 3600000, // 1 hour
    perUser: true,
  },
}
```

### DDoS Protection

Protect against DDoS attacks.

**DDoS Mitigation:**
- Cloudflare edge (CDN + WAF + DDoS protection)
- Cloudflare Turnstile for bot mitigation on high-risk public endpoints
- Rate limiting
- IP blocking
- Traffic analysis
- Automatic scaling
- Geographic distribution

## Vulnerability Management

### Security Scanning

Scan for vulnerabilities.

**Scanning Tools:**
- OWASP ZAP (web application scanning)
- Snyk (dependency scanning)
- SonarQube (code quality)
- npm audit (npm dependencies)
- Trivy (container scanning)

**Scanning Schedule:**
- Continuous integration (on every commit)
- Weekly full scans
- Monthly penetration testing
- Quarterly security audit

### Dependency Management

Keep dependencies secure.

**Dependency Security:**
```typescript
interface DependencyManagement {
  // Automated updates
  dependabot: true,
  autoMergeSecurityUpdates: true,
  
  // Vulnerability scanning
  npmAudit: 'weekly',
  snyk: 'continuous',
  
  // Outdated packages
  checkOutdated: 'monthly',
  updatePolicy: 'patch_and_minor',
  
  // License compliance
  licenseScan: 'quarterly',
  allowedLicenses: [
    'MIT',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
  ],
}
```

### Patch Management

Apply security patches promptly.

**Patch Schedule:**
- Critical: Within 24 hours
- High: Within 1 week
- Medium: Within 2 weeks
- Low: Within 1 month

## Incident Response

### Security Incident Response

Respond to security incidents.

**Incident Response Plan:**
```typescript
interface IncidentResponse {
  // Detection
  detection: {
    monitoring: true,
    alerting: true,
    responseTime: '15 minutes',
  },
  
  // Assessment
  assessment: {
    severity: 'critical' | 'high' | 'medium' | 'low',
    scope: 'number_of_affected_users',
    dataExposed: 'types_of_data',
  },
  
  // Containment
  containment: {
    isolateAffectedSystems: true,
    disableAffectedAccounts: true,
    blockAttackerIPs: true,
  },
  
  // Notification
  notification: {
    affectedUsers: true,
    regulators: true,
    mediaStatement: true,
    timeline: '72 hours',
  },
  
  // Recovery
  recovery: {
    restoreFromBackup: true,
    verifyIntegrity: true,
    monitorForRecurrence: true,
  },
}
```

### Breach Notification

Notify users of data breaches.

**Notification Requirements:**
- GDPR: 72 hours
- CCPA: Without unreasonable delay
- State laws: Vary by state
- Notification content:
  - What happened
  - What data was exposed
  - What users should do
  - Support contact information

## Compliance

### Security Standards

Comply with security standards.

**Standards:**
- OWASP Top 10
- NIST Cybersecurity Framework
- ISO 27001
- SOC 2 Type II
- PCI DSS (if handling payments)

### Audit Logging

Log security events.

**Logged Events:**
```typescript
interface SecurityAuditLog {
  timestamp: Date,
  userId: string,
  action: string,
  resource: string,
  result: 'success' | 'failure',
  ipAddress: string,
  userAgent: string,
  details: Record<string, any>,
}

// Logged actions
const LOGGED_ACTIONS = [
  'login',
  'logout',
  'password_change',
  'password_reset',
  'two_factor_enabled',
  'two_factor_disabled',
  'api_key_created',
  'api_key_revoked',
  'permission_granted',
  'permission_revoked',
  'data_accessed',
  'data_modified',
  'data_deleted',
];
```

## Security Best Practices

### Do's
- ✅ Use HTTPS for all communication
- ✅ Hash passwords with strong algorithms
- ✅ Implement rate limiting
- ✅ Use parameterized queries
- ✅ Escape user input
- ✅ Implement CSRF protection
- ✅ Enable 2FA
- ✅ Log security events
- ✅ Keep dependencies updated
- ✅ Conduct security audits

### Don'ts
- ❌ Don't store passwords in plaintext
- ❌ Don't expose sensitive data in logs
- ❌ Don't use weak encryption
- ❌ Don't trust user input
- ❌ Don't hardcode secrets
- ❌ Don't use outdated libraries
- ❌ Don't skip security testing
- ❌ Don't ignore security warnings
- ❌ Don't disable security features
- ❌ Don't delay security patches

## Related Files

- `frontend/src/components/auth/RegistrationForm.tsx` - Registration
- `frontend/src/components/auth/ProtectedRoute.tsx` - Route protection
- `frontend/src/components/LoginView.tsx` - Login interface
- `services/authService.ts` - Authentication service
- `docs/RBAC_AND_USER_MANAGEMENT.md` - User roles and permissions

## Last Updated

2025-12-17
