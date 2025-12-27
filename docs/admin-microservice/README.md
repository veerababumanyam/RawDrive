# Admin Microservice Documentation

This folder contains documentation for the RawDrive Admin Microservice - a dedicated service for platform administration functionality.

## Overview

The Admin Microservice is designed to handle all platform administration activities, separated from the main backend to provide:
- Better security isolation for sensitive admin operations
- Independent scaling and deployment
- Clear domain boundaries for admin functionality
- Dedicated audit logging and compliance features

## Documentation Index

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | High-level architecture, service boundaries, and communication patterns |
| [API_REFERENCE.md](API_REFERENCE.md) | Admin API endpoints and schemas (planned) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker, Kubernetes, and configuration guide (planned) |
| [SECURITY.md](SECURITY.md) | Security model, authentication, and authorization details (planned) |
| [FEATURE_FLAGS.md](FEATURE_FLAGS.md) | Feature flag system design and usage (planned) |
| [AUDIT_LOGGING.md](AUDIT_LOGGING.md) | Audit log schema, retention, and compliance reporting (planned) |

## Related Resources

- **Feature Specification**: [specs/001-admin-microservice/spec.md](../../specs/001-admin-microservice/spec.md)
- **Admin Feature Requirements**: [docs/Features/ADMIN_AND_PLATFORM_MANAGEMENT.md](../Features/ADMIN_AND_PLATFORM_MANAGEMENT.md)
- **Architecture Quick Reference**: [docs/ARCHITECTURE_QUICK_REFERENCE.md](../ARCHITECTURE_QUICK_REFERENCE.md)

## Service Domains

The Admin Microservice owns these functional domains:

1. **Platform Admin Management** - Admin identity, roles, permissions, invites
2. **Support Access** - Time-boxed, audited workspace access for customer support
3. **Subscription & Billing** - Admin view and modifications (MRR, refunds, credits)
4. **System Monitoring** - Health metrics, performance dashboards, alerting
5. **Analytics** - Usage, revenue, and feature adoption metrics
6. **Content Moderation** - Flagged content queue and enforcement actions
7. **Audit Logging** - Immutable action logs and compliance reporting
8. **Feature Flags** - Rollout control, A/B testing, targeting
9. **Platform Configuration** - Settings for AI, email, payments, and platform behavior

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| Specification | Complete | Feature spec created and validated |
| Planning | Not Started | Implementation tasks and architecture design |
| Development | Not Started | Microservice implementation |
| Testing | Not Started | Integration and security testing |
| Deployment | Not Started | Production rollout |

## Quick Links

- Feature Branch: `001-admin-microservice`
- Main Backend: [backend/src/app/api/v1/admin.py](../../backend/src/app/api/v1/admin.py) (current implementation)
- Docker Compose: [infrastructure/docker/docker-compose.yml](../../infrastructure/docker/docker-compose.yml)

---

**Last Updated**: 2025-12-27
