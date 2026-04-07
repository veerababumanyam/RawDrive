# Hostinger VPS Details
# =====================
Login: RawDrive@25051979#

# RawDrive Admins
  ┌─────────────┬────────────────────────┬─────────────┬────────────────┬────────────────────┐
  │    User     │         Email          │    Role     │     State      │      Password      │
  ├─────────────┼────────────────────────┼─────────────┼────────────────┼────────────────────┤
  │ Super Admin │ superadmin@rawdrive.in │ super_admin │ TS (Telangana) │ RawDrive@25051979# │
  ├─────────────┼────────────────────────┼─────────────┼────────────────┼────────────────────┤
  │ Admin       │ admin@rawdrive.in      │ admin       │ TS (Telangana) │ RawDrive@25051979# │
  ├─────────────┼────────────────────────┼─────────────┼────────────────┼────────────────────┤
  │ Dealer      │ dealer@rawdrive.in     │ dealer      │ TS (Telangana) │ RawDrive@25051979# │
  ├─────────────┼────────────────────────┼─────────────┼────────────────┼────────────────────┤
  │ Photographer│ photographer@rawdrive.in│ photographer│ TS (Telangana) │ RawDrive@25051979# │
  ├─────────────┼────────────────────────┼─────────────┼────────────────┼────────────────────┤
  │ Test Flow   │ testflow@rawdrive.in   │ photographer│ TS (Telangana) │ RawDrive@25051979# │
  ├─────────────┼────────────────────────┼─────────────┼────────────────┼────────────────────┤
  │ Demo        │ demo@rawdrive.in       │ photographer│ AP (Andhra)    │ RawDrive@25051979# │
  └─────────────┴────────────────────────┴─────────────┴────────────────┴────────────────────┘


## Infrastructure Overview

| Provider | Role | Details |
|----------|------|---------|
| **GoDaddy** | Domain registrar ONLY | rawdrive.in — DNS managed by Cloudflare |
| **Cloudflare** | DNS + CDN + DDoS protection | Proxied DNS (orange cloud), edge caching, WAF |
| **Hostinger** | Full production servers (3x VPS) | App nodes + Database node |
| **Cloudflare R2** | Object storage | Photo/video uploads |
| **Cloudflare Stream** | Video streaming | Live stream + VOD |

## Server Inventory

| Role | IP | Hostname | OS | RAM | CPU | Disk |
|------|-----|----------|-----|-----|-----|------|
| App Node 1 | 187.127.142.42 | rawdrive-app1 | Ubuntu 24.04 LTS | 8 GB | 2 vCPU | 96 GB |
| App Node 2 | 187.127.142.44 | rawdrive-app2 | Ubuntu 24.04 LTS | 8 GB | 2 vCPU | 96 GB |
| Database   | 187.127.142.46 | rawdrive-db   | Ubuntu 24.04 LTS | 8 GB | 2 vCPU | 96 GB |

## SSH Access

```bash
ssh -i ~/.ssh/id_ed25519 root@187.127.142.42   # App Node 1
ssh -i ~/.ssh/id_ed25519 root@187.127.142.44   # App Node 2
ssh -i ~/.ssh/id_ed25519 root@187.127.142.46   # Database
```

SSH Key Pair: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOjphO/PIYJ+qC/1yPRkq8713mr/AfpMhVgbeZH1HvxQ sanjay@DESKTOP-37V4FOO
email: livestudio649@gmail.com
SSH Key Path: ~/.ssh/id_ed25519
Root Password Auth: Disabled (key-only)

## MoonShot API
`sk-BXTO23rB3IngP16w0TLM4DgKsB08xZmlbmWbhwuYd0ThrE4F`

## Architecture

```
                         Internet
                            |
                      +-----------+
                      | GoDaddy   |
                      | (Domain   |
                      |  only)    |
                      +-----+-----+
                            | NS records point to Cloudflare
                      +-----+-----+
                      | Cloudflare |
                      | DNS + CDN  |
                      | WAF + Edge |
                      +-----+-----+
                            |
              Proxied A records (orange cloud)
                            |
                    +-------+-------+
                    |               |
                 VPS 1            VPS 2
              (App Node 1)    (App Node 2)
              Nginx:80/443    Nginx:80/443
              Let's Encrypt   Let's Encrypt
              Backend:8080    Backend:8080
              Frontend:3000   Frontend:3000
              NATS:4222       NATS:4222
                    |    HA failover    |
                    +<=======>==========>+
                    |               |
                    +-------+-------+
                            |
                         VPS 3
                      (Database)
                   PostgreSQL:5432
                      Valkey:6379
```

## DNS — Cloudflare (managed)

**Domain registrar:** GoDaddy (domain purchase + NS delegation only)
**DNS provider:** Cloudflare (all DNS records managed here)

GoDaddy NS records point to Cloudflare nameservers. All A/CNAME records are in Cloudflare.

| Type | Name | Value | Proxy | TTL |
|------|------|-------|-------|-----|
| A | @ | 187.127.142.42 | Proxied (orange) | Auto |
| A | @ | 187.127.142.44 | Proxied (orange) | Auto |
| A | api | 187.127.142.42 | Proxied (orange) | Auto |
| A | api | 187.127.142.44 | Proxied (orange) | Auto |
| A | www | 187.127.142.42 | Proxied (orange) | Auto |
| A | www | 187.127.142.44 | Proxied (orange) | Auto |

### Cloudflare Settings

| Setting | Value | Notes |
|---------|-------|-------|
| SSL/TLS mode | Full (Strict) | Cloudflare ↔ origin uses Let's Encrypt cert |
| Always Use HTTPS | ON | |
| Minimum TLS | 1.2 | |
| Auto Minify | JS, CSS, HTML | |
| Brotli | ON | |
| Browser Cache TTL | Respect Existing Headers | Nginx sets cache headers |
| Edge Cache TTL | 2h for static, bypass for API | Via page rules |

### Cloudflare Page Rules / Cache Rules

| Rule | Match | Action |
|------|-------|--------|
| API bypass | `api.rawdrive.in/*` | Cache Level: Bypass |
| Static cache | `rawdrive.in/_next/static/*` | Cache Level: Cache Everything, Edge TTL: 1 month |
| www redirect | `www.rawdrive.in/*` | Forwarding URL 301 → `https://rawdrive.in/$1` |

## SSL Certificates (Let's Encrypt — on origin servers)

| Detail | Value |
|--------|-------|
| Provider | Let's Encrypt (origin) + Cloudflare edge cert (automatic) |
| Domains | rawdrive.in, www.rawdrive.in, api.rawdrive.in |
| Cert path | /etc/letsencrypt/live/rawdrive.in/fullchain.pem |
| Key path | /etc/letsencrypt/live/rawdrive.in/privkey.pem |
| Expiry | 2026-06-30 (auto-renews) |
| Renewal cron | Twice daily at 03:00 and 15:00 IST |
| Renewal script | /opt/rawdrive/renew-ssl.sh |
| Renewal log | /var/log/certbot-renew.log |
| ACME webroot | /var/www/certbot |

To renew/expand cert:
```bash
ssh root@187.127.142.42 'certbot certonly --webroot --webroot-path=/var/www/certbot --email support@rawdrive.in --agree-tos --no-eff-email --force-renewal -d rawdrive.in -d www.rawdrive.in -d api.rawdrive.in && docker exec deploy-nginx-1 nginx -s reload'
```
Then copy to VPS 2:
```bash
ssh root@187.127.142.42 'tar -cf - /etc/letsencrypt' | ssh root@187.127.142.44 'tar -xf - -C /' && ssh root@187.127.142.44 'docker exec deploy-nginx-1 nginx -s reload'
```

## Services Per Server

### VPS 1 & VPS 2 (App Nodes)
| Service | Container | Port | Image |
|---------|-----------|------|-------|
| Nginx | deploy-nginx-1 | 80, 443 (public) | nginx:1.27-alpine |
| Go Backend | deploy-backend-1 | 8080 (internal) | deploy-backend (custom) |
| Next.js Frontend | deploy-frontend-1 | 3000 (internal) | deploy-frontend (custom) |
| NATS JetStream | deploy-nats-1 | 4222, 8222 (internal) | nats:2.11-alpine |

### VPS 3 (Database)
| Service | Container | Port | Image |
|---------|-----------|------|-------|
| PostgreSQL 17 + pgvector | deploy-postgres-1 | 5432 | pgvector/pgvector:pg17 |
| Valkey 9 | deploy-valkey-1 | 6379 | valkey/valkey:9.0-alpine |

## Database Credentials

```
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=8885c2f007fa03e815fcbc62b76a26a6a484cedb1b750f21
POSTGRES_DB=rawdrive

VALKEY_PASSWORD=d74f374dab6c3e497ec2735313d2d2ffa903be9fad447790
```

Connection strings (from App nodes):
```
DATABASE_URL=postgresql://rawdrive:8885c2f007fa03e815fcbc62b76a26a6a484cedb1b750f21@187.127.142.46:5432/rawdrive?sslmode=disable
VALKEY_URL=redis://:d74f374dab6c3e497ec2735313d2d2ffa903be9fad447790@187.127.142.46:6379
```

## Email (SMTP — Hostinger)

| Setting | Value |
|---------|-------|
| Host | smtp.hostinger.com |
| Port | 465 (implicit TLS / SMTPS) |
| Username | noreply@rawdrive.de |
| Password | Prasad@1979@ |
| From | RawDrive \<noreply@rawdrive.de\> |
| IMAP | imap.hostinger.com:993 |
| POP | pop.hostinger.com:995 |

Used for: password reset codes, email OTP verification, transactional emails.

## Firewall Rules (UFW)

### All Servers
- Port 22/tcp: SSH (open)

### App Nodes (VPS 1 & VPS 2)
- Port 80/tcp: HTTP (Let's Encrypt ACME + redirect to HTTPS)
- Port 443/tcp: HTTPS (production traffic)

### Database (VPS 3)
- Port 5432/tcp: PostgreSQL (only from 187.127.142.42 and 187.127.142.44)
- Port 6379/tcp: Valkey (only from 187.127.142.42 and 187.127.142.44)

## High Availability

Both app nodes are configured for cross-node failover:

- Each nginx uses local containers as PRIMARY upstream, peer node as BACKUP
- `PEER_NODE_IP` set in each server's `.env` AND `deploy/.env` (Node 1 → 187.127.142.44, Node 2 → 187.127.142.42)
- Docker Compose reads `PEER_NODE_IP` from `deploy/.env` for variable substitution in the nginx service
- Nginx template (`deploy/nginx/templates/rawdrive.conf.template`) resolves `${PEER_NODE_IP}` at container start via envsubst
- `proxy_next_upstream` retries failed requests on the backup server
- `resolver 127.0.0.11` enables Docker DNS for dynamic upstream resolution
- Rolling deploy: Node 1 deploys while Node 2 serves, then swap (zero downtime)
- Health endpoints: `/api/v1/health` (liveness), `/api/v1/health/ready` (readiness with DB+Valkey check)
- Deploy script: `deploy/scripts/deploy-app.sh` (aborts if peer unhealthy)

### Ports open between app nodes (peer-only, not public)
- 8080/tcp: Backend failover
- 3000/tcp: Frontend failover
- 4222/tcp: NATS client connections
- 8222/tcp: NATS monitoring

## Nginx Features

- Rate limiting: 100 req/s for API, 30 req/min for auth endpoints
- Gzip compression for text/css/js/json/svg/woff2
- HTTP/2 enabled
- HTTP → HTTPS redirect (port 80 returns 301)
- HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `COOP: unsafe-none`, `COEP: unsafe-none`
- WebSocket support for streaming
- Upstream keepalive connections (32 for backend, 16 for frontend)
- www.rawdrive.in redirects to rawdrive.in
- /api/* on rawdrive.in proxies to backend (same as api.rawdrive.in)
- /_next/static/ has 1-year immutable cache

## File Paths on Servers

| Path | Purpose |
|------|---------|
| /opt/rawdrive/app/ | Application root |
| /opt/rawdrive/app/.env | Production environment variables (backend/frontend env_file) |
| /opt/rawdrive/app/deploy/.env | Deploy-time variables (PEER_NODE_IP, GOOGLE_CLIENT_ID) — NOT overwritten by tar push |
| /opt/rawdrive/app/deploy/ | Docker Compose files, Nginx config |
| /opt/rawdrive/backups/ | Database backups (VPS 3 only) |
| /etc/letsencrypt/ | SSL certificates (App VPS only) |
| /var/www/certbot/ | ACME challenge webroot (App VPS only) |
| /opt/rawdrive/renew-ssl.sh | Cert renewal script (App VPS only) |
| /opt/rawdrive/backup-db.sh | DB backup script (VPS 3 only) |

## Docker Compose Files

| File | Server | Usage |
|------|--------|-------|
| deploy/docker-compose.prod-db.yml | VPS 3 | PostgreSQL + Valkey |
| deploy/docker-compose.prod-app.yml | VPS 1 & 2 | Backend + Frontend + Nginx + NATS |

## Common Operations

### Check service status
```bash
# App nodes
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml ps'

# Database
ssh root@187.127.142.46 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-db.yml ps'
```

### View logs
```bash
# Backend logs
ssh root@187.127.142.42 'docker logs deploy-backend-1 --tail 50'

# Frontend logs
ssh root@187.127.142.42 'docker logs deploy-frontend-1 --tail 50'

# Nginx access/error logs
ssh root@187.127.142.42 'docker logs deploy-nginx-1 --tail 50'

# PostgreSQL logs
ssh root@187.127.142.46 'docker logs deploy-postgres-1 --tail 50'
```

### Restart services
```bash
# Restart all app services on a node
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml restart'

# Restart only backend
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml restart backend'

# Restart database
ssh root@187.127.142.46 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-db.yml restart'
```

### Deploy new code (from local Windows machine)
```bash
# Push code to a server (exclude deploy/.env to preserve PEER_NODE_IP)
cd C:\Users\sanjay\Desktop\RD
tar --exclude='node_modules' --exclude='.git' --exclude='.next' --exclude='__pycache__' --exclude='deploy/.env' -cf - . | ssh -i ~/.ssh/id_ed25519 root@<IP> 'tar -xf - -C /opt/rawdrive/app'

# Rebuild and restart on app node
ssh root@<IP> 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build --no-cache && docker compose -f docker-compose.prod-app.yml up -d'
```

### Rolling deploy to both nodes
```bash
# Node 1 first
ssh root@187.127.142.42 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build --no-cache && docker compose -f docker-compose.prod-app.yml up -d'
# Verify Node 1 healthy, then Node 2
ssh root@187.127.142.44 'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build --no-cache && docker compose -f docker-compose.prod-app.yml up -d'
```

### Manual database backup
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 pg_dump -U rawdrive -d rawdrive --format=custom --compress=9 > /opt/rawdrive/backups/rawdrive_manual_$(date +%Y%m%d).dump'
```

### Restore database from backup
```bash
ssh root@187.127.142.46 'docker exec -i deploy-postgres-1 pg_restore -U rawdrive -d rawdrive --no-owner --clean --if-exists < /opt/rawdrive/backups/<filename>.dump'
```

### Check database health
```bash
ssh root@187.127.142.46 'docker exec deploy-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT count(*) FROM users;"'
ssh root@187.127.142.46 'docker exec deploy-valkey-1 valkey-cli -a d74f374dab6c3e497ec2735313d2d2ffa903be9fad447790 ping'
```

### Renew SSL manually
```bash
ssh root@187.127.142.42 '/opt/rawdrive/renew-ssl.sh'
# Copy renewed cert to VPS 2
ssh root@187.127.142.42 'tar -cf - /etc/letsencrypt' | ssh root@187.127.142.44 'tar -xf - -C /'
ssh root@187.127.142.44 'docker exec deploy-nginx-1 nginx -s reload'
```

## Automated Tasks (Crontab)

### VPS 1 & VPS 2 (App Nodes)
| Schedule | Script | Purpose |
|----------|--------|---------|
| 0 3,15 * * * | /opt/rawdrive/renew-ssl.sh | Let's Encrypt cert renewal |

### VPS 3 (Database)
| Schedule | Script | Purpose |
|----------|--------|---------|
| 0 2 * * * | /opt/rawdrive/backup-db.sh | Daily PostgreSQL backup |

## PostgreSQL Tuning (VPS 3)

| Parameter | Value | Reason |
|-----------|-------|--------|
| shared_buffers | 2 GB | ~25% of 8 GB RAM |
| effective_cache_size | 6 GB | ~75% of RAM |
| work_mem | 16 MB | Per-query sort memory |
| maintenance_work_mem | 512 MB | For VACUUM, CREATE INDEX |
| max_connections | 100 | 2 app nodes x ~50 connections |
| wal_buffers | 64 MB | WAL write buffer |
| vm.swappiness | 10 | Prefer RAM over swap |
| vm.overcommit_memory | 1 | Required by Valkey |
| Timezone | Asia/Kolkata | IST |

## GitHub Actions Secrets (to be added)

| Secret | Value |
|--------|-------|
| SSH_PRIVATE_KEY | Contents of ~/.ssh/id_ed25519 |
| DB_VPS_IP | 187.127.142.46 |
| APP1_VPS_IP | 187.127.142.42 |
| APP2_VPS_IP | 187.127.142.44 |

## Security Hardening Applied

- SSH: Key-only auth, password disabled, MaxAuthTries=3
- UFW: Default deny incoming, explicit allow per role
- fail2ban: SSH brute-force protection (5 retries, 1h ban)
- Nginx: Rate limiting on API + login endpoints, connection limits
- Nginx: Security headers (XFO, XCTO, XSS, Referrer-Policy, COOP: unsafe-none, COEP: unsafe-none)
- Docker: All services restart unless-stopped
- Database: pg_hba.conf restricts connections to App VPS IPs only
- Valkey: Password-protected, AOF persistence enabled
- SSL: TLS 1.2/1.3 only, modern cipher suite
- Cloudflare: WAF rules, DDoS protection, bot management

## Previous Hosting (decommissioned)

| Service | Detail | Status |
|---------|--------|--------|
| Fly.io | rawdrive-api (Mumbai/bom) | Decommission after 48h stable VPS |
| Cloudflare Pages | Frontend auto-deploy | Disconnect GitHub integration |
| Neon | PostgreSQL (ap-southeast-1) | Decommission after data verified |
| Upstash | Valkey/Redis (ap-south-1) | Decommission after migration |
| GitHub Secret: FLY_API_TOKEN | Fly.io deploy token | Remove |

**NOTE:** Cloudflare DNS is KEPT — only Pages hosting is decommissioned. Cloudflare remains the DNS provider and CDN/edge layer.

## Cloudflare Services Still Active

| Service | Purpose | Status |
|---------|---------|--------|
| Cloudflare DNS | DNS management for rawdrive.in | ACTIVE — primary DNS |
| Cloudflare CDN | Edge caching, DDoS protection | ACTIVE |
| Cloudflare R2 | Photo/video object storage | ACTIVE |
| Cloudflare Stream | Video streaming (live + VOD) | ACTIVE |
| Cloudflare WAF | Web application firewall | ACTIVE |
| Cloudflare Pages | Frontend hosting | DECOMMISSIONING |

## Cloudflare R2 CORS Policy

**Bucket:** `rawdrive`

CORS must be configured via the Cloudflare Dashboard (R2 API tokens lack `PutBucketCors` permission).

**Path:** Cloudflare Dashboard → R2 Object Storage → `rawdrive` → Settings → CORS Policy

```json
[
  {
    "AllowedOrigins": [
      "https://rawdrive.in",
      "https://www.rawdrive.in",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

**Status:** APPLIED (2026-04-02) via S3 SDK with admin token.

## Cloudflare R2 S3 Credentials

| Field | Value |
|-------|-------|
| **Endpoint** | `https://1b62424aa3b6d960f5c0d2588eb576f5.r2.cloudflarestorage.com` |
| **Bucket** | `rawdrive` |
| **Access Key ID** | `4ca4360fd0e7125714183681de63dcb6` |
| **Secret Access Key** | `94c9f722d05e4b5ac0b1cf9b25e4631b13f18560a02d61b0bb819a8dcb312e2c` |
| **Account ID** | `1b62424aa3b6d960f5c0d2588eb576f5` |
| **Public Dev URL** | `https://pub-c9b96fd6eb4141a7a62b997390f5edde.r2.dev` |
| **CF API Token** | `cfat_REDACTED_ROTATE_IN_CLOUDFLARE` |

**Why:** R2 storage is used for all photography assets. Presigned URLs are generated by the backend (`internal/r2/client.go`) using these credentials. Browser uploads use presigned PUT URLs directly to R2.

**CORS config file (reference):** `deploy/r2-cors.json`

## Verified API Endpoints (2026-04-02)

All tested against production backend on VPS 1. Auth flow → onboarding → dashboard fully working.

### Auth
| Method | Endpoint | Status |
|--------|----------|--------|
| POST | `/api/v1/auth/password/register` | OK | Name + email + password signup |
| POST | `/api/v1/auth/password/login` | OK |
| POST | `/api/v1/auth/msg91/verify` | OK | MSG91 widget token → user session (disabled in UI) |
| POST | `/api/v1/auth/otp/request` | OK | Phone OTP send (disabled in UI) |
| POST | `/api/v1/auth/otp/verify` | OK | Phone OTP verify (disabled in UI) |
| POST | `/api/v1/auth/email-otp/request` | OK | Email OTP send (disabled in UI) |
| POST | `/api/v1/auth/email-otp/verify` | OK | Email OTP verify (disabled in UI) |
| POST | `/api/v1/auth/oauth/google` | OK |
| POST | `/api/v1/auth/password/forgot` | OK | Send 6-digit reset code to email |
| POST | `/api/v1/auth/password/reset` | OK | Verify code + set new password |
| PATCH | `/api/v1/auth/password/change` | OK | Change password (auth required) |
| POST | `/api/v1/auth/session/refresh` | OK | Returns new JWT with updated claims |

### Onboarding
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/v1/onboarding` | OK |
| PATCH | `/api/v1/onboarding/state` | OK |
| PATCH | `/api/v1/onboarding/plan` | OK |
| PATCH | `/api/v1/onboarding/coupon` | OK |
| PATCH | `/api/v1/onboarding/consents` | OK |
| POST | `/api/v1/onboarding/complete` | OK |

### Dashboard / Workspace
| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/api/v1/workspace` | OK | Returns workspace name, state |
| GET | `/api/v1/workspace/storage` | OK | Returns bytes_used, asset_count |
| GET | `/api/v1/workspace/members` | OK | Returns null when empty |
| GET | `/api/v1/galleries` | OK | Returns galleries array |
| GET | `/api/v1/clients` | OK | Returns clients array |
| GET | `/api/v1/notifications` | OK | Returns notifications + unread_count |
| GET | `/api/v1/subscriptions/current` | OK | Returns active subscription with plan + expiry |
| GET | `/api/v1/states` | OK | Returns 36 states/UTs |
| GET | `/api/v1/plans` | OK | Returns 5 plans (Free, Starter, Pro, Business, Enterprise) |

### Known Issues
| Issue | Status | Details |
|-------|--------|---------|
| R2 CORS | RESOLVED | Applied via S3 SDK with admin token (2026-04-02) |
| Upload presign | GUARDED | Returns 503 if R2 client is nil; ContentLength removed from signed headers |
| Onboarding→dashboard loop | RESOLVED | Token refresh after onboarding complete fixes stale JWT claims |
| .env overwrite on deploy | RESOLVED | tar excludes `.env` and `deploy/.env` to preserve server credentials |
