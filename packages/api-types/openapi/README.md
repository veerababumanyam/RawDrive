# OpenAPI Specifications

This directory contains OpenAPI JSON specifications fetched from RawDrive microservices.

## How to Generate

Run from the repository root:

```bash
pnpm generate:openapi
```

This will:
1. Connect to each running microservice
2. Fetch their `/openapi.json` endpoint
3. Save the spec as `{service-name}.json`

## Prerequisites

Ensure all microservices are running:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

## Generated Files

After running the generator:

```
openapi/
├── backend.json              # Main backend API
├── gallery-service.json      # Gallery service
├── webhooks-service.json     # Webhooks service
├── billing-service.json      # Billing service
├── client-service.json       # Client management
├── notifications-service.json # Notifications
├── invitations-service.json  # Invitations
├── onboarding-service.json   # Onboarding
├── ai-service.json           # AI orchestration
├── ai-processing-service.json # AI processing
├── livesync-service.json     # LiveSync
└── index.ts                  # Re-exports all specs
```

## Notes

- Files are auto-generated - do not edit manually
- Commit these files to version control for CI/CD
- Regenerate after API changes in any microservice
