# Traefik & Infrastructure Best Practices

Configuration guide for RawDrive's Reverse Proxy and Edge Infrastructure.

---

## 1. Traefik Configuration

### EntryPoints
*   `web` (Port 80): SHOULD strictly redirect to `websecure`.
*   `websecure` (Port 443): The only traffic ingress.
*   `metrics` (Port 8082): Protected internal endpoint for Prometheus scraping.

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"
```

### Static vs Dynamic Configuration
*   **Static (`traefik.yml`):** Startup settings (EntryPoints, Providers, Logs).
*   **Dynamic (`dynamic.yml` or Docker Labels):** Routers, Middlewares, Services.

### Middlewares (The "Chain")
Apply a standard security chain to ALL routers.
1.  **RateLimit:** Protect against DDoS.
2.  **Compress:** Gzip/Brotli for speed.
3.  **SecureHeaders:** HSTS, X-Frame-Options.

```yaml
http:
  middlewares:
    sec-headers:
      headers:
        stsSeconds: 31536000
        contentTypeNosniff: true
        frameDeny: true
    rate-limit:
      rateLimit:
        average: 100
        burst: 50
```

---

## 2. Routing Strategies

### PathPrefix
Standard routing for microservices.
*   `gallery-service`: `PathPrefix(/api/v1/galleries)`
*   `auth-service`: `PathPrefix(/api/v1/auth)`

### StripPrefix
**Avoid Use.** It confuses the backend about the real URL. Configure services to serve from their root or handle the prefix internally (`root_path` in FastAPI).

### Domain Routing (Custom Domains)
For Enterprise White-labeling:
*   Rule: `Host(client-domain.com)`
*   Requires: CNAME record checks and dynamic TLS (Let's Encrypt On-Demand or wildcard certs).

---

## 3. SSL/TLS

### Let's Encrypt (ACME)
*   **HTTP Challenge:** Easiest for single instance.
*   **DNS Challenge:** Required for Wildcards (`*.rawdrive.com`).
*   **Storage:** Persist `acme.json` in a Docker volume!

```yaml
certificatesResolvers:
  myresolver:
    acme:
      email: admin@rawdrive.com
      storage: acme.json
      httpChallenge:
        entryPoint: web
```

---

## 4. Observability

### Access Logs
*   Enable JSON format.
*   Fields: `ClientHost`, `RequestPath`, `RequestMethod`, `OriginStatus`, `Duration`.

### Metrics
Enable Prometheus metrics in Traefik to track:
*   Entrypoint connections.
*   Router latency.
*   Service health status.

---

## 5. Deployment Checklist

1.  [ ] **Dashboard:** Disable in production or protect with BasicAuth middleware.
2.  [ ] **Log Level:** Set to `INFO` or `WARN` (DEBUG leaks headers).
3.  [ ] **API:** Enable `api.insecure=true` ONLY in dev.
4.  [ ] **Tracing:** Integrate with Jaeger/zipkin if debugging distributed latency.
