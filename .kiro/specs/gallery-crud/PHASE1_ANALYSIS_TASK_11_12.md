# Phase 1: Codebase Analysis - Task 11.12 Create Upload Hooks

## 📊 Codebase Analysis Complete

### ✅ Current State

**Existing Upload Components:**
- ✅ `GalleryUpload.tsx` - Main upload component with file selection and upload logic
- ✅ `UploadDropzone.tsx` - Drag-drop file uploader
- ✅ `UploadProgressPanel.tsx` - Progress display component
- ✅ `UploadQueue.tsx` - Queue management with adaptive concurrency
- ✅ `useUploadWorker.ts` - Web Worker hook for background uploads
- ✅ `useBrowserCloseWarning.ts` - Browser close warning hook

**Existing Upload Logic:**
- ✅ Upload session creation (`galleryService.createUploadSession`)
- ✅ Upload commit (`galleryService.commitUpload`)
- ✅ SHA256 checksum calculation (`utils/sha256.ts`)
- ✅ Duplicate detection (`DuplicateDetectionDialog.tsx`)
- ✅ TUS resumable upload (`tusUploadService.ts`)

**Current Upload Flow:**
1. User selects files in `GalleryUpload`
2. Files validated and added to state
3. Upload starts via `uploadFile` callback
4. SHA256 calculated, session created
5. File uploaded to R2
6. Upload committed with checksum
7. Background processing enqueued

### ⚠️ Gaps Found

1. **No unified upload hook**
   - Upload logic scattered across components
   - No single source of truth for upload state
   - Difficult to reuse upload logic in other components
   - No centralized error handling

2. **No upload state management**
   - State managed locally in `GalleryUpload`
   - No way to track uploads across components
   - No persistence of upload queue state

3. **No upload progress aggregation**
   - Progress tracked per-file
   - No overall progress calculation
   - No upload speed/ETA calculation

4. **No upload retry logic**
   - No automatic retry on failure
   - No retry configuration

### 📋 Dependencies

**Services:**
- `galleryService.ts` - Upload session and commit API calls
- `tusUploadService.ts` - TUS resumable upload protocol
- `sha256.ts` - Checksum calculation
- `galleryService.checkDuplicate()` - Duplicate detection

**Components:**
- `GalleryUpload.tsx` - Will use the hook
- `UploadDropzone.tsx` - Can use the hook
- `UploadProgressPanel.tsx` - Will display hook state
- `UploadQueue.tsx` - Can be integrated into hook

**Hooks:**
- `useUploadWorker.ts` - Background upload support
- `useBrowserCloseWarning.ts` - Browser close warning
- `useSocket.ts` - Real-time updates (optional)

### 🎯 Integration Points

**Exact Files:**

1. **New Hook:**
   - `frontend/src/hooks/useUpload.ts` - NEW unified upload hook

2. **Components to Update:**
   - `frontend/src/components/features/gallery/GalleryUpload.tsx` - Use hook instead of local state
   - `frontend/src/components/features/upload/UploadDropzone.tsx` - Optional hook integration
   - `frontend/src/pages/workspace/GalleryDetailPage.tsx` - Use hook for upload state

3. **Types:**
   - `frontend/src/types/gallery.ts` - Add upload-related types

### 📐 Design System Compliance

**No UI changes needed** - This is a logic hook that will be used by existing components.

### 🔒 Security & Compliance

**SOC2/GDPR:**
- ✅ SHA256 checksum verification
- ✅ Workspace-scoped uploads
- ✅ Secure token handling
- ✅ No PII in upload state

### 📝 Requirements Mapping

**Requirement 5.17-5.26:** Upload progress, resumable uploads, duplicate detection, background uploads

### 🎨 Architecture Pattern

**Hook Structure:**
```typescript
interface UseUploadOptions {
  workspaceId: string;
  galleryId: string;
  subGalleryId?: string | null;
  onComplete?: (assetId: string) => void;
  onError?: (error: Error) => void;
}

interface UseUploadReturn {
  // State
  files: UploadFile[];
  isUploading: boolean;
  progress: UploadProgress;
  errors: UploadError[];
  
  // Actions
  addFiles: (files: File[]) => void;
  removeFile: (fileId: string) => void;
  startUpload: () => Promise<void>;
  pauseUpload: (fileId?: string) => void;
  resumeUpload: (fileId?: string) => void;
  cancelUpload: (fileId?: string) => void;
  retryUpload: (fileId: string) => void;
  
  // Helpers
  clearCompleted: () => void;
  clearErrors: () => void;
}
```

### ✅ Next Steps

**Phase 2:** Architecture Design
- Design hook API
- Define state structure
- Plan integration with existing components
- Design retry logic

**Phase 3:** Implementation
- Create `useUpload.ts` hook
- Integrate with `GalleryUpload.tsx`
- Add upload state management
- Add retry logic

**Phase 4:** Testing
- Test hook functionality
- Test integration with components
- Test error handling
- Test retry logic


