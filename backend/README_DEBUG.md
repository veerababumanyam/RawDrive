# Debug Mode for Magic Links

## Quick Enable

Set these environment variables before starting the backend:

```bash
# Windows PowerShell
$env:LOG_LEVEL = "DEBUG"
$env:DEBUG_MAGIC_LINKS = "true"
$env:LOG_FORMAT = "console"

# Linux/Mac
export LOG_LEVEL=DEBUG
export DEBUG_MAGIC_LINKS=true
export LOG_FORMAT=console
```

Or use the helper scripts:
- Windows: `.\scripts\enable_magic_link_debug.ps1`
- Linux/Mac: `source scripts/enable_magic_link_debug.sh`

## What You'll See

With debug logging enabled, every step of magic link creation is logged:

1. **API Request Received** - All request parameters
2. **Service Layer** - Token generation, URL building
3. **Repository Layer** - Database connection, SQL execution
4. **Database Response** - Success or detailed error

## Example Output

```
[2025-01-XX 12:34:56] INFO [MagicLink API] Creating magic link - START
  workspace_id=11111111-1111-1111-1111-000000000003
  gallery_id=3a49d9ad-5946-4372-85fb-293e340f5e27
  user_id=...
  target_type=gallery
  album_title=Test Album

[2025-01-XX 12:34:56] DEBUG [MagicLink API] Service instance obtained
[2025-01-XX 12:34:56] DEBUG [MagicLink API] Base URL determined
  base_url=http://localhost:8000

[2025-01-XX 12:34:56] INFO [MagicLink Service] create_link - START
[2025-01-XX 12:34:56] DEBUG [MagicLink Service] Generating secure token
[2025-01-XX 12:34:56] DEBUG [MagicLink Service] Token generated
  token_length=43
  token_hash_prefix=abc12345

[2025-01-XX 12:34:56] INFO [MagicLink Repository] create - START
[2025-01-XX 12:34:56] DEBUG [MagicLink Repository] Executing SQL query
  sql=INSERT INTO magic_links (...)
  parameters={...}

[2025-01-XX 12:34:56] INFO [MagicLink Repository] INSERT successful
  link_id=...
```

## Error Example

If there's a database error, you'll see:

```
[2025-01-XX 12:34:56] ERROR [MagicLink Repository] Database error creating magic link
  error=column "album_title" does not exist
  error_type=UndefinedColumn
  suggestion=Run: alembic upgrade head
  sql_statement=INSERT INTO magic_links
  columns_attempted=[workspace_id, gallery_id, ..., album_title, ...]
```

## See Also

- `docs/DEBUG_MAGIC_LINKS.md` - Detailed debugging guide
- `docs/ROOT_CAUSE_MAGIC_LINKS_500.md` - Root cause analysis
