# 📊 Codebase Analysis - Gallery CRUD Secure Media Infrastructure

**Date**: 2025-01-27  
**Status**: Phase 1 Complete

## ✅ Current State Summary

### Backend Implementation
- **Gallery Service**: ✅ Fully implemented (`backend/src/app/services/gallery_service.py`)
  - CRUD operations with workspace scoping
  - Sub-gallery support (partial - endpoints return 501)
  - Publish/unpublish with validation
  - Soft delete (archived status)

- **Gallery API**: ✅ Implemented (`backend/src/app/api/v1/galleries.py`)
  - List, Create, Get, Update, Delete, Publish endpoints
  - Proper error handling and validation
  - Workspace-scoped access control

- **Database Schema**: ✅ Migrations exist (`backend/migrations/versions/0002_galleries_schema.py`)
  - `galleries` table with all required fields
  - `sub_galleries` table
  - `gallery_assets` table (referenced but not fully implemented)
  - Indexes for performance

### Frontend Implementation
- **Components**: ✅ Partial implementation
  - `GalleryCard`, `GalleryStatusBadge`, `GalleryEmptyState` ✅
  - `GalleryCreateForm`, `GalleryHeader`, `GalleryStats`, `GalleryToolbar` ✅
  - `SubGalleryTabs` ✅ (exists but needs updates)
  - `PhotoGrid`, `PhotoCard`, `Lightbox` ❌ (not implemented)

- **Pages**: ✅ Partial
  - `GalleriesPage` ✅ (list view with search/filter)
  - `GalleryCreatePage` ✅
  - `GalleryDetailPage` ❌ (not implemented)

- **Services**: ✅ Implemented
  - `galleryService.ts` with all CRUD methods
  - Proper TypeScript types in `types/gallery.ts`

- **Hooks**: ✅ Implemented
  - `useGallery`, `useGalleryList`, `useGalleryAssets`

## ⚠️ Gaps Found

### Critical Security Gaps
1. **No Encryption Service** ❌
   - Missing: `backend/src/app/services/encryption_service.py`
   - Required: AES-256-GCM encryption/decryption
   - Required: Workspace key derivation (HKDF-SHA256)
   - Required: Key rotation support

2. **No Signed URL Service** ❌
   - Missing: `backend/src/app/services/signed_url_service.py`
   - Required: Time-limited token generation (1-hour TTL)
   - Required: Token validation with expiry check
   - Required: Workspace/permission verification

3. **No Audit Logging Service** ❌
   - Missing: `backend/src/app/services/media_audit_service.py`
   - Missing: `media_access_logs` table migration
   - Required: Immutable audit log writes
   - Required: SOC2/GDPR compliance logging

4. **No Upload Service** ❌
   - Missing: `backend/src/app/services/upload_service.py`
   - Required: Upload session creation
   - Required: File validation (MIME type, magic bytes)
   - Required: SHA256 checksum verification
   - Required: Encrypted storage integration

5. **No Metadata Extraction Service** ❌
   - Missing: `backend/src/app/services/metadata_service.py`
   - Required: EXIF extraction (camera, lens, ISO, GPS)
   - Required: GPS privacy settings

6. **No Image Processing Service** ❌
   - Missing: `backend/src/app/services/image_processing_service.py`
   - Required: WebP thumbnail generation (512px)
   - Required: WebP preview generation (2048px)

7. **No Media Delivery Service** ❌
   - Missing: Media streaming endpoint `/api/v1/media/{signed_token}`
   - Missing: Signed URL generation endpoint
   - Required: Decryption proxy for all media access

### Database Schema Gaps
1. **Missing Tables**:
   - `workspace_encryption_keys` (key management)
   - `asset_encryption` (encryption metadata per asset)
   - `media_access_logs` (audit trail)

2. **Missing Fields**:
   - `assets` table needs encryption metadata fields
   - `gallery_assets` table needs signed URL refresh tracking

### Frontend Gaps
1. **Missing Components**:
   - `PhotoGrid`, `PhotoCard` (need signed URL integration)
   - `Lightbox` (needs signed URL refresh)
   - `UploadDropzone`, `UploadProgressPanel`, `UploadQueue`
   - `GallerySettingsPanel`, `AccessSettings`, `DownloadSettings`

2. **Missing Features**:
   - Signed URL fetching and refresh logic
   - Upload session management
   - Client-side SHA256 checksum calculation
   - URL expiry handling

## 📋 Dependencies

### Backend Services
- `app.db.postgres` - Database connection pool ✅
- `app.api.dependencies.auth` - Authentication middleware ✅
- `app.services.workspace_service` - Workspace validation ✅
- `app.services.audit_service` - General audit logging (exists, needs media-specific extension)

### Frontend Services
- `services/galleryService.ts` ✅
- `services/apiService.ts` ✅ (needs signed URL methods)
- `hooks/useGallery.ts` ✅
- `hooks/useToast.ts` ✅ (for notifications)

### External Dependencies (Python)
- `cryptography` - For AES-256-GCM encryption (needs to be added)
- `Pillow` - For image processing (needs to be added)
- `exifread` or `piexif` - For EXIF extraction (needs to be added)
- `boto3` or `cloudflare` - For R2 storage (needs to be added)

### External Dependencies (Frontend)
- `crypto-js` or Web Crypto API - For SHA256 checksum (Web Crypto preferred)
- `@dnd-kit/core` - For drag-drop (needs to be added)
- `react-masonry-css` - For masonry grid (needs to be added)

## 🎯 Integration Points

### Backend Files to Create/Update
1. **New Services**:
   - `backend/src/app/services/encryption_service.py` (NEW)
   - `backend/src/app/services/signed_url_service.py` (NEW)
   - `backend/src/app/services/media_audit_service.py` (NEW)
   - `backend/src/app/services/upload_service.py` (NEW)
   - `backend/src/app/services/metadata_service.py` (NEW)
   - `backend/src/app/services/image_processing_service.py` (NEW)

2. **New API Routes**:
   - `backend/src/app/api/v1/uploads.py` (NEW)
   - `backend/src/app/api/v1/media.py` (NEW)

3. **Database Migrations**:
   - `backend/migrations/versions/0003_encryption_tables.py` (NEW)
   - `backend/migrations/versions/0004_media_access_logs.py` (NEW)

4. **Update Existing**:
   - `backend/src/app/services/gallery_service.py` (add signed URL support)
   - `backend/src/app/api/v1/galleries.py` (add asset listing endpoints)

### Frontend Files to Create/Update
1. **New Components**:
   - `frontend/src/components/features/gallery/PhotoGrid.tsx` (NEW)
   - `frontend/src/components/features/gallery/PhotoCard.tsx` (NEW)
   - `frontend/src/components/features/gallery/Lightbox.tsx` (NEW)
   - `frontend/src/components/features/upload/UploadDropzone.tsx` (NEW)
   - `frontend/src/components/features/upload/UploadProgressPanel.tsx` (NEW)

2. **New Services**:
   - `frontend/src/services/uploadService.ts` (NEW)
   - `frontend/src/services/signedUrlService.ts` (NEW)

3. **Update Existing**:
   - `frontend/src/services/galleryService.ts` (add signed URL methods)
   - `frontend/src/types/gallery.ts` (add signed URL types)
   - `frontend/src/components/features/gallery/GalleryCard.tsx` (use signed URLs)

## 🔐 Security Requirements

### Encryption Requirements
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: HKDF-SHA256 from master key + workspace_id
- **Key Rotation**: Support rotation without data loss
- **Storage**: Encrypted files stored with `.enc` extension

### Signed URL Requirements
- **TTL**: 1 hour (3600 seconds)
- **Token Format**: JWT-like signed token with expiry
- **Validation**: Signature verification + expiry check + workspace verification
- **Refresh**: Frontend should refresh URLs before expiry

### Audit Logging Requirements
- **Immutable**: Append-only log table
- **Fields**: timestamp, workspace_id, user_id, asset_id, action, ip_address, user_agent
- **Retention**: 7 years for SOC2 compliance
- **Events**: All media access, downloads, modifications

## 📐 Architecture Decisions

### Encryption Key Management
- **Master Key**: Stored in environment variable `ENCRYPTION_MASTER_KEY` (32 bytes hex)
- **Workspace Keys**: Derived using HKDF-SHA256(master_key, workspace_id)
- **Key Versioning**: Track key_version in `asset_encryption` table for rotation
- **Key Storage**: `workspace_encryption_keys` table with encrypted key material

### Storage Organization
- **Path Format**: `galleries/{gallery_id}/{variant}/{asset_id}/{filename}.enc`
- **Variants**: `original`, `thumbnail`, `preview`
- **Metadata**: Stored in `asset_encryption` table (IV, auth_tag, key_version)

### Signed URL Format
- **Token Structure**: `{workspace_id}:{asset_id}:{variant}:{expiry}:{signature}`
- **Signature**: HMAC-SHA256(secret_key, token_data)
- **Endpoint**: `/api/v1/media/{signed_token}` (validates and streams decrypted content)

## ✅ Next Steps

1. **Phase 2**: Design encryption service architecture
2. **Phase 3**: Implement encryption service + database migrations
3. **Phase 4**: Implement signed URL service
4. **Phase 5**: Implement audit logging service
5. **Phase 6**: Implement upload service with encryption
6. **Phase 7**: Implement media delivery service
7. **Phase 8**: Update frontend to use signed URLs
8. **Phase 9**: Write property tests
9. **Phase 10**: Integration testing

---

**Analysis Complete** ✅  
**Ready for Phase 2: Architecture & Planning**

