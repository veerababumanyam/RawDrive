# Redis Best Practices (Caching & Queues)

Guide for using Redis effectively in the RawDrive stack for caching, sessions, and background jobs.

---

## 1. Data Structures & Usage

### Key Naming Convention
Use colon-separated, hierarchical keys.
*   Format: `service:entity:id:attribute`
*   Example: `gallery:session:xyz123`, `ai:job:9876:status`

### Namespaces
Use logical DB separation or strict prefixes to prevent collisions.
*   **DB 0:** Caching
*   **DB 1:** Celery/BullMQ (Job Queue)
*   **DB 2:** Rate Limiting
*   **DB 3:** Pub/Sub (Websockets)

---

## 2. Caching Strategy

### TTL (Time To Live)
**Always** set an expiration.
*   **User Sessions:** 24h (sliding).
*   **API Responses:** 1-5 mins.
*   **Metadata:** 1h.

### Cache Stampede Prevention
*   **Jitter:** Add random variance to TTL (e.g., 300s ± 15s) to prevent simultaneous expiration.
*   **Locking:** Use `redlock` for "Get or Compute" blocks if computation is very expensive.

### Serialization
*   **JSON:** Good for debug, slower.
*   **MsgPack:** Faster, smaller.
*   **Protobuf:** Best for typed strict schemas.

---

## 3. Message Queues (BullMQ / Celery)

### Job Durability
*   **Persistence:** Ensure AOF (Append Only File) is enabled in Redis config (`appendonly yes`).
*   **Retry:** Configure exponential backoff for failed jobs (AI services often 429).
    ```python
    retry_backoff=True, max_retries=3
    ```

### Priority Queues
*   **High:** Transactional emails, Thumbnail generation.
*   **Low:** Batch AI re-indexing, Analytics aggregation.

### Clean up
*   Completed jobs occupy RAM. Configure Queue processor to remove successful jobs immediately or after short retention.

---

## 4. Rate Limiting

Use **Lua Scripts** or libraries (`fastapi-limiter`) to ensure atomic counting.

*   **Fixed Window:** Simple, but bursty at window edges.
*   **Sliding Window Log:** Precise, memory heavy.
*   **Token Bucket:** Best balance.

---

## 5. Deployment & Ops

### Memory Management
*   **`maxmemory`:** Set a limit (e.g., 75% of RAM).
*   **Eviction Policy:**
    *   `allkeys-lru`: For pure cache instances.
    *   `volatile-lru`: Keep persistent keys, evict expired ones.
    *   `noeviction`: For Queues (Crash if full, don't lose jobs).

### High Availability
*   **Sentinel:** Automatic failover.
*   **Cluster:** Needed only if data exceeds single node RAM (e.g., > 64GB).

### Security
*   **Password:** Require `requirepass`.
*   **VPC:** Never expose Redis port 6379 to the public internet.
*   **Rename Commands:** Disable `FLUSHDB`, `FLUSHALL` in production config.
