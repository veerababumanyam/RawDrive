package storage

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// F-013 (M17 wave 5): multipart upload support on the storage layer.
//
// The TUS upload flow needs direct-to-B2 multipart streaming so
// chunked_upload.go can stop staging bytes on local disk (which is an
// F-008 hard-law violation). This file adds the four multipart
// primitives (create, upload part, complete, abort) behind a
// capability interface so callers that need multipart can type-assert
// a Provider into it.
//
// Only S3Driver (which owns a B2 / S3 / MinIO client) implements
// MultipartCapable. LocalDriver does NOT — and never will, because
// local storage is disabled per F-008. Callers that reach for
// multipart on a non-multipart Provider get ErrMultipartNotSupported.

// ErrMultipartNotSupported is returned when a caller asks a Provider
// for multipart operations but the backend does not support them.
// Callers should fall back to the single-PUT path (for small files)
// or return a 503 to the client.
var ErrMultipartNotSupported = errors.New("storage: multipart not supported on this provider")

// MultipartCapable is the capability interface for providers that
// support S3 multipart uploads. Clients that need TUS-style streaming
// type-assert a Provider into this interface — the existing S3/B2
// driver implements it; the local driver does not.
type MultipartCapable interface {
	CreateMultipartUpload(ctx context.Context, key string, contentType string) (uploadID string, err error)
	UploadPart(ctx context.Context, key string, uploadID string, partNumber int32, body io.Reader, size int64) (etag string, err error)
	CompleteMultipartUpload(ctx context.Context, key string, uploadID string, parts []CompletedPart) error
	AbortMultipartUpload(ctx context.Context, key string, uploadID string) error
}

// CompletedPart is the order-preserving view of one UploadPart result.
// Callers build this from the etag returned by UploadPart and the
// part_number they passed, then hand the full ordered slice to
// CompleteMultipartUpload.
type CompletedPart struct {
	PartNumber int32
	ETag       string
}

// ─────────────────────────────── awsS3Client multipart ───────────────────────────────
//
// These methods are on the real AWS SDK wrapper, not on the S3Client
// interface — the wrapper satisfies a separate multipart interface
// extension (s3MultipartClient) that S3Driver narrows to.

type s3MultipartClient interface {
	CreateMultipartUpload(ctx context.Context, key, contentType string) (string, error)
	UploadPart(ctx context.Context, key, uploadID string, partNumber int32, body io.Reader, size int64) (string, error)
	CompleteMultipartUpload(ctx context.Context, key, uploadID string, parts []CompletedPart) error
	AbortMultipartUpload(ctx context.Context, key, uploadID string) error
}

func (c *awsS3Client) CreateMultipartUpload(ctx context.Context, key, contentType string) (string, error) {
	input := &s3.CreateMultipartUploadInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	// 2026-05-20: SSE on multipart uploads is set ONCE at session
	// creation. S3 / B2 propagate the encryption setting to every
	// UploadPart automatically — no need (and no permission) to
	// re-send the header on each chunk. The final assembled object
	// lands encrypted in the bucket with the same per-object server
	// key as a single-shot PutObject would have used.
	if c.sse != "" {
		input.ServerSideEncryption = c.sse
	}
	out, err := c.client.CreateMultipartUpload(ctx, input)
	if err != nil {
		return "", fmt.Errorf("aws s3 create multipart: %w", err)
	}
	if out.UploadId == nil {
		return "", errors.New("aws s3 create multipart: nil upload id")
	}
	return *out.UploadId, nil
}

func (c *awsS3Client) UploadPart(ctx context.Context, key, uploadID string, partNumber int32, body io.Reader, size int64) (string, error) {
	input := &s3.UploadPartInput{
		Bucket:     aws.String(c.bucket),
		Key:        aws.String(key),
		UploadId:   aws.String(uploadID),
		PartNumber: aws.Int32(partNumber),
		Body:       body,
	}
	if size > 0 {
		input.ContentLength = aws.Int64(size)
	}
	out, err := c.client.UploadPart(ctx, input)
	if err != nil {
		return "", fmt.Errorf("aws s3 upload part %d: %w", partNumber, err)
	}
	if out.ETag == nil {
		return "", fmt.Errorf("aws s3 upload part %d: nil etag", partNumber)
	}
	return *out.ETag, nil
}

func (c *awsS3Client) CompleteMultipartUpload(ctx context.Context, key, uploadID string, parts []CompletedPart) error {
	if len(parts) == 0 {
		return errors.New("aws s3 complete multipart: no parts")
	}
	completed := make([]types.CompletedPart, 0, len(parts))
	for _, p := range parts {
		completed = append(completed, types.CompletedPart{
			PartNumber: aws.Int32(p.PartNumber),
			ETag:       aws.String(p.ETag),
		})
	}
	_, err := c.client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(c.bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: completed,
		},
	})
	if err != nil {
		return fmt.Errorf("aws s3 complete multipart: %w", err)
	}
	return nil
}

func (c *awsS3Client) AbortMultipartUpload(ctx context.Context, key, uploadID string) error {
	_, err := c.client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(c.bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
	})
	if err != nil {
		return fmt.Errorf("aws s3 abort multipart: %w", err)
	}
	return nil
}

// ─────────────────────────────── S3Driver multipart ───────────────────────────────

// CreateMultipartUpload delegates to the underlying multipart-capable
// client. Returns ErrMultipartNotSupported if the client is not
// multipart-capable (e.g. a unit test injecting a plain S3Client).
func (d *S3Driver) CreateMultipartUpload(ctx context.Context, key string, contentType string) (string, error) {
	mpc, ok := d.client.(s3MultipartClient)
	if !ok {
		return "", ErrMultipartNotSupported
	}
	return mpc.CreateMultipartUpload(ctx, key, contentType)
}

// UploadPart delegates to the underlying multipart-capable client.
func (d *S3Driver) UploadPart(ctx context.Context, key string, uploadID string, partNumber int32, body io.Reader, size int64) (string, error) {
	mpc, ok := d.client.(s3MultipartClient)
	if !ok {
		return "", ErrMultipartNotSupported
	}
	return mpc.UploadPart(ctx, key, uploadID, partNumber, body, size)
}

// CompleteMultipartUpload delegates to the underlying multipart-capable
// client. Parts must be in ascending PartNumber order.
func (d *S3Driver) CompleteMultipartUpload(ctx context.Context, key string, uploadID string, parts []CompletedPart) error {
	mpc, ok := d.client.(s3MultipartClient)
	if !ok {
		return ErrMultipartNotSupported
	}
	return mpc.CompleteMultipartUpload(ctx, key, uploadID, parts)
}

// AbortMultipartUpload delegates to the underlying multipart-capable
// client. Safe to call on a non-existent upload ID (S3 returns success).
func (d *S3Driver) AbortMultipartUpload(ctx context.Context, key string, uploadID string) error {
	mpc, ok := d.client.(s3MultipartClient)
	if !ok {
		return ErrMultipartNotSupported
	}
	return mpc.AbortMultipartUpload(ctx, key, uploadID)
}

// Compile-time check that S3Driver satisfies MultipartCapable.
var _ MultipartCapable = (*S3Driver)(nil)
