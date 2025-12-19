# Phase 2: Architecture Design - Task 11.12 Create Upload Hooks

## 🏗️ Architecture Design Complete

### Hook Design: `useUpload`

**Purpose:**
Unified hook that consolidates all upload logic, state management, and provides a clean API for components.

**Location:** `frontend/src/hooks/useUpload.ts`

### Hook API

```typescript
interface UseUploadOptions {
  workspaceId: string;
  galleryId: string;
  subGalleryId?: string | null;
  onComplete?: (assetId: string) => void;
  onError?: (error: Error, fileId: string) => void;
  onProgress?: (fileId: string, progress: number) => void;
  enableDuplicateDetection?: boolean; // Default: true
  enableBackgroundUpload?: boolean; // Default: true (use Web Worker)
  maxConcurrent?: number; // Default: 3
  retryAttempts?: number; // Default: 3
  retryDelay?: number; // Default: 1000ms
}

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'queued' | 'uploading' | 'verifying' | 'completed' | 'error' | 'paused' | 'cancelled';
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;
  speed?: number; // bytes/sec
  eta?: number; // seconds
  uploadId?: string; // Upload session ID
  assetId?: string; // Asset ID after commit
  error?: string;
  retryCount?: number;
  thumbnail?: string; // Local preview URL
}

interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  uploading: number;
  queued: number;
  paused: number;
  totalBytes: number;
  uploadedBytes: number;
  overallProgress: number; // 0-100
  averageSpeed: number; // bytes/sec
  estimatedTimeRemaining: number; // seconds
}

interface UseUploadReturn {
  // State
  files: UploadFile[];
  progress: UploadProgress;
  isUploading: boolean;
  isPaused: boolean;
  
  // Actions
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  startUpload: () => Promise<void>;
  pauseUpload: (fileId?: string) => void;
  resumeUpload: (fileId?: string) => void;
  cancelUpload: (fileId?: string) => void;
  retryUpload: (fileId: string) => Promise<void>;
  
  // Helpers
  clearCompleted: () => void;
  clearErrors: () => void;
  clearAll: () => void;
}
```

### Architecture Flow

```
User adds files
    ↓
useUpload.addFiles()
    ↓
Validate files
    ↓
Check duplicates (if enabled)
    ↓
Add to queue
    ↓
startUpload() called
    ↓
Process queue (with concurrency limit)
    ↓
For each file:
    ↓
Calculate SHA256
    ↓
Create upload session
    ↓
Upload file (via Web Worker if enabled)
    ↓
Commit upload
    ↓
Emit events (onProgress, onComplete)
    ↓
Update state
```

### Integration Strategy

**Option 1: Replace GalleryUpload logic**
- Refactor `GalleryUpload.tsx` to use `useUpload` hook
- Remove duplicate logic from component
- Keep UI rendering in component

**Option 2: Gradual migration**
- Create hook alongside existing logic
- Migrate components one by one
- Eventually deprecate old patterns

**Recommended: Option 1** - Cleaner, less duplication

### Features

1. **File Management**
   - Add files with validation
   - Remove files
   - Clear completed/errors

2. **Upload Control**
   - Start/pause/resume/cancel
   - Per-file or global control
   - Automatic retry on failure

3. **Progress Tracking**
   - Per-file progress
   - Overall progress
   - Upload speed
   - ETA calculation

4. **Duplicate Detection**
   - Check before upload
   - Show dialog
   - Handle user choice

5. **Error Handling**
   - Retry logic
   - Error state per file
   - Error callbacks

6. **Background Upload**
   - Use Web Worker if enabled
   - Continue when tab inactive
   - Browser notifications

### State Management

**Local State (useState):**
- `files: UploadFile[]` - Upload queue
- `isUploading: boolean` - Upload active flag
- `isPaused: boolean` - Pause state

**Computed State (useMemo):**
- `progress: UploadProgress` - Aggregated progress
- Overall statistics

**Refs:**
- `uploadQueueRef` - Queue instance (if using UploadQueue)
- `workerRef` - Web Worker instance (if enabled)

### Error Handling

**Retry Strategy:**
- Exponential backoff
- Max retry attempts configurable
- Retry delay configurable
- Per-file retry count

**Error Types:**
- Validation errors (no retry)
- Network errors (retry)
- Server errors (retry)
- Duplicate errors (user choice)

### Performance

**Concurrency:**
- Configurable max concurrent uploads
- Adaptive based on connection speed
- Queue management

**Memory:**
- Cleanup object URLs
- Remove completed files (optional)
- Limit queue size

### Integration Points

1. **GalleryUpload.tsx**
   - Replace local state with hook
   - Use hook methods for upload control
   - Display hook state in UI

2. **UploadDropzone.tsx**
   - Optional: Use hook for file management
   - Keep drag-drop UI logic

3. **UploadProgressPanel.tsx**
   - Display hook progress state
   - Use hook controls (pause/resume/cancel)

4. **GalleryDetailPage.tsx**
   - Use hook for upload state
   - Integrate with WebSocket updates

### Dependencies

**Services:**
- `galleryService.ts` - API calls
- `tusUploadService.ts` - TUS protocol (optional)
- `sha256.ts` - Checksum calculation

**Hooks:**
- `useUploadWorker.ts` - Web Worker support (optional)
- `useBrowserCloseWarning.ts` - Browser warning (integrated)
- `useSocket.ts` - Real-time updates (optional)

**Components:**
- `DuplicateDetectionDialog.tsx` - Duplicate handling

### Testing Strategy

**Unit Tests:**
- Hook state management
- File validation
- Progress calculation
- Retry logic

**Integration Tests:**
- Upload flow
- Error handling
- Duplicate detection
- Web Worker integration

### Migration Plan

1. Create `useUpload.ts` hook
2. Test hook in isolation
3. Refactor `GalleryUpload.tsx` to use hook
4. Update `UploadProgressPanel.tsx` to use hook state
5. Remove duplicate logic
6. Update documentation


