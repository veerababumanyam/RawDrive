# Phase 1: Codebase Analysis - Task 11.10 Duplicate Detection

## 📊 Codebase Analysis Complete

### ✅ Current State

**Backend (COMPLETE):**
- ✅ Duplicate check endpoint: `/api/v1/workspaces/{workspace_id}/uploads/check-duplicate` (POST)
- ✅ Schemas: `CheckDuplicateRequest`, `CheckDuplicateResponse`, `DuplicateAssetResponse`
- ✅ Returns duplicates with thumbnails, metadata, gallery info
- ✅ Workspace-scoped, optional gallery filter

**Frontend (PARTIAL):**
- ✅ Upload components: `UploadDropzone`, `UploadProgressPanel`, `UploadQueue`, `ClientTagSelector`
- ✅ Hooks: `useUploadWorker`, `useBrowserCloseWarning`
- ✅ Service: `galleryService.ts` (has upload methods)
- ❌ **MISSING**: Duplicate detection component
- ❌ **MISSING**: SHA256 calculation utility
- ❌ **MISSING**: Integration with upload flow

### ⚠️ Gaps Found

1. **No frontend duplicate detection component**
   - Need: `DuplicateDetectionDialog.tsx` with side-by-side comparison
   - Location: `frontend/src/components/features/upload/DuplicateDetectionDialog.tsx`

2. **No SHA256 calculation utility**
   - Need: Client-side SHA256 hash calculation
   - Location: `frontend/src/utils/sha256.ts` or `frontend/src/utils/crypto.ts`

3. **No integration with upload flow**
   - Need: Check duplicates before upload starts
   - Integration point: `UploadDropzone.tsx` → check before `onFilesSelected`

4. **No useUpload hook (Task 11.12)**
   - This will integrate all upload components
   - Can be done after 11.10 or in parallel

### 📋 Dependencies

**Services:**
- `galleryService.ts` - needs `checkDuplicate()` method
- `apiClient` - already exists, used by galleryService

**Components:**
- `AppButton` - for Skip/Replace/Keep Both actions
- `AppCard` - for dialog container
- `PhotoCard` or similar - for duplicate preview display

**Hooks:**
- `useSignedUrl` - for displaying duplicate thumbnails
- `useToast` - for notifications

**Utils:**
- Need SHA256 calculation (Web Crypto API or crypto-js)

**Database:**
- `assets` table (sha256 column) - already exists
- `gallery_assets` table - for gallery association

### 🎯 Integration Points

**Exact Files/Endpoints:**

1. **Backend API:**
   - `backend/src/app/api/v1/uploads.py` - `/check-duplicate` endpoint ✅ EXISTS
   - `backend/src/app/api/schemas.py` - Request/Response schemas ✅ EXISTS

2. **Frontend Service:**
   - `frontend/src/services/galleryService.ts` - Add `checkDuplicate()` method
   - Uses: `POST /api/v1/workspaces/{workspaceId}/uploads/check-duplicate`

3. **Frontend Component:**
   - `frontend/src/components/features/upload/DuplicateDetectionDialog.tsx` - NEW
   - Props: `duplicates: DuplicateAssetResponse[]`, `onSkip`, `onReplace`, `onKeepBoth`

4. **Frontend Utils:**
   - `frontend/src/utils/sha256.ts` - NEW
   - Function: `calculateSHA256(file: File): Promise<string>`

5. **Integration:**
   - `frontend/src/components/features/upload/UploadDropzone.tsx` - Add duplicate check before `onFilesSelected`
   - Flow: File selected → Calculate SHA256 → Check duplicates → Show dialog if found → Proceed based on user choice

### 📐 Design System Compliance

**Colors:** Use CSS variables from `frontend/src/index.css`
- `--color-surface` for dialog background
- `--color-border` for dividers
- `--color-text-primary` for text
- `--color-error` for warnings

**Components:** Use existing UI components
- `AppButton` with variants: `primary`, `outline`, `destructive`
- `AppCard` for dialog container
- `Progress` for loading states

**Typography:** Use Tailwind classes
- `text-lg` for dialog title
- `text-sm` for metadata
- `text-xs` for timestamps

**Spacing:** Use Tailwind spacing scale
- `p-6` for dialog padding
- `gap-4` for grid spacing
- `mb-4` for section spacing

### 🔒 Security & Compliance

**SOC2/GDPR:**
- ✅ SHA256 calculated client-side (no file data sent until user confirms)
- ✅ Workspace-scoped queries (backend enforces)
- ✅ Audit logging (backend handles)

**Accessibility:**
- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ ARIA labels for dialog and buttons
- ✅ Focus trap in dialog
- ✅ Screen reader announcements

### 📝 Requirements Mapping

**Requirement 5.27:** Detect duplicates by SHA256 checksum ✅ Backend ready
**Requirement 5.28:** Show side-by-side comparison with existing photo metadata ⚠️ Frontend needed

### 🎨 UI/UX Pattern

**Dialog Structure:**
```
┌─────────────────────────────────────────┐
│ Duplicate Detected                      │
├─────────────────────────────────────────┤
│ This file already exists:               │
│                                         │
│ ┌──────────┐    ┌──────────┐          │
│ │ Existing │    │ New File │          │
│ │ Thumbnail│    │ Thumbnail │          │
│ └──────────┘    └──────────┘          │
│                                         │
│ Metadata comparison table               │
│                                         │
│ [Skip] [Replace] [Keep Both]           │
└─────────────────────────────────────────┘
```

**User Flow:**
1. User selects files → Calculate SHA256
2. Check duplicates → If found, show dialog
3. User chooses: Skip/Replace/Keep Both
4. Proceed with upload (or skip)

### ✅ Next Steps

**Phase 2:** Architecture Design
- Design component structure
- Define props/interfaces
- Plan integration flow

**Phase 3:** Implementation
- Create SHA256 utility
- Create DuplicateDetectionDialog component
- Add checkDuplicate to galleryService
- Integrate with UploadDropzone

**Phase 4:** Testing
- Test SHA256 calculation accuracy
- Test duplicate detection flow
- Test all three actions (Skip/Replace/Keep Both)
- Test accessibility

