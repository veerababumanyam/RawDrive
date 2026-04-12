# SOC2 Type II Control Ownership Matrix

**Version:** 1.0
**Last Updated:** 2026-04-12
**Owner:** Manyam Prasad (Founder / Acting CISO)

---

## Trust Services Criteria: Security (Common Criteria)

| ID | Control | Owner | Evidence Location | Status | Test Frequency |
|---|---|---|---|---|---|
| CC1.1 | Information Security Policy | Founder | `docs/security/policies/information-security-policy.md` | Implemented | Annual review |
| CC1.2 | Security roles defined | Founder | `docs/security/policies/information-security-policy.md` §4 | Implemented | Annual review |
| CC6.1 | Logical access — RBAC | Engineering | `backend/internal/middleware/middleware.go:155` (RequirePlatformRole), migration `035_add_platform_roles.up.sql` | Implemented | Per PR review |
| CC6.2 | User provisioning / deprovisioning | Engineering | Onboarding flow (`backend/internal/onboarding/`), DSR erasure (`backend/internal/handler/dsr_handler.go`) | Partial — no offboarding checklist | Quarterly |
| CC6.3 | Multi-factor authentication | Engineering | `backend/internal/auth/totp.go`, `require_mfa.go`, migration `063` | Implemented (opt-in); enforcement gated via env var | Per deployment |
| CC6.6 | Encryption in transit (TLS) | Engineering | TLS config in `backend/cmd/api/main.go`, Cloudflare edge TLS | Implemented | Monthly cert check |
| CC6.7 | Encryption at rest | Engineering | `backend/internal/crypto/envelope.go` (AES-256-GCM), migration `039_platform_settings` | Implemented — KEK rotation procedure documented | Annual rotation |
| CC6.8 | Malicious content screening | Engineering | `frontend/src/lib/upload-screening/screen.ts`, `docs/runbooks/upload-screening-alerts.md` | Implemented | Per upload policy change |
| CC7.1 | Vulnerability management | Engineering | `.github/workflows/production-gates.yml` (govulncheck, semgrep, trivy, gitleaks) | Partial — semgrep/trivy advisory; hardening planned | Per PR |
| CC7.2 | Monitoring and alerting | Engineering | `backend/internal/service/audit_log_service.go`, migration `009_create_audit_log` | Partial — logging exists, structured logging planned | Quarterly |
| CC7.3 | Incident response | Engineering | `docs/runbooks/incident-response.md` | Implemented | Annual tabletop |
| CC7.4 | Security event logging (immutable) | Engineering | migration `009` (trigger-protected audit_log), migration `052` (gallery_access_logs) | Implemented — index added for query performance | Quarterly sample |
| CC8.1 | Change management | Engineering | GitHub PR reviews, `production-gates.yml` CI gates, `docs/runbooks/rolling-deploy.md` | Implemented | Per PR |

## Trust Services Criteria: Availability

| ID | Control | Owner | Evidence Location | Status | Test Frequency |
|---|---|---|---|---|---|
| A1.1 | Capacity planning | Engineering | Not yet documented | Gap | Quarterly |
| A1.2 | Backup and recovery | Engineering | `deploy/scripts/backup-db.sh` (nightly pg_dump → GPG → R2), `docs/runbooks/disaster-recovery-from-r2.md` (RTO 30-60m, RPO ≤24h) | Implemented | Monthly restore test |
| A1.3 | Disaster recovery | Engineering | `docs/runbooks/disaster-recovery-from-r2.md`, `postgres-failover.md`, `valkey-failover.md` | Implemented | Annual DR drill |

## Trust Services Criteria: Confidentiality

| ID | Control | Owner | Evidence Location | Status | Test Frequency |
|---|---|---|---|---|---|
| C1.1 | Data classification | Founder | `docs/security/policies/information-security-policy.md` §6 | Implemented | Annual review |
| C1.2 | Secure disposal | Engineering | DSR erasure handler (`dsr_handler.go`), backup rotation (`backup-db.sh` — 7-day local) | Partial — R2 lifecycle policy needed | Quarterly |

## Trust Services Criteria: Privacy

| ID | Control | Owner | Evidence Location | Status | Test Frequency |
|---|---|---|---|---|---|
| P1 | Notice | Legal/Engineering | `frontend/src/app/privacy/page.tsx`, consent banner | Implemented | Annual review |
| P2 | Consent | Engineering | `backend/internal/service/consent_service.go` (8 granular types), migration `052` | Implemented | Per feature change |
| P3 | Collection limitation | Engineering | Purpose-bound consent with SHA-256 version hash | Implemented | Per feature change |
| P6 | Disclosure to third parties | Legal | Sub-processor register (`docs/security/sub-processors.md`) | Implemented | On vendor change |

## Open Items / Remediation Tracker

| Gap | Target Phase | Target Date |
|---|---|---|
| Incident response playbook | Phase 2 | 2026-04-12 |
| Sub-processor register + DPA template | Phase 2 | 2026-04-12 |
| KEK rotation procedure | Phase 2 | 2026-04-12 |
| Audit log index (query performance) | Phase 3 | 2026-04-12 |
| Structured logging (slog migration) | Phase 4 | 2026-04-13 |
| MFA enforcement for photographers | Phase 5 | 2026-04-13 |
| Semgrep/Trivy blocking in CI | Phase 6 | 2026-04-13 |
| Background check policy | Phase 1 | 2026-04-12 |
| Annual penetration test | External vendor | Q3 2026 |
| Capacity planning documentation | Future | Q3 2026 |
