# Client CRUD Testing Guide

## Quick Start

Run the automated CRUD test suite:

```bash
cd /Users/v13478/Desktop/RawDrive
python3 test_client_crud.py
```

## Prerequisites

1. **Backend Running**: Make sure the backend is running on http://localhost:8000
2. **Test User**: The test user `professional@test.rawdrive.in` should exist

### Check Backend Status

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-12-20T..."}
```

### Create Test User (if needed)

```bash
cd backend
python3 seed_user.py
```

## Running Tests

### Full CRUD Test Suite

```bash
python3 test_client_crud.py
```

This will test:
1. ✅ CREATE - Create a new client
2. ✅ READ - Get client details
3. ✅ LIST - List all clients
4. ✅ UPDATE - Update client profile
5. ✅ ADD_CONTACT - Add email contact
6. ✅ SEARCH - Search for clients
7. ✅ DELETE - Delete client

### Expected Output

```
Client CRUD Operations Test Suite
Testing API at: http://localhost:8000/api/v1
Using credentials: professional@test.rawdrive.in

============================================================
AUTHENTICATION
============================================================

✓ Logged in as user: 11111111-1111-1111-1111-111111111003
✓ Using workspace: 34c96892-1c3b-50c5-9156-87dc4b0eba8a

============================================================
TEST 1: CREATE CLIENT
============================================================

ℹ Creating client: Jane Smith
✓ Client created successfully!
...

============================================================
TEST SUMMARY
============================================================

CREATE               PASS
READ                 PASS
LIST                 PASS
UPDATE               PASS
ADD_CONTACT          PASS
SEARCH               PASS
DELETE               PASS

Total: 7/7 tests passed
✓ All tests passed! ✓
```

## Manual Testing with curl

### 1. Login

```bash
# Get access token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "professional@test.rawdrive.in",
    "password": "Test@123"
  }'

# Save the access_token and workspace_id from response
TOKEN="your_access_token"
WORKSPACE_ID="your_workspace_id"
```

### 2. Create Client

```bash
curl -X POST "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "first_name": "John",
    "last_name": "Doe",
    "job_title": "CEO",
    "organization": "Acme Corp"
  }'

# Save the client_id from response
CLIENT_ID="returned_client_id"
```

### 3. Get Client (Read)

```bash
curl -X GET "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. List Clients

```bash
curl -X GET "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients?limit=20&page=1" \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Update Client

```bash
curl -X PATCH "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "job_title": "Senior CEO",
    "status": "active"
  }'
```

### 6. Add Contact

```bash
curl -X POST "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID/contacts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contact_type": "email",
    "contact_subtype": "work",
    "value": "john@acme.com",
    "is_primary": true
  }'
```

### 7. Search Clients

```bash
curl -X GET "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients/search?q=John&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### 8. Delete Client

```bash
curl -X DELETE "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Integration Tests

Run the full integration test suite:

```bash
cd backend
pytest tests/integration/test_client_crm_workflows.py -v
```

## Unit Tests

Run client service unit tests:

```bash
cd backend
pytest tests/unit/test_client_service.py -v
```

## Test Data Cleanup

The automated test script (`test_client_crud.py`) cleans up after itself by deleting the test client at the end.

If you need to manually clean up test data:

```bash
# List all clients
curl -X GET "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients" \
  -H "Authorization: Bearer $TOKEN"

# Delete specific client
curl -X DELETE "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Troubleshooting

### Backend Not Running

```bash
# Check if backend is running
curl http://localhost:8000/health

# If not, start it (from project root)
cd backend
# Follow your backend startup procedure
```

### Test User Doesn't Exist

```bash
cd backend
python3 seed_user.py
```

### Authentication Failed

This usually means:
1. Wrong credentials
2. User doesn't exist
3. Backend not running

Check credentials in `test_client_crud.py`:
```python
TEST_EMAIL = "professional@test.rawdrive.in"
TEST_PASSWORD = "Test@123"
```

### 404 Not Found

Check:
1. Workspace ID is correct
2. Client ID exists
3. API endpoint URL is correct

## API Endpoints Reference

### Authentication
- POST `/api/v1/auth/login` - Login
- POST `/api/v1/auth/signup` - Sign up

### Clients (CRUD)
- POST `/api/v1/workspaces/{workspace_id}/clients` - Create client
- GET `/api/v1/workspaces/{workspace_id}/clients/{client_id}` - Get client
- PATCH `/api/v1/workspaces/{workspace_id}/clients/{client_id}` - Update client
- DELETE `/api/v1/workspaces/{workspace_id}/clients/{client_id}` - Delete client
- GET `/api/v1/workspaces/{workspace_id}/clients` - List clients
- GET `/api/v1/workspaces/{workspace_id}/clients/search` - Search clients

### Contacts
- POST `/api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts` - Add contact
- PATCH `/api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts/{contact_id}` - Update contact
- DELETE `/api/v1/workspaces/{workspace_id}/clients/{client_id}/contacts/{contact_id}` - Delete contact

### Addresses
- POST `/api/v1/workspaces/{workspace_id}/clients/{client_id}/addresses` - Add address
- PATCH `/api/v1/workspaces/{workspace_id}/clients/{client_id}/addresses/{address_id}` - Update address
- DELETE `/api/v1/workspaces/{workspace_id}/clients/{client_id}/addresses/{address_id}` - Delete address

### Gallery Links
- POST `/api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries` - Link gallery
- GET `/api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries` - Get linked galleries
- PATCH `/api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries/{gallery_id}/role` - Update role
- DELETE `/api/v1/workspaces/{workspace_id}/clients/{client_id}/galleries/{gallery_id}` - Unlink gallery

### Tags
- POST `/api/v1/workspaces/{workspace_id}/clients/{client_id}/tags` - Add tags
- DELETE `/api/v1/workspaces/{workspace_id}/clients/{client_id}/tags/{tag_id}` - Remove tag
- GET `/api/v1/workspaces/{workspace_id}/client-tags` - Get all tags

### Communications
- POST `/api/v1/workspaces/{workspace_id}/clients/{client_id}/communications` - Log communication
- GET `/api/v1/workspaces/{workspace_id}/clients/{client_id}/communications` - Get communications

### Activities
- GET `/api/v1/workspaces/{workspace_id}/clients/{client_id}/activities` - Get activities

### Analytics
- GET `/api/v1/workspaces/{workspace_id}/clients/analytics` - Get client analytics
- GET `/api/v1/workspaces/{workspace_id}/clients/analytics/engagement` - Get engagement metrics
- GET `/api/v1/workspaces/{workspace_id}/clients/analytics/referrals` - Get referral analytics
- GET `/api/v1/workspaces/{workspace_id}/clients/analytics/revenue` - Get revenue metrics

## Files

- `test_client_crud.py` - Automated CRUD test script
- `CLIENT_CRUD_REVIEW.md` - Detailed code review
- `CLIENT_CRUD_SUMMARY.md` - Test results summary
- `CLIENT_CRUD_TESTING.md` - This testing guide

## Support

For issues or questions about client CRUD operations:
1. Check `CLIENT_CRUD_REVIEW.md` for code analysis
2. Check `CLIENT_CRUD_SUMMARY.md` for test results
3. Review backend logs for error details
4. Verify database state if needed

---

**Last Updated**: 2025-12-20  
**Test Suite Version**: 1.0  
**Status**: All tests passing ✅
