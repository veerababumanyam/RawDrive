# End-to-End Gallery Workflow Test

This test validates the complete gallery workflow from login to encrypted storage and decrypted download.

## Prerequisites

1. **Backend server running**: The backend API must be running on `http://localhost:8000` (or set `API_BASE_URL` environment variable)
2. **Database**: PostgreSQL must be running and migrations applied
3. **Redis**: Redis must be running
4. **R2 Storage**: Cloudflare R2 must be configured (or use development mode)
5. **Test users**: Test users must be seeded in the database (see `docs/TEST_USERS.md`)

## Installation

Install required dependencies:

```bash
cd backend
pip install -r requirements.txt
```

## Running the Test

### Option 1: Direct Python execution

```bash
cd backend
python -m tests.e2e.test_gallery_workflow
```

### Option 2: Using pytest

```bash
cd backend
pytest tests/e2e/test_gallery_workflow.py -v
```

### Option 3: With custom API URL

```bash
cd backend
API_BASE_URL=http://localhost:8000 python -m tests.e2e.test_gallery_workflow
```

## Test Steps

The test performs the following steps:

1. **Login**: Logs in as `professional@test.rawdrive.in` (password: `Test@123`)
2. **Create Gallery**: Creates a new gallery named "E2E Test Gallery"
3. **Verify R2 Folder**: Verifies the gallery folder structure in R2 storage
4. **Upload Photo**: Uploads a test JPEG image (800x600px) to the gallery
5. **Verify Processing**: Waits for background processing and verifies thumbnail/WebP generation
6. **Verify Metadata**: Verifies EXIF metadata extraction
7. **Verify R2 Storage**: Verifies encrypted files are stored in R2 with correct structure
8. **Verify Gallery View**: Verifies the image appears in the gallery assets list
9. **Test Signed URL**: Tests signed URL generation and media decryption
10. **Test Download**: Tests downloading both WebP and original image files

## Expected Results

All steps should pass (✓) for a successful test run. The test will:

- Create a gallery in the database
- Upload an encrypted image to R2 storage
- Generate thumbnails and WebP previews
- Extract metadata from the image
- Generate signed URLs for secure access
- Decrypt and serve images correctly
- Allow downloading decrypted files

## Troubleshooting

### Test fails at login
- Verify test users are seeded: `cd backend && npm run db:seed`
- Check database connection: `DATABASE_URL` environment variable
- Verify backend is running: `curl http://localhost:8000/health`

### Test fails at upload
- Check R2 credentials: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- Verify R2 bucket exists and is accessible
- Check backend logs for upload errors

### Test fails at processing
- Background workers must be running: `cd backend && npm run workers`
- Check worker logs for processing errors
- Increase wait time in `step_5_verify_processing()` if processing is slow

### Test fails at signed URL
- Verify encryption service is configured: `ENCRYPTION_MASTER_KEY`
- Check signed URL service: `SIGNED_URL_SECRET`
- Verify media endpoint is accessible: `/api/v1/media/{token}`

## Test Output

The test provides colored output:
- ✓ Green: Success
- ✗ Red: Error
- ⚠ Yellow: Warning
- ℹ Blue: Info

Example output:
```
============================================================
Gallery Workflow End-to-End Test
============================================================

ℹ Step 1: Logging in as test user...
✓ Logged in as professional@test.rawdrive.in
✓ Workspace ID: 11111111-1111-1111-1111-111111111003
...
```

## Cleanup

The test creates a gallery named "E2E Test Gallery" which can be manually deleted after testing, or you can add cleanup code to the test script.


