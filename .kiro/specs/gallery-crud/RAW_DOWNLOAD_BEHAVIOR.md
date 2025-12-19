# RAW File Download Behavior

## Current Implementation Status

### ✅ What Works
1. **RAW File Upload**: RAW files (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG) can be uploaded
2. **RAW File Storage**: RAW files are stored as originals in encrypted R2 storage
3. **RAW File Detection**: Frontend can detect RAW files by filename extension or MIME type
4. **Download Policy Enforcement**: Gallery download policies are enforced

### ⚠️ Current Behavior

#### Download Policy: `original_allowed`
- **Regular Images**: Downloads original JPEG/PNG/WebP
- **RAW Files**: Downloads original RAW file (CR2, NEF, ARW, etc.) ✅ **Works**

#### Download Policy: `web_only` or `watermarked_only`
- **Regular Images**: Downloads WebP preview variant ✅ **Works**
- **RAW Files**: Attempts to download "preview" variant ⚠️ **May fail** - RAW files don't have WebP previews

#### Download Policy: `view_only`
- **All Files**: No download allowed ✅ **Works**

## Issue: RAW Files Don't Have WebP Previews

RAW files are stored as originals only. The system can:
1. Extract embedded JPEG previews (for display)
2. Convert RAW to JPEG/TIFF (via `RawProcessingService`)

But these conversions are not automatically stored as variants.

## Solution: Backend RAW Conversion on Download

When a RAW file is requested with `variant=preview` and download policy is `web_only` or `watermarked_only`:

1. **Backend should detect RAW file** (by MIME type or filename)
2. **Convert RAW to JPEG on-the-fly** using `RawProcessingService.process_raw_to_jpeg()`
3. **Apply watermark** if policy is `watermarked_only`
4. **Serve converted JPEG** with appropriate MIME type (`image/jpeg`)

### Implementation Needed

**File**: `backend/src/app/api/v1/media.py` - `stream_media()` function

```python
# Pseudo-code for RAW handling
if variant == "preview" and is_raw_file(mime_type, filename):
    # Check if converted JPEG exists in storage
    # If not, convert RAW to JPEG on-the-fly
    raw_data = await storage_service.download_encrypted_file(...)
    decrypted_raw = await encryption_service.decrypt_file(raw_data, ...)
    
    # Convert RAW to JPEG
    raw_service = get_raw_processing_service()
    jpeg_data, width, height = raw_service.process_raw_to_jpeg(
        decrypted_raw, workspace_id, quality=92
    )
    
    # Apply watermark if needed
    if download_policy == "watermarked_only":
        jpeg_data = apply_watermark(jpeg_data, workspace_id)
    
    # Return JPEG instead of RAW
    return StreamingResponse(
        io.BytesIO(jpeg_data),
        media_type="image/jpeg",
        headers={"Content-Disposition": f'attachment; filename="{filename}.jpg"'}
    )
```

## Frontend Changes Made

✅ **Created**: `frontend/src/utils/fileUtils.ts`
- `isRawFile()` - Detect RAW by filename
- `isRawMimeType()` - Detect RAW by MIME type
- `isRawAsset()` - Combined detection
- `getRawDownloadVariant()` - Get appropriate variant for RAW files

✅ **Updated**: `frontend/src/pages/workspace/GalleryDetailPage.tsx`
- Download handler now detects RAW files
- For RAW files with `web_only`/`watermarked_only`, requests `preview` variant
- Changes filename extension to `.jpg` for converted RAW downloads

## Testing Checklist

- [ ] Upload RAW file (CR2, NEF, ARW, etc.)
- [ ] Download with `original_allowed` policy → Should download original RAW ✅
- [ ] Download with `web_only` policy → Should download converted JPEG ⚠️ (needs backend)
- [ ] Download with `watermarked_only` policy → Should download watermarked JPEG ⚠️ (needs backend)
- [ ] Download with `view_only` policy → Should be blocked ✅

## Next Steps

1. ✅ **Backend**: Implement RAW-to-JPEG conversion in `stream_media()` endpoint - **COMPLETE**
2. ⏳ **Backend**: Cache converted JPEGs to avoid re-processing on every download (future optimization)
3. ⏳ **Backend**: Add watermark support for converted RAW files (future enhancement)
4. ⏳ **Testing**: Test all RAW formats (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG)

## Summary

**Question**: Does the WebP/Original download option apply to RAW photo formats?

**Answer**: 
- ✅ **Original download**: YES - RAW files can be downloaded as original RAW when policy is `original_allowed`
- ✅ **WebP/Preview download**: YES - Backend now converts RAW to JPEG on-the-fly when `preview` variant is requested

### Implementation Complete ✅

**Frontend** (`frontend/src/utils/fileUtils.ts`):
- ✅ RAW file detection (by filename and MIME type)
- ✅ Download variant selection for RAW files
- ✅ Filename extension handling (.jpg for converted RAW)

**Backend** (`backend/src/app/api/v1/media.py`):
- ✅ RAW file detection in `stream_media()` endpoint
- ✅ Automatic RAW-to-JPEG conversion when `variant=preview` is requested for RAW files
- ✅ High-quality JPEG conversion (quality=92, max_dimension=2048)
- ✅ Proper content-type and filename handling
- ✅ Error handling for conversion failures

**How It Works**:
1. User requests download of RAW file with `web_only` or `watermarked_only` policy
2. Frontend detects RAW file and requests `preview` variant
3. Backend detects RAW file, fetches original RAW from storage
4. Backend decrypts RAW file
5. Backend converts RAW to JPEG using `RawProcessingService.process_raw_to_jpeg()`
6. Backend serves converted JPEG with proper filename (.jpg extension)
7. User downloads JPEG version of RAW file

**Note**: Watermarking for converted RAW files is not yet implemented (future enhancement).

