package repository

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// F-013 (M17 wave 4): upload_sessions repo unit tests.
// Pure constructor + validation tests — DB integration tests live in
// backend/tests/ via testcontainers.

func TestNewUploadSessionsRepo(t *testing.T) {
	repo := NewUploadSessionsRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

func TestUploadSession_ZeroValue(t *testing.T) {
	s := UploadSession{}
	assert.Equal(t, uuid.Nil, s.ID)
	assert.Equal(t, uuid.Nil, s.WorkspaceID)
	assert.Equal(t, uuid.Nil, s.UserID)
	assert.Empty(t, s.TUSUploadID)
	assert.Empty(t, s.Filename)
	assert.Equal(t, int64(0), s.TotalSize)
	assert.Equal(t, int64(0), s.UploadOffset)
	assert.Nil(t, s.R2MultipartUploadID)
	assert.Nil(t, s.CompletedAt)
}

func TestUploadSession_FieldsSet(t *testing.T) {
	wsID := uuid.New()
	userID := uuid.New()
	multipartID := "m-12345"
	now := time.Now()
	s := UploadSession{
		ID:                  uuid.New(),
		WorkspaceID:         wsID,
		UserID:              userID,
		TUSUploadID:         "tus-abc",
		Filename:            "wedding (42).jpg",
		ContentType:         "image/jpeg",
		TotalSize:           52_428_800,
		UploadOffset:        5_242_880,
		ChunkSize:           5_242_880,
		R2MultipartUploadID: &multipartID,
		R2PartETags:         []byte(`[{"part_number":1,"etag":"e1","size":5242880}]`),
		ExpiresAt:           now.Add(24 * time.Hour),
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	assert.NotEqual(t, uuid.Nil, s.ID)
	assert.Equal(t, wsID, s.WorkspaceID)
	assert.Equal(t, userID, s.UserID)
	assert.Equal(t, "tus-abc", s.TUSUploadID)
	assert.Equal(t, "wedding (42).jpg", s.Filename, "filenames with spaces + parens must survive (test-photos rule)")
	assert.Equal(t, "image/jpeg", s.ContentType)
	assert.Equal(t, int64(52_428_800), s.TotalSize)
	assert.Equal(t, int64(5_242_880), s.UploadOffset)
	assert.Equal(t, int64(5_242_880), s.ChunkSize)
	assert.Equal(t, "m-12345", *s.R2MultipartUploadID)
	assert.JSONEq(t, `[{"part_number":1,"etag":"e1","size":5242880}]`, string(s.R2PartETags))
	assert.Equal(t, now.Add(24*time.Hour), s.ExpiresAt)
	assert.Equal(t, now, s.CreatedAt)
	assert.Equal(t, now, s.UpdatedAt)
}

// TestUploadSession_GalleryAlbumFields covers the S3-G4 / AREA-UPLOADER-3
// destination fields: they default to nil (legacy client-link flow) and round-
// trip when set so finalize can link the asset server-side.
func TestUploadSession_GalleryAlbumFields(t *testing.T) {
	s := UploadSession{}
	assert.Nil(t, s.GalleryID, "gallery_id defaults to nil (no server-side link)")
	assert.Nil(t, s.AlbumID, "album_id defaults to nil")

	gID := uuid.New()
	aID := uuid.New()
	s.GalleryID = &gID
	s.AlbumID = &aID
	assert.Equal(t, gID, *s.GalleryID)
	assert.Equal(t, aID, *s.AlbumID)
}

func TestUploadSessionJSONBHelpers(t *testing.T) {
	required, err := uploadSessionRequiredJSONB(nil, "[]")
	assert.NoError(t, err)
	assert.Equal(t, "[]", required)
	assert.True(t, json.Valid([]byte(required)))

	nullable, err := uploadSessionNullableJSONB(nil)
	assert.NoError(t, err)
	assert.Nil(t, nullable)

	nullable, err = uploadSessionNullableJSONB([]byte(`{"scheme":"xchacha20-poly1305"}`))
	assert.NoError(t, err)
	assert.Equal(t, `{"scheme":"xchacha20-poly1305"}`, nullable)

	_, err = uploadSessionRequiredJSONB([]byte(`not-json`), "[]")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid json")

	_, err = uploadSessionNullableJSONB([]byte(`not-json`))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid json")
}

func TestUploadSessionsRepo_CreateNormalizesPlainPhotoJSONB(t *testing.T) {
	repo := NewUploadSessionsRepo(nil)
	session := &UploadSession{
		WorkspaceID: uuid.New(),
		UserID:      uuid.New(),
		TUSUploadID: "tus-plain-photo",
		Filename:    "IMG_0964.JPG",
		ContentType: "image/jpeg",
		TotalSize:   343 * 1024,
		ChunkSize:   5 * 1024 * 1024,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	err := repo.Create(t.Context(), session)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "pool is nil")
	assert.Equal(t, []byte("[]"), session.R2PartETags)
	assert.Nil(t, session.ScanManifest)
	assert.Nil(t, session.MediaEncryption)
	assert.Nil(t, session.SourceMetadata)
}

func TestUploadSessionsRepo_CreateRejectsInvalidJSONBBeforeDB(t *testing.T) {
	repo := NewUploadSessionsRepo(nil)
	session := &UploadSession{
		WorkspaceID:  uuid.New(),
		UserID:       uuid.New(),
		TUSUploadID:  "tus-bad-json",
		Filename:     "IMG_0964.JPG",
		ContentType:  "image/jpeg",
		TotalSize:    343 * 1024,
		ChunkSize:    5 * 1024 * 1024,
		ExpiresAt:    time.Now().Add(24 * time.Hour),
		ScanManifest: []byte(`not-json`),
	}

	err := repo.Create(t.Context(), session)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "scan_manifest json")
	assert.Contains(t, err.Error(), "invalid json")
}

func TestUploadSessionsRepo_CreateValidation(t *testing.T) {
	repo := NewUploadSessionsRepo(nil)
	ctx := t.Context()
	validExpiry := time.Now().Add(24 * time.Hour)

	base := func() *UploadSession {
		return &UploadSession{
			WorkspaceID: uuid.New(),
			UserID:      uuid.New(),
			TUSUploadID: "tus-1",
			Filename:    "f.jpg",
			ContentType: "image/jpeg",
			TotalSize:   1024,
			ChunkSize:   512,
			ExpiresAt:   validExpiry,
		}
	}

	cases := []struct {
		name    string
		mutate  func(*UploadSession) *UploadSession
		wantErr string
	}{
		{"nil session", func(_ *UploadSession) *UploadSession { return nil }, "nil session"},
		{"zero workspace_id", func(s *UploadSession) *UploadSession { s.WorkspaceID = uuid.Nil; return s }, "workspace_id required"},
		{"zero user_id", func(s *UploadSession) *UploadSession { s.UserID = uuid.Nil; return s }, "user_id required"},
		{"empty tus_upload_id", func(s *UploadSession) *UploadSession { s.TUSUploadID = ""; return s }, "tus_upload_id required"},
		{"empty filename", func(s *UploadSession) *UploadSession { s.Filename = ""; return s }, "filename required"},
		{"zero total_size", func(s *UploadSession) *UploadSession { s.TotalSize = 0; return s }, "total_size must be positive"},
		{"negative total_size", func(s *UploadSession) *UploadSession { s.TotalSize = -1; return s }, "total_size must be positive"},
		{"zero chunk_size", func(s *UploadSession) *UploadSession { s.ChunkSize = 0; return s }, "chunk_size must be positive"},
		{"zero expires_at", func(s *UploadSession) *UploadSession { s.ExpiresAt = time.Time{}; return s }, "expires_at required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := base()
			s = tc.mutate(s)
			err := repo.Create(ctx, s)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantErr)
		})
	}
}

func TestUploadSessionsRepo_UpdateOffsetRejectsNegative(t *testing.T) {
	repo := NewUploadSessionsRepo(nil)
	err := repo.UpdateOffset(t.Context(), "tus-1", -1)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "non-negative")
}

func TestUploadPartETag_JSONShape(t *testing.T) {
	p := UploadPartETag{
		PartNumber: 1,
		ETag:       "abc123",
		Size:       5_242_880,
		SHA256:     "deadbeef",
	}
	assert.Equal(t, 1, p.PartNumber)
	assert.Equal(t, "abc123", p.ETag)
	assert.Equal(t, int64(5_242_880), p.Size)
	assert.Equal(t, "deadbeef", p.SHA256)
}
