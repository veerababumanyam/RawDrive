# Webhook Integration Best Practices (Webhooks Service)

A guide for the `webhooks-service` which delivers events to *external customers* (Developer API).

---

## 1. Architecture

### Outbox Pattern
Don't send HTTP requests inside your database transaction.
1.  **Main Transaction:** Write business data + Write "Event" to `outbox` table (or emit to Kafka/Redis).
2.  **Publisher:** Background worker reads `outbox`/Queue.
3.  **Delivery Worker:** Sends HTTP POST to customer endpoint.

---

## 2. Delivery Reliability

### Retries (Exponential Backoff)
External endpoints will fail.
*   **Algorithm:** `Interval * (Multiplier ^ Attempt)`
*   Example: 1s, 2s, 4s, 8s, 16s... up to Max Limit (e.g., 24h).
*   **Jitter:** Add random jitter to prevent "Thundering Herd" on their server.

### Timeouts
*   Enforce strict timeouts (e.g., 5s connection, 10s read).
*   Don't let a slow customer endpoint clog your delivery workers.

### Dead Letter Queue (DLQ)
*   After Max Retries, move event to DLQ.
*   Notify customer: "Your endpoint is failing. Webhooks paused."

---

## 3. Security (For the Receiver)

### Payload Signing
Allow customers to trust the payload.
*   **Header:** `X-RawDrive-Signature`
*   **Algorithm:** `HMAC-SHA256(secret, payload_body)`
*   **Secret:** Unique per workspace, visible in Developer Settings.

### Replay Attacks
*   Include `timestamp` in the signature or payload.
*   Advise customers to reject timestamps older than 5 mins.

---

## 4. Payload Design

### Thin vs Fat Payloads
*   **Thin (Notification):** `{"id": "evt_123", "resource_id": "gal_456", "type": "gallery.created"}`. Receiver must callback API to get details. (More secure, less stale data).
*   **Fat (Snapshot):** Includes the full resource data. (Easier for dev, but privacy risk if data changes/permissions revoked).
*   **Recommendation:** Use **Thin** payloads or Hybrid (minimal immutable summary).

### Schema Versioning
*   Webhooks are an API. Changes break integration.
*   Include `api_version` in the payload.

---

## 5. Testing
*   **Webhook Testers:** Provide a "Send Test Event" button in the Admin UI.
*   **localdev:** Provide instructions for customers to use tools like `ngrok` or `localtunnel` to receive webhooks during dev.
