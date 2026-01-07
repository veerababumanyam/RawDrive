# Root Cause Analysis: Magic Links 500 Error

## Error
```
POST http://localhost:8000/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/magic-links
500 (Internal Server Error)
```

## Root Cause

The 500 error is caused by **missing database columns** in the `magic_links` table. The repository's `create()` method attempts to INSERT into columns that may not exist if migrations haven't been run.

### Missing Columns (if migrations not run)

1. **`album_title`** (VARCHAR(200)) - Added in migration `0056_add_album_title_to_magic_links.py`
2. **`public_url`** (TEXT) - Added in migration `0053_add_public_url_to_magic_links.py`
3. **`invitation_id`** (UUID) - Added in migration `0079_magic_links_invitation_support.py`

### Current INSERT Statement

The repository tries to insert into all these columns:
```sql
INSERT INTO magic_links (
    workspace_id, gallery_id, token_hash, target_type, target_id,
    album_title, label, expires_at, max_accesses, qr_config,
    created_by_user_id, public_url, invitation_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
```

If any of these columns don't exist, PostgreSQL will throw an error like:
```
column "album_title" does not exist
```

## Solution

### Step 1: Run Database Migrations

```bash
cd backend
alembic upgrade head
```

This will ensure all required columns exist:
- ✅ `album_title` (migration 0056)
- ✅ `public_url` (migration 0053)
- ✅ `invitation_id` (migration 0079)

### Step 2: Verify Schema

Run the diagnostic script:
```bash
cd backend
python scripts/check_magic_links_schema.py
```

Or manually check:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'magic_links' 
ORDER BY ordinal_position;
```

### Step 3: Check Backend Logs

With the improved error handling, you should now see detailed error messages in the backend logs:
```
ERROR: Database error creating magic link
  error: column "album_title" does not exist
  error_type: UndefinedColumn
```

## Additional Checks

### 1. CORS Configuration
✅ CORS is properly configured in `backend/src/app/main.py`:
- Allows all methods (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- Allows credentials
- Allows all headers
- Defaults to localhost origins in development

### 2. Middleware
✅ All middleware is properly configured:
- Correlation ID
- Request ID
- API Versioning
- Audit Logging
- Rate Limiting
- Prometheus Metrics
- CORS (added last)

### 3. Routing
✅ Magic links router is properly registered in `backend/src/app/api/v1/__init__.py`:
```python
router.include_router(
    magic_links_router,
    prefix="/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/magic-links",
    tags=["magic-links"],
)
```

### 4. Schema Validation
✅ Fixed: Added `album_title` field to `CreateMagicLinkRequest` schema in `backend/src/app/api/schemas.py`

## Verification Steps

1. **Check migrations status:**
   ```bash
   cd backend
   alembic current
   alembic heads
   ```

2. **Run migrations if needed:**
   ```bash
   alembic upgrade head
   ```

3. **Verify table structure:**
   ```sql
   \d magic_links
   ```

4. **Test the endpoint:**
   ```bash
   curl -X POST http://localhost:8000/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/magic-links \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer {token}" \
     -d '{
       "album_title": "Test Album",
       "label": "Test Link"
     }'
   ```

## Files Modified

1. ✅ `backend/src/app/api/schemas.py` - Added `album_title` to `CreateMagicLinkRequest`
2. ✅ `backend/src/app/api/v1/magic_links.py` - Improved error handling with detailed error messages
3. ✅ `backend/src/app/repositories/magic_link_repository.py` - Added database error handling with migration hints
4. ✅ `backend/scripts/check_magic_links_schema.py` - Created diagnostic script

## Next Steps

1. **Run migrations** to ensure database schema is up to date
2. **Check backend logs** for the actual database error message
3. **Verify** the endpoint works after migrations are applied
4. **Monitor** for any other schema-related issues

## Related Migrations

- `0031_magic_links_and_qr.py` - Creates base `magic_links` table
- `0053_add_public_url_to_magic_links.py` - Adds `public_url` column
- `0056_add_album_title_to_magic_links.py` - Adds `album_title` column
- `0057_add_revoked_at_to_magic_links.py` - Adds `revoked_at` column
- `0079_magic_links_invitation_support.py` - Adds `invitation_id` and makes `gallery_id` nullable
