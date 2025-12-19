# 🧪 Testing Checklist - Gallery CRUD Secure Media Infrastructure

## Phase 4: Console Verification & Testing

### ✅ Backend API Endpoints Verification

#### Gallery Endpoints
- [x] `GET /api/v1/workspaces/{workspace_id}/galleries` - List galleries
- [x] `POST /api/v1/workspaces/{workspace_id}/galleries` - Create gallery
- [x] `GET /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}` - Get gallery details
- [x] `PATCH /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}` - Update gallery
- [x] `DELETE /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}` - Delete gallery
- [ ] `GET /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets` - List gallery assets ⚠️ **MISSING**
- [ ] `POST /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets/reorder` - Reorder assets

#### Upload Endpoints
- [x] `POST /api/v1/workspaces/{workspace_id}/uploads` - Create upload session
- [x] `POST /api/v1/workspaces/{workspace_id}/uploads/{upload_id}/upload` - Upload file data
- [x] `POST /api/v1/workspaces/{workspace_id}/uploads/{upload_id}/commit` - Commit upload

#### Media Endpoints
- [x] `GET /api/v1/workspaces/{workspace_id}/assets/{asset_id}/url` - Get signed URL
- [x] `GET /media/{signed_token}` - Stream decrypted media

### 🔒 Security Features Verification

#### Encryption
- [ ] Verify AES-256-GCM encryption is applied to all media files
- [ ] Verify workspace-scoped encryption keys are generated correctly
- [ ] Verify encryption metadata (IV, auth_tag, key_version) is stored
- [ ] Test encryption round-trip: encrypt → decrypt → verify content matches

#### Signed URLs
- [ ] Verify signed URLs expire after 1 hour (3600 seconds)
- [ ] Verify signed URLs cannot be reused after expiry
- [ ] Verify signed URLs are workspace-scoped (cannot access other workspace assets)
- [ ] Verify signed URLs include proper permissions (view vs download)

#### Audit Logging
- [ ] Verify all media access is logged to `media_access_logs` table
- [ ] Verify audit logs include: user_id, workspace_id, asset_id, action, timestamp, IP
- [ ] Verify audit logs are immutable (no updates/deletes)
- [ ] Test logging for: thumbnail view, preview view, original view, download

### 📤 Upload Flow Verification

#### Upload Session Creation
- [ ] Verify upload session is created with correct gallery_id
- [ ] Verify upload session expires after 24 hours
- [ ] Verify file validation (type, size) occurs at session creation
- [ ] Verify SHA256 checksum is optional at session creation

#### File Upload
- [ ] Verify file uploads directly to R2 (not through backend)
- [ ] Verify upload progress is tracked correctly
- [ ] Verify large files (>100MB) are handled correctly
- [ ] Verify resumable upload support (S3 multipart)

#### Upload Commit
- [ ] Verify SHA256 checksum is validated on commit
- [ ] Verify file is encrypted before storage
- [ ] Verify WebP thumbnails are generated (512px max)
- [ ] Verify WebP previews are generated (2048px max)
- [ ] Verify original file is preserved
- [ ] Verify EXIF metadata is extracted and stored
- [ ] Verify asset record is created in database
- [ ] Verify gallery_asset record links asset to gallery

### 🖼️ Media Display Verification

#### Signed URL Generation
- [ ] Verify signed URLs are generated for thumbnails
- [ ] Verify signed URLs are generated for previews
- [ ] Verify signed URLs are generated for originals (if download allowed)
- [ ] Verify signed URL cache works correctly
- [ ] Verify signed URL refresh on expiry

#### Photo Grid Display
- [ ] Verify PhotoGrid displays assets correctly
- [ ] Verify lazy loading works (Intersection Observer)
- [ ] Verify batch signed URL fetching works
- [ ] Verify aspect ratios are preserved
- [ ] Verify loading states are shown
- [ ] Verify error states are handled

#### Photo Card Display
- [ ] Verify thumbnails load via signed URLs
- [ ] Verify badges display correctly (favorite, private, video)
- [ ] Verify selection checkbox works
- [ ] Verify hover actions work (favorite, download, more)
- [ ] Verify keyboard navigation works

### 🔐 Workspace Isolation Verification

- [ ] Verify users cannot access galleries from other workspaces
- [ ] Verify users cannot access assets from other workspaces
- [ ] Verify signed URLs are workspace-scoped
- [ ] Verify encryption keys are workspace-scoped
- [ ] Verify audit logs are workspace-scoped

### 📊 Data Integrity Verification

- [ ] Verify gallery stats are calculated correctly (total_items, favorites_count, etc.)
- [ ] Verify sub-gallery filtering works
- [ ] Verify favorites filter works
- [ ] Verify selections filter works
- [ ] Verify search functionality works
- [ ] Verify pagination works correctly

### 🎨 UI/UX Verification

- [ ] Verify GalleryDetailPage loads correctly
- [ ] Verify GalleryHeader displays gallery info correctly
- [ ] Verify GalleryStats displays stats correctly
- [ ] Verify SubGalleryTabs work correctly
- [ ] Verify GalleryToolbar actions work
- [ ] Verify GalleryUpload component works
- [ ] Verify PhotoGrid displays photos correctly
- [ ] Verify PhotoCard interactions work
- [ ] Verify responsive design works on mobile
- [ ] Verify dark mode works correctly

### ⚠️ Error Handling Verification

- [ ] Verify 401 errors trigger token refresh
- [ ] Verify 403 errors show access denied message
- [ ] Verify 404 errors show not found message
- [ ] Verify 500 errors show generic error message (no PII exposed)
- [ ] Verify network errors are handled gracefully
- [ ] Verify upload errors show user-friendly messages
- [ ] Verify signed URL expiry errors trigger refresh

### 🚀 Performance Verification

- [ ] Verify batch signed URL fetching reduces API calls
- [ ] Verify lazy loading reduces initial load time
- [ ] Verify image optimization (WebP) reduces bandwidth
- [ ] Verify pagination reduces data transfer
- [ ] Verify caching reduces redundant requests

### 📝 Missing Implementation Checklist

#### Critical Missing Features
- [ ] **Gallery Assets List Endpoint** - `GET /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets`
  - Frontend expects this endpoint but backend doesn't have it
  - Need to implement in `backend/src/app/api/v1/galleries.py`
  - Should return `GalleryAssetsResponse` with pagination

#### Nice-to-Have Features
- [ ] Lightbox component for full-screen photo viewing
- [ ] Photo list view (table format)
- [ ] Bulk actions (move, delete, download)
- [ ] Drag-and-drop reordering
- [ ] Favorite/selection toggle API endpoints

### 🧪 Test Execution Plan

1. **Unit Tests** (Backend)
   - Test encryption service round-trip
   - Test signed URL generation and validation
   - Test upload service validation
   - Test metadata extraction
   - Test image processing

2. **Integration Tests** (Backend)
   - Test full upload flow (session → upload → commit)
   - Test signed URL generation and streaming
   - Test workspace isolation
   - Test audit logging

3. **E2E Tests** (Frontend)
   - Test gallery creation
   - Test photo upload
   - Test photo display
   - Test signed URL refresh
   - Test filtering and search

4. **Security Tests**
   - Test workspace isolation
   - Test signed URL expiry
   - Test encryption/decryption
   - Test audit logging

5. **Performance Tests**
   - Test batch signed URL fetching
   - Test lazy loading
   - Test large gallery display (1000+ photos)

### 📋 Next Steps

1. **Implement Missing Endpoint**: Gallery Assets List
2. **Run Backend Tests**: Verify all services work correctly
3. **Run Frontend Tests**: Verify all components work correctly
4. **Manual Testing**: Test full user workflow
5. **Security Audit**: Verify SOC2/GDPR compliance
6. **Performance Testing**: Verify optimization works
7. **Documentation**: Update API docs and user guides

