# Incident Response Playbook

**Version:** 1.0
**Effective Date:** 2026-04-12
**Owner:** Engineering Lead
**Review Cadence:** Quarterly (next: 2026-07-12)

---

## 1. Severity Classification

| Severity | Definition | Response SLA | Example |
|---|---|---|---|
| P1 — Critical | Customer data breach, service fully down, credential compromise | 30 min response, 72h notification | Database leak, R2 credentials exposed |
| P2 — High | Partial service degradation, potential data exposure, auth bypass | 2 hour response | API returning other tenant's data, MFA bypass |
| P3 — Medium | Non-critical vulnerability, performance degradation | 24 hour response | XSS in non-auth page, slow query affecting UX |
| P4 — Low | Cosmetic issue, minor config drift | Next business day | CSP header missing on one route |

## 2. Detection Sources

- **Immutable audit log:** `audit_log` table (migration 009) — trigger-protected against modification
- **CI pipeline:** gitleaks (blocking), semgrep, trivy, govulncheck
- **External reports:** security@rawdrive.in (per SECURITY.md)
- **Monitoring:** Application logs, R2 access logs, hosting provider alerts

## 3. Response Procedure

### Step 1: Contain (0-30 minutes)

1. **Assess severity** using the classification table above
2. **Preserve evidence** — do NOT delete logs, rotate credentials, or deploy fixes yet
3. **Isolate** if needed:
   - Database compromise → revoke connection strings, enable maintenance mode
   - R2 credential leak → rotate keys via Cloudflare dashboard
   - Auth bypass → deploy RequireMFA on affected routes or enable maintenance mode

### Step 2: Investigate (30 min - 4 hours)

1. Query the audit log for the affected time window:
   ```sql
   SELECT * FROM audit_log
   WHERE created_at BETWEEN '[start]' AND '[end]'
   AND (resource_type = '[affected_type]' OR actor_id = '[suspect_id]')
   ORDER BY created_at;
   ```
2. Review application logs for the same period
3. Check `gallery_access_logs` if gallery data was accessed (migration 052)
4. Document findings in a new file: `docs/incidents/YYYY-MM-DD-summary.md`

### Step 3: Remediate (4-48 hours)

1. Deploy the fix via normal PR → review → merge → rolling deploy process
2. If emergency: use `docs/runbooks/disaster-recovery-from-r2.md` procedures
3. Rotate any compromised credentials
4. Verify fix with targeted test

### Step 4: Notify (within 72 hours for P1/P2)

**DPDPA 2023 / GDPR requirement:** Notify within 72 hours of confirmed breach.

| Audience | Method | Template |
|---|---|---|
| Data Protection Board of India | Formal notification | Per DPDPA Section 8 format |
| Affected users | Email via platform | "We detected unauthorized access to [scope]. We have [remediation]. Your [specific data] was/was not accessed." |
| Supervisory authority (GDPR) | If EU data subjects affected | Per GDPR Article 33 format |

### Step 5: Post-Incident Review (within 7 days)

1. Create incident report: `docs/incidents/YYYY-MM-DD-[slug]-postmortem.md`
2. Document: timeline, root cause, impact scope, remediation, prevention measures
3. Update SOC2 control matrix if a control gap was discovered
4. Schedule any follow-up tasks as GitHub issues

## 4. Communication

- **Internal:** Direct message / call to founder for P1/P2
- **External (P1 only):** security@rawdrive.in auto-response updated with status page link
- **No public disclosure** until investigation complete and remediation deployed

## 5. Evidence Preservation

For SOC2 audit evidence:
- All incident reports stored in `docs/incidents/` (git-versioned, immutable history)
- Audit log entries preserved per retention policy (1 year minimum)
- Screenshots of dashboards/alerts captured in incident report
