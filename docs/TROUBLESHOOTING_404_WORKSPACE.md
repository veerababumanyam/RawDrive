# Troubleshooting: 404 WORKSPACE_NOT_FOUND Error

## Symptom

After successful login (200 OK), users see a 404 error:

```json
{
    "code": "WORKSPACE_NOT_FOUND",
    "message": "The item you're looking for doesn't exist.",
    "status": 404
}
```

Backend logs show:
```
WorkspaceNotFoundError: Workspace not found with ID 11111111-1111-1111-1111-000000000004
```

## Root Cause

The frontend is trying to access a **different workspace** than the one the logged-in user belongs to.

**Example:**
- User's actual workspace: `11111111-1111-1111-1111-000000000001`
- Frontend trying to access: `11111111-1111-1111-1111-000000000004`

## Common Causes

### 1. Stale localStorage/sessionStorage

**Issue:** Browser has cached workspace ID from previous session

**Solution:**
```javascript
// Open browser DevTools (F12) → Console → Run:
localStorage.clear();
sessionStorage.clear();
location.reload();
```

**Or manually:**
1. Open DevTools (F12)
2. Go to Application tab
3. Expand "Local Storage" and "Session Storage"
4. Right-click → Clear
5. Refresh page

### 2. Hardcoded Workspace ID in Frontend

**Issue:** Frontend code has hardcoded workspace ID

**Check these files:**
- `frontend/src/router/routes.tsx` - Route definitions
- `frontend/src/contexts/AuthContext.tsx` - Auth context
- `frontend/src/services/api.ts` - API client

**Search for:**
```bash
cd frontend
grep -r "11111111-1111-1111-1111" src/
```

### 3. Incorrect Login Redirect

**Issue:** After login, frontend redirects to wrong workspace ID

**File:** `frontend/src/pages/public/SignInPage.tsx` or auth service

**Check:**
```typescript
// Login success handler should use workspace_id from response
const handleLoginSuccess = (response) => {
  const { user, tokens } = response;

  // ✅ CORRECT: Use workspace_id from response
  navigate(`/workspace/${user.workspace_id}/dashboard`);

  // ❌ WRONG: Hardcoded workspace ID
  navigate('/workspace/11111111-1111-1111-1111-000000000004/dashboard');
};
```

### 4. Multiple Test Users with Different Workspaces

**Issue:** Testing with different users but frontend remembers old workspace

**Solution:** Each test user belongs to their own workspace:

| User Email | Workspace ID | Workspace Name |
|------------|--------------|----------------|
| free@test.rawdrive.in | `...000000000001` | free |
| business@test.rawdrive.in | `...000000000004` | business |
| enterprise@test.rawdrive.in | `...000000000007` | enterprise |

**Always clear browser data** when switching between test users!

## Quick Fix (Development)

1. **Clear browser data:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   ```

2. **Restart Vite dev server:**
   ```bash
   cd frontend
   pnpm dev
   ```

3. **Hard refresh browser:**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

4. **Login again** with correct credentials

## Verification

After logging in, check the URL:
```
http://localhost:5173/workspace/[WORKSPACE_ID]/dashboard
```

The `WORKSPACE_ID` should match the one from login response:

```bash
# Test login and get workspace_id
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"free@test.rawdrive.in","password":"Test@123"}' \
  | jq '.user.workspace_id'
```

Expected output:
```
"11111111-1111-1111-1111-000000000001"
```

## Prevention

### For Developers

1. **Never hardcode workspace IDs** in frontend code
2. **Always use `workspace_id` from JWT token** or API response
3. **Clear storage** when switching test users
4. **Add workspace validation** in frontend guards:

```typescript
// frontend/src/components/auth/ProtectedRoute.tsx
const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const { workspaceId } = useParams();

  // Validate user has access to this workspace
  if (workspaceId && user.workspace_id !== workspaceId) {
    // Redirect to correct workspace
    return <Navigate to={`/workspace/${user.workspace_id}/dashboard`} replace />;
  }

  return children;
};
```

### For Testing

1. **Use isolated browser profiles** for each test user
2. **Clear storage before each test**:
   ```typescript
   // In Playwright tests
   test.beforeEach(async ({ page, context }) => {
     await context.clearCookies();
     await page.evaluate(() => {
       localStorage.clear();
       sessionStorage.clear();
     });
   });
   ```

3. **Extract workspace_id dynamically**:
   ```typescript
   // Don't hardcode: /workspace/11111111.../dashboard
   // Instead:
   const loginResponse = await loginUser();
   const workspaceId = loginResponse.user.workspace_id;
   await page.goto(`/workspace/${workspaceId}/dashboard`);
   ```

## Backend Validation

The backend correctly validates workspace access:

```python
# backend/src/app/services/workspace_service.py
async def get_workspace(workspace_id: UUID, user_id: UUID):
    # Check user has membership in workspace
    membership = await db.execute(
        select(WorkspaceMembership)
        .where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.status == 'active'
        )
    )

    if not membership:
        raise WorkspaceNotFoundError(workspace_id)
```

## Related Issues

- [Login 500 Error](./TROUBLESHOOTING_LOGIN_500.md) - Session creation issues
- [403 Forbidden](./TROUBLESHOOTING_403_FORBIDDEN.md) - Permission issues

## Support

If clearing browser storage doesn't fix the issue:

1. Check backend logs:
   ```bash
   docker logs rawdrive-backend 2>&1 | grep -i "workspace_not_found"
   ```

2. Verify user's workspace membership:
   ```sql
   SELECT
       u.email,
       wm.workspace_id,
       w.name as workspace_name,
       wm.status
   FROM users u
   JOIN workspace_memberships wm ON u.user_id = wm.user_id
   JOIN workspaces w ON wm.workspace_id = w.workspace_id
   WHERE u.email = 'user@example.com';
   ```

3. Check JWT token contents:
   ```bash
   # Decode access token (copy from browser DevTools)
   echo "YOUR_TOKEN_HERE" | cut -d. -f2 | base64 -d | jq
   ```

---

**Last Updated:** 2026-01-07
**Affects:** Frontend v0.3.0+
**Status:** Documented
