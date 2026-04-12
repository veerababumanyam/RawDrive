# Personnel Security Policy

**Version:** 1.0
**Effective Date:** 2026-04-12
**Owner:** Manyam Prasad (Founder / Acting CISO)

---

## 1. Purpose

Define the security requirements for personnel with access to RawDrive
production systems and customer data.

## 2. Scope

Applies to:
- Founder / all employees
- Contractors with production infrastructure access
- Third-party developers with repository write access

## 3. Pre-Access Requirements

Before granting production access, the following must be completed:

| Check | Method | Retention |
|---|---|---|
| Identity verification | Government-issued ID (Aadhaar / PAN / Passport) | Copy on file |
| Background verification | Professional reference check (min. 1 prior employer) | Record on file |
| NDA execution | Signed Non-Disclosure Agreement | Original on file |
| Security training | Read and acknowledge Information Security Policy | Signed acknowledgment |

## 4. Access Provisioning

- Production database access: founder only (currently single-operator)
- R2 storage credentials: environment variables, not shared
- GitHub repository: branch protection enforced, PR review required
- Hosting (Hostinger): founder credentials only, MFA enabled

## 5. Access Review

- Quarterly review of all accounts with production access
- Immediate revocation upon role change or departure
- Documented in access review log (spreadsheet or this repo)

## 6. Offboarding Checklist

When a person with production access departs:

- [ ] Revoke GitHub repository access
- [ ] Rotate any shared secrets they had access to
- [ ] Revoke hosting panel access
- [ ] Revoke database credentials
- [ ] Review audit logs for last 30 days of their activity
- [ ] Document completion date

## 7. Current Access Register

| Person | Role | Production Access | Background Check | NDA | Last Review |
|---|---|---|---|---|---|
| Manyam Prasad | Founder | Full (DB, R2, hosting, GitHub) | N/A (founder) | N/A | 2026-04-12 |

*Update this table when any personnel change occurs.*
