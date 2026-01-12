# Client Activities & Communications Fixes

## Summary
Fixed multiple issues with client activities and communications endpoints:
1. **Response structure mismatch** - API returns pagination fields at top level, not in `meta` object
2. **Missing `title` field** - Backend requires `title` for activity creation
3. **Date format issues** - `follow_up_date` needs to be ISO datetime string

## Issues Fixed

### 1. "Cannot read properties of undefined (reading 'total')" Error
**Root Cause**: API response structure mismatch
- **Backend returns**: `{ activities: [], total: 0, page: 1, limit: 20 }`
- **Frontend expects**: `{ activities: [], meta: { total: 0, page: 1, limit: 20, total_pages: 1 } }`

**Fix**: Added response normalization in `clientService.ts`:
- `getActivities()` - Normalizes response to include `meta` object
- `getCommunications()` - Normalizes response to include `meta` object

**Files Modified**:
- `frontend/src/services/clientService.ts` (lines 597-631, 650-680)

### 2. Activity Recording 422 Error
**Root Cause**: Missing required `title` field
- Backend schema (`ActivityCreate`) requires `title: str`
- Frontend was only sending `activity_type` and `description`

**Fix**: 
- Added `title: string` to `RecordActivityRequest` TypeScript interface
- Updated `ActivityRecorder` to generate title from description or activity type

**Files Modified**:
- `frontend/src/types/client.ts` - Added `title` field
- `frontend/src/components/features/clients/ActivityRecorder.tsx` - Generate title

### 3. Communication Logging Date Format
**Root Cause**: `follow_up_date` format mismatch
- Frontend was sending date string (`'yyyy-MM-dd'`)
- Backend expects ISO datetime string

**Fix**: Convert date string to ISO datetime in `CommunicationLogger`

**Files Modified**:
- `frontend/src/components/features/clients/CommunicationLogger.tsx` - Date conversion

## Testing

### Test Scripts
Created test scripts to verify fixes:
- `scripts/test_client_activities.sh` - Bash script for Linux/Mac
- `scripts/test_client_activities.ps1` - PowerShell script for Windows

### Usage

**Bash (Linux/Mac)**:
```bash
export TOKEN="your-jwt-token"
export WORKSPACE_ID="11111111-1111-1111-1111-000000000003"
export CLIENT_ID="bbcb9575-788c-4f52-b7c2-8a609cc11d8a"
./scripts/test_client_activities.sh
```

**PowerShell (Windows)**:
```powershell
$env:TOKEN = "your-jwt-token"
$env:WORKSPACE_ID = "11111111-1111-1111-1111-000000000003"
$env:CLIENT_ID = "bbcb9575-788c-4f52-b7c2-8a609cc11d8a"
.\scripts\test_client_activities.ps1
```

### Manual cURL Tests

**Record Activity**:
```bash
curl -X POST "http://localhost/api/v1/workspaces/11111111-1111-1111-1111-000000000003/clients/bbcb9575-788c-4f52-b7c2-8a609cc11d8a/activities" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "activity_type": "note",
    "title": "Test Activity",
    "description": "Test description",
    "metadata": {
      "activity_date": "2026-01-09"
    }
  }'
```

**Log Communication**:
```bash
curl -X POST "http://localhost/api/v1/workspaces/11111111-1111-1111-1111-000000000003/clients/bbcb9575-788c-4f52-b7c2-8a609cc11d8a/communications" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "communication_type": "email",
    "direction": "outbound",
    "subject": "Test Subject",
    "notes": "Test communication notes",
    "follow_up_required": false
  }'
```

**Get Activities**:
```bash
curl -X GET "http://localhost/api/v1/workspaces/11111111-1111-1111-1111-000000000003/clients/bbcb9575-788c-4f52-b7c2-8a609cc11d8a/activities?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Communications**:
```bash
curl -X GET "http://localhost/api/v1/workspaces/11111111-1111-1111-1111-000000000003/clients/bbcb9575-788c-4f52-b7c2-8a609cc11d8a/communications?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Verification Checklist

- [x] Response normalization for activities (meta object)
- [x] Response normalization for communications (meta object)
- [x] Activity recording includes `title` field
- [x] Communication logging date format fixed
- [x] Test scripts created
- [ ] Manual testing completed
- [ ] All errors resolved

## Notes

- Debug instrumentation remains in place for verification
- All fixes are backward compatible
- Response normalization handles both old and new API response formats
