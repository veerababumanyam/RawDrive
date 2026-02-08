# TypeScript Errors Fix Plan

**Total Errors:** 69
**Generated:** 2026-02-08

---

## Summary

| File | Errors | Priority |
|------|--------|----------|
| faceCacheService.ts | 24 | High |
| CullingWorkflowPage.tsx | 16 | High |
| PortfolioRecommendationDashboard.tsx | 13 | Medium |
| cullingWorkflowService.ts | 9 | High |
| RecommendationCard.tsx | 4 | Medium |
| CullingBulkActionBar.tsx | 1 | Low |
| CommentPanel.tsx | 2 | Low |

---

## Phase 1: High Priority Service Layer (33 errors)

### 1.1 faceCacheService.ts (24 errors)

**Issue 1: Missing export from faceApiService**
```
error TS2305: Module '"./faceApiService"' has no exported member 'FaceDetectionResult'.
```
**Fix:** Check if type exists in faceApiService, if not create it or import from shared-types

**Issue 2: Export conflicts (4 errors)**
```
error TS2484: Export declaration conflicts with exported declaration
```
**Fix:** Remove duplicate type exports at bottom of file

**Issue 3: Undefined assignments (17 errors)**
```
error TS2322: Type 'X | undefined' is not assignable to type 'X'
```
**Fix:** Add non-null assertions or proper error handling for API responses:
- Lines 113, 154, 208, 241, 280, 310
- Pattern: `response.data!` or add proper error handling

**Issue 4: Wrong API parameter (2 errors)**
```
error TS2353: 'params' does not exist in request config
```
**Fix:** Use proper axios/fetch API structure

---

### 1.2 cullingWorkflowService.ts (9 errors)

**Issue: Undefined assignments**
All errors follow pattern:
```
error TS2322: Type 'X | undefined' is not assignable to type 'X'
```
**Locations:** Lines 158, 168, 188, 203, 219, 234, 249, 264

**Fix Options:**
```typescript
// Option A: Non-null assertion (if error handling exists above)
return response.data!;

// Option B: Explicit check with throw
if (!response.data) throw new Error('No data returned');
return response.data;

// Option C: Return type as nullable (update interface)
return response.data;
```

---

### 1.3 CullingWorkflowPage.tsx (16 errors)

**Issue 1: ToastData type mismatch (4 errors)**
```
error TS2353: 'type' does not exist in type 'Omit<ToastData, "id">'
```
**Locations:** Lines 208, 222, 228, 250

**Fix:** Update toast() calls to use correct API:
```typescript
// Check ToastData interface and use correct properties
toast({
  // Remove 'type' if it doesn't exist, or use correct variant/status
});
```

**Issue 2: GalleryDetailData.name (1 error)**
```
error TS2339: Property 'name' does not exist on type 'GalleryDetailData'
```
**Fix:** Check the correct property name (maybe `title`?)

**Issue 3: Error in children prop (1 error)**
```
error TS2322: Type 'string | Error | null' not assignable to ReactI18NextChildren
```
**Fix:** Convert error to string explicitly

**Issue 4: Form validation errors (10+ errors)**
Multiple react-hook-form type errors

**Fix:** Update useForm types and validation schemas

---

## Phase 2: Medium Priority UI Components (17 errors)

### 2.1 PortfolioRecommendationDashboard.tsx (13 errors)

**Issue 1: SceneCategory import type vs value (11 errors)**
```
error TS1361: 'SceneCategory' cannot be used as a value because it was imported using 'import type'
```
**Locations:** Lines 68-79, 81

**Fix:**
```typescript
// Change from:
import type { SceneCategory } from '@rawdrive/shared-types';
// To:
import { SceneCategory } from '@rawdrive/shared-types';
```

**Issue 2: Optional chaining on nested properties (2 errors)**
```
error TS18048: 'test.variants' is possibly 'undefined'
```
**Locations:** Lines 402, 421, 426, 440, 441, 442, 456

**Fix:**
```typescript
// Add optional chaining and null checks
test.variants?.[index] ?? defaultValue
```

---

### 2.2 RecommendationCard.tsx (4 errors)

**Issue 1: Missing type properties (2 errors)**
```
error TS2353: 'seasonal' does not exist in type 'Record<RecommendationType, ...>'
error TS2353: 'rejected' does not exist in type 'Record<RecommendationStatus, ...>'
```
**Locations:** Lines 74, 110

**Fix:** Add missing values to type definitions in shared-types:
```typescript
// Add to RecommendationType enum:
seasonal = 'seasonal'

// Add to RecommendationStatus enum:
rejected = 'rejected'
```

**Issue 2: Missing variant (2 errors)**
```
error TS2322: Type 'undefined' not assignable to type 'string'
```
**Locations:** Line 125

**Fix:** Ensure all card variants have proper default values

---

## Phase 3: Low Priority Minor Issues (3 errors)

### 3.1 CommentPanel.tsx (2 errors)

**Issue: Implicit any type**
```
error TS7034: Variable 'match' implicitly has type 'any'
```
**Locations:** Lines 196, 206

**Fix:**
```typescript
// Add type annotation
const match: RegExpMatchArray | null = ...
```

---

### 3.2 CullingBulkActionBar.tsx (1 error)

**Issue: Invalid variant value**
```
error TS2322: Type '"warning"' is not assignable to '"default" | "destructive"
```
**Location:** Line 377

**Fix:** Change to valid variant or update Button component to accept "warning"

---

## Execution Plan

### Step 1: Fix Service Layer (Phase 1)
1. Read and fix faceCacheService.ts
2. Read and fix cullingWorkflowService.ts
3. Read and fix CullingWorkflowPage.tsx toast calls
4. Run type check to verify fixes

### Step 2: Fix UI Components (Phase 2)
1. Fix PortfolioRecommendationDashboard.tsx imports
2. Update shared-types for missing enum values
3. Fix RecommendationCard.tsx
4. Run type check to verify fixes

### Step 3: Fix Minor Issues (Phase 3)
1. Fix CommentPanel.tsx type annotations
2. Fix CullingBulkActionBar.tsx variant
3. Final type check

### Step 4: Verification
1. Run full TypeScript check
2. Run frontend build
3. Verify all errors resolved

---

## File-by-File Checklist

- [ ] faceCacheService.ts - 24 errors
- [ ] cullingWorkflowService.ts - 9 errors
- [ ] CullingWorkflowPage.tsx - 16 errors
- [ ] PortfolioRecommendationDashboard.tsx - 13 errors
- [ ] RecommendationCard.tsx - 4 errors
- [ ] CommentPanel.tsx - 2 errors
- [ ] CullingBulkActionBar.tsx - 1 error
- [ ] shared-types package updates (if needed)
- [ ] Final verification

---

## Notes

- Some fixes may require updating shared-types package
- Some errors may indicate missing type definitions that need to be created
- Always check if undefined handling is appropriate before using non-null assertion
- Consider adding proper error handling instead of non-null assertions where possible
