# Security Issue: Gallery ID Exposure in URLs

## Problem Statement

Several frontend components are exposing gallery UUIDs directly in public URLs (e.g., `/g/{gallery_id}`) instead of using cryptographically secure magic link tokens. This violates security best practices and compliance standards.

## Security Risks

### 1. **OWASP Top 10 - A01:2021 Broken Access Control**
- **Risk**: UUID enumeration attacks
- **Impact**: Attackers can guess or enumerate gallery IDs to access unauthorized galleries
- **Severity**: HIGH

### 2. **SOC 2 Compliance Violations**
- **CC6.1**: Logical and physical access controls
- **CC6.2**: Access credentials and authentication information
- **CC6.6**: Unauthorized access prevention
- **CC7.2**: System monitoring and anomaly detection

### 3. **NIST Cybersecurity Framework**
- **PR.AC-1**: Identities and credentials are managed for authorized devices and users
- **PR.AC-3**: Remote access is managed
- **PR.AC-4**: Access permissions and authorizations are managed

### 4. **GDPR/CCPA Compliance**
- **Data Minimization**: Exposing internal IDs violates data minimization principles
- **Access Control**: Direct ID exposure bypasses proper access control mechanisms

## Current Vulnerable Code Locations

1. **DashboardPage.tsx** (line 571): `window.open(\`/g/${gallery.gallery_id}\`, '_blank')`
2. **GalleriesPage.tsx** (line 603): `href={\`/g/${gallery.gallery_id}\`}`
3. **SharedDashboardPage.tsx** (line 339): `href={\`/g/${row.gallery_id}\`}`
4. **GalleryDetailPage.tsx** (line 947): `window.open(\`/g/${gallery.gallery_id}\`, '_blank')`
5. **GalleryLinkManager.tsx** (line 338): `window.open(\`/g/${gallery.gallery_id}\`, '_blank')`

## Correct Implementation

### Magic Link Tokens (Current Standard)
- **Entropy**: 256 bits (32 bytes from `secrets.token_bytes`)
- **Storage**: SHA-256 hash only (never plaintext)
- **Format**: URL-safe base64 encoded
- **Properties**:
  - Cryptographically random (unpredictable)
  - Time-limited (expiry support)
  - Revocable (status-based)
  - Not guessable (2^256 possible values)

### URL Structure
```
✅ CORRECT: /g/{magic_link_token}     # Secure, unpredictable
❌ WRONG:   /g/{gallery_id}           # Predictable UUID, enumerable
```

## Recommended Fix

### Option 1: Use Existing Magic Links (Preferred)
For workspace pages where users view their own galleries:
1. Check if a magic link exists for the gallery
2. If exists, use the magic link URL
3. If not, prompt user to create one or create on-the-fly

### Option 2: Create Magic Link On-The-Fly
For internal "View as Client" features:
1. Create a temporary magic link when user clicks "View as Client"
2. Use the magic link token in the URL
3. Optionally auto-revoke after viewing

### Option 3: Separate Internal Preview Route
Create a separate authenticated route for workspace previews:
- `/workspace/galleries/{gallery_id}/preview` (requires authentication)
- Keep `/g/{token}` for public sharing only

## Compliance Standards

### SOC 2 Type II
- ✅ **CC6.1**: Access controls must prevent unauthorized access
- ✅ **CC6.2**: Credentials must be properly managed
- ✅ **CC6.6**: Unauthorized access attempts must be prevented

### OWASP ASVS (Application Security Verification Standard)
- ✅ **V4.1**: Verify that the application enforces access control rules on a trusted service layer
- ✅ **V4.2**: Verify that all user and data attributes and policy information used by access controls cannot be manipulated by end users unless specifically authorized

### NIST 800-53
- ✅ **AC-3**: Access enforcement
- ✅ **AC-4**: Information flow enforcement
- ✅ **AC-7**: Unsuccessful logon attempts

## Implementation Priority

**Priority**: HIGH
**Effort**: Medium
**Risk**: High (Security & Compliance)

## References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [SOC 2 Trust Services Criteria](https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Magic Link Security Model](./Features/MagicLink.md#7-security-model)
