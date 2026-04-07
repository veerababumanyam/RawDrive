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

type mockS3Client struct {
	objects    map[string][]byte
	putErr     error
	getErr     error
	deleteErr  error
	presignErr error
	presignURL string
}

func newMockS3() *mockS3Client {
	return &mockS3Client{
		objects:    make(map[string][]byte),
		presignURL: "https://s3.example.com/bucket/key?signed=true",
	}
}

func (m *mockS3Client) PutObject(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	if m.putErr != nil {
		return m.putErr
	}
	data, _ := io.ReadAll(body)
	m.objects[key] = data
	return nil
}
func (m *mockS3Client) GetObject(_ context.Context, key string) (io.ReadCloser, error) {
	if m.getErr != nil {
		return nil, m.getErr
	}
	data, ok := m.objects[key]
	if !ok {
		return nil, errors.New("NoSuchKey")
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}
func (m *mockS3Client) DeleteObject(_ context.Context, key string) error {
	if m.deleteErr != nil {
		return m.deleteErr
	}
	delete(m.objects, key)
	return nil
}
func (m *mockS3Client) PresignGetObject(_ context.Context, _ string, _ int64) (string, error) {
	if m.presignErr != nil {
		return "", m.presignErr
	}
	return m.presignURL, nil
}

func TestS3Driver_PutSuccess(t *testing.T) {
	mock := newMockS3()
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	err := driver.Put(context.Background(), "key", bytes.NewReader([]byte("data")), 4, "text/plain")
	require.NoError(t, err)
	assert.Equal(t, []byte("data"), mock.objects["key"])
}

func TestS3Driver_PutError(t *testing.T) {
	mock := newMockS3()
	mock.putErr = errors.New("access denied")
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	err := driver.Put(context.Background(), "key", bytes.NewReader([]byte("x")), 1, "text/plain")
	assert.Error(t, err)
}

func TestS3Driver_GetSuccess(t *testing.T) {
	mock := newMockS3()
	mock.objects["f.txt"] = []byte("hello s3")
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	reader, err := driver.Get(context.Background(), "f.txt")
	require.NoError(t, err)
	defer reader.Close()
	got, _ := io.ReadAll(reader)
	assert.Equal(t, []byte("hello s3"), got)
}

func TestS3Driver_GetNotFound(t *testing.T) {
	mock := newMockS3()
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	_, err := driver.Get(context.Background(), "missing")
	assert.Error(t, err)
}

func TestS3Driver_DeleteSuccess(t *testing.T) {
	mock := newMockS3()
	mock.objects["del"] = []byte("bye")
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	require.NoError(t, driver.Delete(context.Background(), "del"))
	_, exists := mock.objects["del"]
	assert.False(t, exists)
}

func TestS3Driver_PresignSuccess(t *testing.T) {
	mock := newMockS3()
	mock.presignURL = "https://signed.url"
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	url, err := driver.PresignURL(context.Background(), "key", storage.PresignOptions{ExpiresInSeconds: 900})
	require.NoError(t, err)
	assert.Equal(t, "https://signed.url", url)
}

func TestS3Driver_PresignError(t *testing.T) {
	mock := newMockS3()
	mock.presignErr = errors.New("presign failed")
	driver := storage.NewS3DriverWithClient(mock, "test-bucket")
	_, err := driver.PresignURL(context.Background(), "key", storage.PresignOptions{ExpiresInSeconds: 900})
	assert.Error(t, err)
}
