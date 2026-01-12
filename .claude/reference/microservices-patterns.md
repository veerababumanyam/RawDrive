# Microservices Patterns & Architecture

Best practices for the distributed system architecture of RawDrive.

---

## 1. Inter-Service Communication

### Synchronous (HTTP/REST)
*   **Use Case:** Real-time data requirements (e.g., UI requesting Gallery details).
*   **Protocol:** Internal HTTP over private Docket network.
*   **Service Discovery:** Use Docker/K8s DNS names (`http://billing-service:8000`).
*   **Resilience:** Implement **Retries** (with exponential backoff) and **Timeouts** (fail fast).

### Asynchronous (Event-Driven)
*   **Use Case:** Decoupled actions (Upload -> Process AI -> Notify User).
*   **Broker:** Redis Stream / RabbitMQ.
*   **Pattern:** Fire-and-Forget or Pub/Sub.
*   **Events:** Define robust event schemas (Pydantic models shared via `shared-types`).
    *   `GALLERY_CREATED`
    *   `ASSET_UPLOADED`
    *   `SUBSCRIPTION_UPDATED`

---

## 2. Resilience Patterns

### Circuit Breaker
Prevent cascading failures when a downstream service is down.
*   **Implementation:** `pybreaker` or similar middleware.
*   **State:** Close (Normal) -> Open (Error threshold met, fail immediately) -> Half-Open (Test recovery).

### Idempotency
Ensure retrying an operation doesn't cause side effects (e.g., double billing).
*   **Mechanism:** Clients send `Idempotency-Key` header.
*   **Storage:** Redis stores keys with expiration (24h).

### Rate Limiting
Protect services from internal/external flooding.
*   **Tool:** `slowapi` (Token Bucket algorithm).
*   **Scope:** Per user ID or IP address.

---

## 3. Data Sovereignty & Management

### Database per Service
*   **Principle:** Microservices typically own their data.
*   **Exceptions:** RawDrive shares a physical Postgres cluster for cost efficiency, but logical schemas (`schema="billing"`, `schema="gallery"`) should be respected.
*   **Joins:** no cross-service SQL joins. Fetch IDs and query the other service, or duplicate data (eventual consistency).

### Distributed Tracing
*   **Header:** `Traceparent` / `X-Request-ID`.
*   **Propagation:** Middleware must extract header from incoming request and inject it into outgoing requests.
*   **Visualization:** Jaeger / Tempo.

---

## 4. API Gateway Pattern

**Traefik** acts as the single Facade.
*   **Auth Offloading:** Gateway handles SSL termination.
*   **Routing:** Path-based routing (`/api/v1/galleries` -> `gallery-service`).
*   **Aggregation:** (Optional) If UI needs data from 3 services, consider a "Backend for Frontend" (BFF) or client-side aggregation rather than complex Gateway logic.

---

## 5. Saga Pattern (Transactions)

For distributed transactions (e.g., Delete Workspace = Delete Files + Delete DB Records + Cancel Stripe).
*   **Choreography:** Services emit events (`WORKSPACE_DELETING`), others subscribe and act.
*   **Compensation:** If a step fails, emit `..._FAILED` event to trigger undo operations.
