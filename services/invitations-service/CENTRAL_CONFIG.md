# Central Configuration Service Integration

## Overview

The invitations-service microservice supports **centralized configuration management** where environment variables are managed centrally and automatically propagated to all microservices. When configuration is updated in the central service, all microservices automatically reflect the changes without requiring a restart.

## Architecture

```
┌─────────────────────┐
│   Backend Service   │
│                     │
│  /api/v1/config/    │
│  microservices/     │
│  {service_name}     │
└──────────┬──────────┘
           │
           │ HTTP GET (periodic refresh)
           │
           ▼
┌─────────────────────┐
│ Invitations Service │
│                     │
│  ConfigClient       │
│  ├─ Fetches config  │
│  ├─ Caches (5 min)  │
│  └─ Auto-refresh    │
└─────────────────────┘
```

## How It Works

### 1. Central Config Endpoint

The backend exposes a config endpoint at:
```
GET /api/v1/config/microservices/{service_name}
```

This endpoint returns configuration values for the specified microservice, reading from the backend's environment variables.

### 2. Config Client

The microservice includes a `ConfigClient` (`src/services/config_client.py`) that:
- Fetches configuration from the central service
- Caches results for 5 minutes (configurable via `CONFIG_CACHE_TTL`)
- Automatically refreshes in the background every 60 seconds (configurable via `CENTRAL_CONFIG_REFRESH_INTERVAL`)
- Falls back to environment variables if the central service is unavailable

### 3. Settings Reload

When config is fetched from central service:
1. Environment variables are updated
2. Settings instance is recreated to pick up new values
3. Services using `get_settings()` will get updated values

## Configuration

### Enable Central Config

Set environment variable:
```bash
CENTRAL_CONFIG_ENABLED=true
```

### Configure Refresh Interval

Set refresh interval (seconds):
```bash
CENTRAL_CONFIG_REFRESH_INTERVAL=60  # Default: 60 seconds
```

### Backend Service URL

The microservice needs to know where to fetch config:
```bash
BACKEND_SERVICE_URL=http://localhost:8000
```

## Environment Variables Managed Centrally

The following environment variables can be managed centrally (via backend environment variables):

- `DATABASE_URL`
- `REDIS_URL`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `ENCRYPTION_MASTER_KEY`
- `SENDGRID_API_KEY`
- `JWT_SECRET`
- `BACKEND_SERVICE_URL`
- `MAGIC_LINK_SERVICE_URL`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`

## Usage Example

### In Code

```python
from src.config import settings, get_settings

# Recommended: Use the proxy (always returns latest)
db_url = settings.DATABASE_URL
redis_url = settings.REDIS_URL

# Alternative: Call get_settings() directly
current_settings = get_settings()
db_url = current_settings.DATABASE_URL
```

### Important Notes

1. **Settings Proxy**: The `settings` object is a proxy that always delegates to the current settings instance. When config is reloaded from central service, accessing `settings.DATABASE_URL` will return the latest value.

2. **Cached Values**: Some services cache settings values at initialization:
   - `R2StorageService.bucket_name` - cached at `__init__`
   - `RedisClient` connection URL - used at `connect()` time
   - Database pool - created with URL at `get_pool()` time
   
   **If config changes while the service is running:**
   - Settings proxy will return new values immediately
   - Services with cached values will continue using old values until recreated
   - For production, restart services after config changes (recommended)

3. **Service Restart**: For critical config changes (e.g., DATABASE_URL, REDIS_URL), it's recommended to restart the service to ensure all connections are recreated with new values.

### Without Central Config (Fallback)

If `CENTRAL_CONFIG_ENABLED=false` or the central service is unavailable, the microservice falls back to local environment variables, behaving exactly as before.

## Benefits

1. **Centralized Management**: Update config once, all services reflect changes automatically
2. **No Restart Required**: Config changes propagate without service restarts
3. **Resilient**: Falls back to environment variables if central service unavailable
4. **Backward Compatible**: Works with or without central config enabled

## Security Considerations

- The config endpoint is currently unauthenticated for service-to-service communication
- For production, consider:
  - Service mesh authentication (mTLS)
  - API key authentication
  - Network policies to restrict access
  - Secrets management (Vault, AWS Secrets Manager, etc.)

## Monitoring

The config client logs:
- Successful config fetches (DEBUG level)
- Failed fetches with fallback to env vars (WARNING level)
- Settings reloads (INFO level)

Check logs for:
```
INFO: Settings reloaded from central config: ['DATABASE_URL', 'REDIS_URL', ...]
WARNING: Failed to fetch config from central service: <error>. Using environment variables.
```
