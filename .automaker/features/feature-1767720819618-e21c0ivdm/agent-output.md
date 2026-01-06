
🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\infrastructure\\docker\\docker-compose.yml"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\infrastructure\\docker\\traefik\\dynamic.dev.yaml"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\tests\\traefik-routing.spec.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\infrastructure\\docker\\traefik\\traefik.dev.yaml"
}

## Specification: Traefik Configuration Consolidation

### 1. Problem Statement

The current Traefik setup has duplicate routing definitions: Docker labels in `docker-compose.yml` and File Provider in `dynamic.dev.yaml`. This causes confusion, potential routing conflicts, and inconsistent policy enforcement. The File Provider configuration contains richer settings (rate limiting, security headers, CORS) that are missing from Docker labels.

### 2. User Story

As a **DevOps engineer**, I want **all Traefik routing consolidated into a single configuration file (dynamic.dev.yaml)**, so that **there is a single source of truth for routing rules and policies are consistently enforced across all services**.

### 3. Acceptance Criteria

**Happy Path:**
- GIVEN the Traefik stack is running
- WHEN a request is made to `http://localhost/api/health`
- THEN the request is routed to the backend service with proper rate limiting and security headers

**Happy Path - Grafana:**
- GIVEN the Traefik stack is running
- WHEN a request is made to `http://localhost/grafana`
- THEN the request is routed to Grafana with the prefix stripped

**Happy Path - Dashboard:**
- GIVEN the Traefik stack is running
- WHEN a request is made to `http://localhost:8080/dashboard/`
- THEN the Traefik dashboard is accessible

**Edge Case - Microservices:**
- GIVEN the Traefik stack is running
- WHEN requests are made to `/api/v1/invitations`, `/api/v1/galleries`, `/api/v1/onboarding`, `/api/v1/subscription`
- THEN each request is routed to the appropriate microservice

**Error Handling:**
- GIVEN a service is not running
- WHEN a request is made to that service's path
- THEN Traefik returns a 502/503 error (not a misconfiguration error)

### 4. Technical Context

| Aspect | Value |
|--------|-------|
| Affected Files | `infrastructure/docker/docker-compose.yml`, `infrastructure/docker/traefik/dynamic.dev.yaml` |
| Dependencies | Traefik v3.0, Docker, existing services must maintain same container names |
| Constraints | Services must use stable Docker DNS names; no changes to service ports |
| Patterns to Follow | File Provider configuration (existing in `dynamic.dev.yaml`); router priority ordering |

### 5. Non-Goals

- Changes to production Traefik configuration (`traefik.yaml`, `dynamic.yaml`)
- Modifying service ports or container names
- Adding new routes or services
- Changes to TLS/certificate configuration
- Changing the `traefik.dev.yaml` static configuration

### 6. Implementation Tasks

```tasks
## Phase 1: Remove Docker Labels from docker-compose.yml

- [ ] T001: Remove Traefik labels from traefik service (keep only dashboard router) | File: infrastructure/docker/docker-compose.yml
- [ ] T002: Remove Traefik labels from grafana service | File: infrastructure/docker/docker-compose.yml
- [ ] T003: Remove Traefik labels from backend service | File: infrastructure/docker/docker-compose.yml
- [ ] T004: Remove Traefik labels from invitations-api service | File: infrastructure/docker/docker-compose.yml
- [ ] T005: Remove Traefik labels from onboarding-service service | File: infrastructure/docker/docker-compose.yml
- [ ] T006: Remove Traefik labels from gallery-service service | File: infrastructure/docker/docker-compose.yml
- [ ] T007: Remove Traefik labels from billing-service service | File: infrastructure/docker/docker-compose.yml

## Phase 2: Update dynamic.dev.yaml (Verify Completeness)

- [ ] T008: Verify Traefik dashboard router exists in dynamic.dev.yaml | File: infrastructure/docker/traefik/dynamic.dev.yaml

## Phase 3: Verification

- [ ] T009: Run Playwright tests to verify routing works | File: tests/traefik-routing.spec.ts
```

### 7. Success Metrics

| Metric | Target |
|--------|--------|
| Docker labels in docker-compose.yml | Zero `traefik.http.routers.*` or `traefik.http.services.*` labels (except Traefik dashboard) |
| All routes defined in dynamic.dev.yaml | 100% of services have corresponding routers |
| Playwright tests pass | All routing tests succeed |
| No duplicate router definitions | No warnings in Traefik logs about duplicate routers |

### 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Service discovery fails after label removal | File Provider defines services by container name (Docker DNS); verify container names match |
| Middleware definitions lost | dynamic.dev.yaml already contains all required middlewares; no migration needed |
| Traefik service itself needs labels for dashboard | Keep traefik.enable=true and dashboard labels on traefik service only |

[SPEC_GENERATED] Please review the comprehensive specification above. Reply with 'approved' to proceed or provide feedback for revisions.