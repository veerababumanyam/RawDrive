---
phase: 02-email-infrastructure
plan: 01
subsystem: infra
tags: [postal, email, docker, mariadb, rabbitmq, smtp, dns, spf, dkim, dmarc]

requires:
  - phase: none
    provides: standalone infrastructure plan
provides:
  - Postal mail server docker-compose stack (postal + mariadb + rabbitmq)
  - Postal configuration file (postal.yml)
  - Backend settings for Postal API integration
  - DNS setup documentation for email deliverability
affects: [02-email-infrastructure, email-service, notifications]

tech-stack:
  added: [postal-v3, mariadb-10.11, rabbitmq-3.12]
  patterns: [self-hosted-mail-server, docker-compose-service-dependencies]

key-files:
  created:
    - infrastructure/docker/postal/postal.yml
    - docs/email-dns-setup.md
  modified:
    - infrastructure/docker/docker-compose.yml
    - backend/src/app/config/settings.py

key-decisions:
  - "Used Postal v3 (ghcr.io/postalserver/postal:3) as self-hosted transactional email server"
  - "MariaDB for Postal DB (required by Postal, separate from main PostgreSQL)"
  - "RabbitMQ for Postal message queue (internal only, no host ports exposed)"
  - "Postal web UI bound to 127.0.0.1 only for security"

patterns-established:
  - "Postal stack pattern: postal depends_on mariadb+rabbitmq with service_healthy conditions"
  - "DNS documentation pattern: step-by-step with per-provider port 25 guidance"

requirements-completed: [MAIL-01, MAIL-02]

duration: 2min
completed: 2026-03-18
---

# Phase 02 Plan 01: Postal Mail Server Deployment Summary

**Postal v3 mail server stack (MariaDB + RabbitMQ) in docker-compose with backend config fields and DNS deliverability guide**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T20:28:15Z
- **Completed:** 2026-03-18T20:30:13Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Postal, MariaDB, and RabbitMQ containers added to docker-compose with healthchecks and proper depends_on ordering
- Postal configuration file created with DB, RabbitMQ, and DNS settings pointing to container service names
- Backend settings.py extended with POSTAL_API_URL, POSTAL_API_KEY, POSTAL_FROM_EMAIL, POSTAL_FROM_NAME, POSTAL_WEBHOOK_SECRET
- Comprehensive DNS setup guide covering SPF, DKIM, DMARC, MX, PTR records plus cloud provider port 25 requirements

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Postal, MariaDB, and RabbitMQ containers to docker-compose** - `efcc53eb` (feat)
2. **Task 2: Add Postal settings to backend config and create DNS setup guide** - `05702926` (feat)

## Files Created/Modified

- `infrastructure/docker/docker-compose.yml` - Added postal, postal-mariadb, postal-rabbitmq services and volumes
- `infrastructure/docker/postal/postal.yml` - Postal server configuration (DB, RabbitMQ, DNS settings)
- `backend/src/app/config/settings.py` - Added Postal config fields and sensitive field entries
- `docs/email-dns-setup.md` - DNS setup guide with SPF/DKIM/DMARC/MX/PTR instructions and cloud provider port 25 docs

## Decisions Made

- Used Postal v3 official image from ghcr.io (latest stable)
- MariaDB 10.11 as required by Postal (not PostgreSQL)
- RabbitMQ 3.12-management-alpine for lightweight queue with management UI available internally
- Postal web UI bound to 127.0.0.1 only (no external exposure)
- No port 25 exposed to host yet (SMTP internal only until production deployment)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. DNS records documented in `docs/email-dns-setup.md` will need to be configured when deploying to production.

## Next Phase Readiness

- Postal container stack is defined and ready to start
- Backend has config fields ready for Plan 02 (email service provider integration)
- DNS setup guide is available for early propagation setup
- After first deploy, `docker exec rawdrive-postal postal initialize` must be run once

---
*Phase: 02-email-infrastructure*
*Completed: 2026-03-18*

## Self-Check: PASSED

- All 4 files verified present on disk
- Both task commits (efcc53eb, 05702926) verified in git log
