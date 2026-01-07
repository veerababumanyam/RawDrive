# Debugging Magic Links 500 Error

## Quick Start

### Enable Debug Logging

**Windows (PowerShell):**
```powershell
. .\scripts\enable_magic_link_debug.ps1
```

**Linux/Mac:**
```bash
source scripts/enable_magic_link_debug.sh
```

**Or set environment variables manually:**
```bash
export LOG_LEVEL=DEBUG
export DEBUG_MAGIC_LINKS=true
export LOG_FORMAT=console
```

### Restart Backend

After setting environment variables, restart your backend server to apply the changes.

## What Gets Logged

With debug logging enabled, you'll see detailed logs at each step:

### 1. API Endpoint (`app.api.v1.magic_links`)
- Request received with all parameters
- Service instance creation
- Base URL determination
- Request validation
- Service call
- Response creation
- Success/error outcomes

### 2. Service Layer (`app.services.magic_link_service`)
- Method entry with all parameters
- Token generation
- URL building
- Repository call
- URL caching
- Success/error outcomes

### 3. Repository Layer (`app.repositories.magic_link_repository`)
- Method entry with all parameters
- Database pool acquisition
- Connection acquisition
- QR config preparation
- SQL statement execution (with parameters)
- Database response
- Row conversion
- Success/error outcomes

### 4. Database Errors
- Full error message
- Error type and module
- SQL statement attempted
- Columns attempted
- Suggestions for fixes (e.g., run migrations)

## Log Format

With `LOG_FORMAT=console`, logs will be human-readable with colors:
```
[2025-01-XX 12:34:56] INFO [MagicLink API] Creating magic link - START
  workspace_id=11111111-1111-1111-1111-000000000003
  gallery_id=3a49d9ad-5946-4372-85fb-293e340f5e27
  ...
```

With `LOG_FORMAT=json`, logs will be structured JSON:
```json
{
  "timestamp": "2025-01-XXT12:34:56.123Z",
  "level": "INFO",
  "event": "[MagicLink API] Creating magic link - START",
  "workspace_id": "11111111-1111-1111-1111-000000000003",
  ...
}
```

## Common Issues and Logs

### Missing Database Column
```
[MagicLink Repository] Database error creating magic link
  error: column "album_title" does not exist
  error_type: UndefinedColumn
  suggestion: Run: alembic upgrade head
```

**Solution:** Run `alembic upgrade head`

### Invalid Parameter
```
[MagicLink API] Validation failed: target_id required
  target_type=sub_gallery
```

**Solution:** Provide `target_id` for non-gallery targets

### Database Connection Issue
```
[MagicLink Repository] Database error creating magic link
  error: connection to server at "localhost" (::1), port 5432 failed
  error_type: ConnectionError
```

**Solution:** Check database connection settings

## Viewing Logs

### Development (Console)
Logs appear in the terminal where the backend is running.

### Production (JSON)
Logs are structured JSON. Use a log aggregator (Loki, ELK, etc.) or `jq`:
```bash
# Filter magic link logs
tail -f backend.log | jq 'select(.event | contains("MagicLink"))'

# Filter errors only
tail -f backend.log | jq 'select(.level == "ERROR" and (.event | contains("MagicLink")))'
```

## Troubleshooting

1. **No logs appearing?**
   - Check `LOG_LEVEL=DEBUG` is set
   - Check `DEBUG_MAGIC_LINKS=true` is set
   - Restart backend server
   - Check log output location

2. **Too many logs?**
   - Set `LOG_LEVEL=INFO` (less verbose)
   - Keep `DEBUG_MAGIC_LINKS=true` for magic link specific debug

3. **Can't see database errors?**
   - Ensure `LOG_LEVEL=DEBUG`
   - Check exception handlers aren't swallowing errors
   - Look for `[MagicLink Repository]` logs

## Example Debug Session

```bash
# 1. Enable debug logging
export LOG_LEVEL=DEBUG
export DEBUG_MAGIC_LINKS=true
export LOG_FORMAT=console

# 2. Restart backend
cd backend
python -m uvicorn app.main:app --reload

# 3. Make request from frontend
# 4. Watch logs in terminal

# Expected log flow:
# [MagicLink API] Creating magic link - START
# [MagicLink API] Service instance obtained
# [MagicLink API] Base URL determined
# [MagicLink API] Validating request parameters
# [MagicLink API] Calling service.create_link
# [MagicLink Service] create_link - START
# [MagicLink Service] Generating secure token
# [MagicLink Service] Token generated
# [MagicLink Service] Building public URL
# [MagicLink Service] Calling repository.create
# [MagicLink Repository] create - START
# [MagicLink Repository] Postgres pool acquired
# [MagicLink Repository] Database connection acquired
# [MagicLink Repository] Executing INSERT statement
# [MagicLink Repository] INSERT successful
# [MagicLink Repository] create - SUCCESS
# [MagicLink Service] create_link - SUCCESS
# [MagicLink API] Magic link created successfully - END
```
