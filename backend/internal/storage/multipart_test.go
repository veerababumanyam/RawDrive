package storage_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/storage"
)

// F-013 (M17 wave 5): multipart upload tests.
//
// Uses a mock that implements both the base S3Client interface and the
// unexported multipart interface S3Driver type-asserts to. The mock
// tracks a per-upload-id parts map so we can assert ordered completion.

type mockMultipartClient struct {
	*mockS3Client // embedded base mock satisfies S3Client

	createErr    error
	uploadErr    error
	completeErr  error
	abortErr     error
	nextUploadID string
	// per-uploadID state
	uploads map[string]*multipartState
}

type multipartState struct {
	key         string
	contentType string
	parts       map[int32][]byte
	completed   bool
	aborted     bool
}

func newMockMultipart() *mockMultipartClient {
	return &mockMultipartClient{
		mockS3Client: newMockS3(),
		nextUploadID: "mp-0001",
		uploads:      make(map[string]*multipartState),
	}
}

func (m *mockMultipartClient) CreateMultipartUpload(_ context.Context, key, contentType string) (string, error) {
	if m.createErr != nil {
		return "", m.createErr
	}
	id := m.nextUploadID
	m.uploads[id] = &multipartState{
		key:         key,
		contentType: contentType,
		parts:       make(map[int32][]byte),
	}
	return id, nil
}

func (m *mockMultipartClient) UploadPart(_ context.Context, _ string, uploadID string, partNumber int32, body io.Reader, _ int64) (string, error) {
	if m.uploadErr != nil {
		return "", m.uploadErr
	}
	state, ok := m.uploads[uploadID]
	if !ok {
		return "", errors.New("unknown upload id")
	}
	data, _ := io.ReadAll(body)
	state.parts[partNumber] = data
	return "etag-" + string(rune('a'+partNumber)), nil
}

func (m *mockMultipartClient) CompleteMultipartUpload(_ context.Context, _ string, uploadID string, parts []storage.CompletedPart) error {
	if m.completeErr != nil {
		return m.completeErr
	}
	state, ok := m.uploads[uploadID]
	if !ok {
		return errors.New("unknown upload id")
	}
	// Assert ascending order
	last := int32(0)
	for _, p := range parts {
		if p.PartNumber <= last {
			return errors.New("parts not in ascending order")
		}
		last = p.PartNumber
	}
	state.completed = true
	return nil
}

func (m *mockMultipartClient) AbortMultipartUpload(_ context.Context, _ string, uploadID string) error {
	if m.abortErr != nil {
		return m.abortErr
	}
	state, ok := m.uploads[uploadID]
	if !ok {
		return nil // idempotent
	}
	state.aborted = true
	delete(m.uploads, uploadID)
	return nil
}

// ─────────────────────────────── Tests ───────────────────────────────

func TestS3Driver_CreateMultipartUpload_Success(t *testing.T) {
	mock := newMockMultipart()
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")

	id, err := driver.CreateMultipartUpload(context.Background(), "ws/asset/key.jpg", "image/jpeg")
	require.NoError(t, err)
	assert.Equal(t, "mp-0001", id)
	assert.Contains(t, mock.uploads, "mp-0001")
	assert.Equal(t, "image/jpeg", mock.uploads["mp-0001"].contentType)
}

func TestS3Driver_UploadPart_Success(t *testing.T) {
	mock := newMockMultipart()
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")

	id, _ := driver.CreateMultipartUpload(context.Background(), "k", "application/octet-stream")
	etag, err := driver.UploadPart(context.Background(), "k", id, 1, bytes.NewReader([]byte("chunk-1")), 7)
	require.NoError(t, err)
	assert.NotEmpty(t, etag)
	assert.Equal(t, []byte("chunk-1"), mock.uploads[id].parts[1])
}

func TestS3Driver_CompleteMultipartUpload_RequiresAscendingParts(t *testing.T) {
	mock := newMockMultipart()
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	id, _ := driver.CreateMultipartUpload(context.Background(), "k", "application/octet-stream")

	err := driver.CompleteMultipartUpload(context.Background(), "k", id, []storage.CompletedPart{
		{PartNumber: 2, ETag: "e2"},
		{PartNumber: 1, ETag: "e1"}, // out of order
	})
	assert.Error(t, err)
}

func TestS3Driver_CompleteMultipartUpload_Success(t *testing.T) {
	mock := newMockMultipart()
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	id, _ := driver.CreateMultipartUpload(context.Background(), "k", "application/octet-stream")

	// Upload 3 parts
	_, _ = driver.UploadPart(context.Background(), "k", id, 1, bytes.NewReader([]byte("a")), 1)
	_, _ = driver.UploadPart(context.Background(), "k", id, 2, bytes.NewReader([]byte("b")), 1)
	_, _ = driver.UploadPart(context.Background(), "k", id, 3, bytes.NewReader([]byte("c")), 1)

	err := driver.CompleteMultipartUpload(context.Background(), "k", id, []storage.CompletedPart{
		{PartNumber: 1, ETag: "e1"},
		{PartNumber: 2, ETag: "e2"},
		{PartNumber: 3, ETag: "e3"},
	})
	require.NoError(t, err)
	assert.True(t, mock.uploads[id].completed)
}

func TestS3Driver_AbortMultipartUpload_RemovesState(t *testing.T) {
	mock := newMockMultipart()
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	id, _ := driver.CreateMultipartUpload(context.Background(), "k", "application/octet-stream")

	err := driver.AbortMultipartUpload(context.Background(), "k", id)
	require.NoError(t, err)
	assert.NotContains(t, mock.uploads, id)
}

func TestS3Driver_MultipartNotSupported_WhenClientLacksCapability(t *testing.T) {
	// Base mockS3Client does NOT implement the multipart interface.
	// Using it should surface ErrMultipartNotSupported on every call.
	plain := newMockS3()
	driver := storage.NewS3DriverWithClient(plain, "test-bucket")

	_, err := driver.CreateMultipartUpload(context.Background(), "k", "image/jpeg")
	assert.ErrorIs(t, err, storage.ErrMultipartNotSupported)

	_, err = driver.UploadPart(context.Background(), "k", "id", 1, bytes.NewReader([]byte("x")), 1)
	assert.ErrorIs(t, err, storage.ErrMultipartNotSupported)

	err = driver.CompleteMultipartUpload(context.Background(), "k", "id", []storage.CompletedPart{{PartNumber: 1, ETag: "e"}})
	assert.ErrorIs(t, err, storage.ErrMultipartNotSupported)

	err = driver.AbortMultipartUpload(context.Background(), "k", "id")
	assert.ErrorIs(t, err, storage.ErrMultipartNotSupported)
}

func TestS3Driver_MultipartCapable_ImplementsInterface(t *testing.T) {
	// Compile-time check runs via the `var _ storage.MultipartCapable = (*storage.S3Driver)(nil)`
	// declaration in multipart.go. This test just keeps the intent documented
	// in the test file too.
	var _ storage.MultipartCapable = (*storage.S3Driver)(nil)
	assert.True(t, true)
}
