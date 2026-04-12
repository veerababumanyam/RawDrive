# Sub-Processor Register

**Version:** 1.0
**Last Updated:** 2026-04-12
**Owner:** Manyam Prasad (Founder)
**Review Cadence:** On any vendor change, minimum quarterly

---

## Current Sub-Processors

| Vendor | Service | Data Processed | Data Location | DPA Status | Last Reviewed |
|---|---|---|---|---|---|
| Cloudflare (R2) | Object storage (photos, derivatives) | Customer photographs, WebP derivatives | Configurable (default: auto) | Cloudflare DPA v3.0 | 2026-04-12 |
| Hostinger | VPS hosting (API, frontend) | All application data in transit | Lithuania / configured region | Hostinger DPA | 2026-04-12 |
| GitHub | Source code hosting, CI/CD | Source code (no customer data) | USA | GitHub DPA | 2026-04-12 |
| Mailpit (dev) / SMTP provider (prod) | Transactional email | Email addresses, OTP codes | Provider-dependent | Pending | — |

## Change Log

| Date | Change | Approved By |
|---|---|---|
| 2026-04-12 | Initial register created | Manyam Prasad |

## Process for Adding a Sub-Processor

1. Document the vendor, service, and data processed in this register
2. Execute a DPA (see template below) or confirm vendor's standard DPA
3. Verify vendor's security posture (SOC2 report, ISO 27001, or equivalent)
4. Update the Information Security Policy if the data flow changes materially
5. Commit this file with the change
