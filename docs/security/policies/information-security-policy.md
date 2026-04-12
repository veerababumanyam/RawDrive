# Information Security Policy

**Version:** 1.0
**Effective Date:** 2026-04-12
**Owner:** Manyam Prasad — Founder / Acting CISO
**Review Cadence:** Annual (next: 2027-04-12)
**Approved By:** Manyam Prasad

---

## 1. Purpose

This policy establishes the information security management framework for
RawDrive, a SaaS platform for professional photography studios. It defines
the security principles, responsibilities, and control objectives that
protect customer data, business operations, and platform integrity.

## 2. Scope

This policy applies to:
- All RawDrive production systems (API, frontend, database, storage)
- All personnel with access to production infrastructure
- All third-party service providers processing RawDrive customer data
- All customer data: PII, photographs, financial records, usage metadata

## 3. Security Principles

1. **Least Privilege:** Access is granted only as needed for the role. Platform roles enforce this (see migration 035, `RequirePlatformRole` middleware).
2. **Defense in Depth:** Multiple layers — JWT auth, tenant isolation, envelope encryption (F-005 KEK), R2 bucket isolation, immutable audit logging.
3. **Default Deny:** All endpoints require authentication unless explicitly marked public. Gallery access requires share links or authentication.
4. **Encryption Everywhere:** AES-256-GCM envelope encryption at rest (platform_settings, MFA secrets). TLS 1.3 in transit. R2 server-side encryption for media.

## 4. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| Founder / Acting CISO | Policy approval, risk acceptance, incident escalation |
| Engineering Lead | Control implementation, vulnerability remediation, key management |
| All developers | Secure coding practices, PR review, secret scanning compliance |

## 5. Access Control

- **Platform roles:** super_admin, admin, dealer, photographer, team_member, client (migration 035)
- **MFA:** TOTP (RFC 6238) available for all users, enforced for admin roles (RequireMFA middleware)
- **API keys:** Scoped, rotatable, logged (api_key_auth middleware)
- **Production access:** Limited to founder + authorized personnel with background verification on file

## 6. Data Protection

- **Classification:** Customer photographs (confidential), PII (restricted), usage metadata (internal), public marketing content (public)
- **Encryption at rest:** Envelope encryption with PLATFORM_SETTINGS_KEK for secrets; R2 SSE for media
- **Encryption in transit:** TLS 1.3 mandatory for all API and web traffic
- **Data residency:** Configurable per workspace; Indian studios default to ap-south-1 compatible storage

## 7. Incident Response

See [Incident Response Playbook](../../runbooks/incident-response.md) for the complete SOP.
- **Detection:** Immutable audit log (migration 009), CI secret scanning (gitleaks — blocking)
- **72-hour notification:** Per DPDPA 2023 and GDPR breach notification requirements
- **Post-incident review:** Required for all P1/P2 incidents

## 8. Change Management

- All code changes require PR review before merge
- CI pipeline gates: unit tests, govulncheck, pnpm audit, gitleaks (blocking), semgrep, trivy
- Production deployments follow `docs/runbooks/rolling-deploy.md`
- Database migrations are forward-only, append-only (no destructive ALTER/DROP in production)

## 9. Vendor Management

See [Sub-Processor Register](../sub-processors.md) for the current list.
All vendors processing customer data must:
- Have a signed Data Processing Agreement (DPA)
- Meet equivalent security standards
- Be reviewed annually for continued necessity

## 10. Policy Violations

Violations of this policy will be investigated and may result in:
- Revocation of production access
- Termination of contractor agreements
- Regulatory notification if customer data is affected

## 11. Review and Amendment

This policy is reviewed annually. Material amendments require founder approval
and are versioned in git with the change date recorded below.

### Amendment Log

| Date | Version | Change | Approved By |
|---|---|---|---|
| 2026-04-12 | 1.0 | Initial policy | Manyam Prasad |
