# Phase 2: Architecture Design - Task 11.10 Duplicate Detection

## 🏗️ Architecture Design Complete

### Component Structure

```
frontend/src/
├── utils/
│   └── sha256.ts                    # NEW: SHA256 calculation utility
├── services/
│   └── galleryService.ts            # UPDATE: Add checkDuplicate() method
└── components/
    └── features/
        └── upload/
            └── DuplicateDetectionDialog.tsx  # NEW: Dialog component
```

### Component Design

**DuplicateDetectionDialog.tsx**
- **Location:** `frontend/src/components/features/upload/DuplicateDetectionDialog.tsx`
- **Purpose:** Show side-by-side comparison of duplicate files
- **Props:**
  ```typescript
  interface DuplicateDetectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    duplicates: DuplicateAssetResponse[];
    newFile: File;
    newFilePreview?: string;
    onSkip: () => void;
    onReplace: () => void;
    onKeepBoth: () => void;
  }
  ```
- **Features:**
  - Side-by-side thumbnail comparison
  - Metadata comparison table (filename, size, date)
  - Three action buttons: Skip, Replace, Keep Both
  - Keyboard accessible (Escape to close, Tab navigation)
  - Focus trap

### Utility Design

**sha256.ts**
- **Location:** `frontend/src/utils/sha256.ts`
- **Function:**
  ```typescript
  export async function calculateSHA256(file: File): Promise<string>
  ```
- **Implementation:** Web Crypto API (native, no dependencies)
- **Error Handling:** Returns rejected promise on failure

### Service Integration

**galleryService.ts**
- **New Method:**
  ```typescript
  async checkDuplicate(
    workspaceId: string,
    sha256: string,
    galleryId?: string
  ): Promise<CheckDuplicateResponse>
  ```
- **Endpoint:** `POST /api/v1/workspaces/{workspaceId}/uploads/check-duplicate`
- **Request:** `{ sha256: string, gallery_id?: string }`
- **Response:** `{ is_duplicate: boolean, duplicates: DuplicateAssetResponse[] }`

### Integration Flow

**UploadDropzone.tsx Integration:**
1. User selects files
2. For each file:
   - Calculate SHA256 (async)
   - Check duplicates via API
   - If duplicates found → Show dialog
   - Wait for user decision
   - Proceed based on choice:
     - **Skip:** Remove from upload queue
     - **Replace:** Delete existing asset, proceed with upload
     - **Keep Both:** Proceed with upload (backend handles)
3. Call `onFilesSelected` with filtered files

### Design System Compliance

**Colors:**
- Dialog background: `bg-surface`
- Border: `border-border`
- Text: `text-text-primary`
- Warning accent: `text-warning-600`

**Components:**
- `AppCard` for dialog container (variant: `elevated`)
- `AppButton` for actions:
  - Skip: `variant="outline"`
  - Replace: `variant="destructive"`
  - Keep Both: `variant="primary"`

**Spacing:**
- Dialog padding: `p-6`
- Grid gap: `gap-4`
- Section margin: `mb-4`

**Typography:**
- Title: `text-lg font-semibold`
- Metadata: `text-sm text-text-secondary`
- Timestamp: `text-xs text-text-tertiary`

### Accessibility

**WCAG 2.1 AA Compliance:**
- ✅ Dialog role: `role="dialog"` with `aria-modal="true"`
- ✅ Title: `aria-labelledby` pointing to dialog title
- ✅ Description: `aria-describedby` pointing to comparison content
- ✅ Focus trap: Use `useFocusTrap` hook
- ✅ Keyboard: Escape closes, Tab cycles, Enter activates
- ✅ Screen reader: Announce duplicate count

### Error Handling

**SHA256 Calculation:**
- Try/catch around Web Crypto API
- Show error toast if calculation fails
- Fallback: Skip duplicate check, proceed with upload

**API Errors:**
- Network errors: Show error toast, proceed with upload
- 403/404: Log error, proceed with upload
- 500: Show error toast, allow retry

### Performance

**Optimization:**
- Calculate SHA256 in parallel for multiple files
- Batch duplicate checks (if API supports)
- Lazy load thumbnails (use `loading="lazy"`)
- Memoize duplicate comparison results

### Security

**SOC2/GDPR:**
- ✅ SHA256 calculated client-side (no file data sent)
- ✅ Only checksum sent to backend
- ✅ Workspace-scoped (backend enforces)
- ✅ No PII in duplicate check request

### Testing Strategy

**Unit Tests:**
- SHA256 calculation accuracy
- Duplicate detection dialog rendering
- Action button handlers

**Integration Tests:**
- Upload flow with duplicate detection
- Skip/Replace/Keep Both actions
- Error handling

**E2E Tests:**
- Full upload flow with duplicate
- User interaction with dialog
- Keyboard navigation

