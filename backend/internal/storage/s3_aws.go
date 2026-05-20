package storage

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// awsS3Client wraps the real AWS SDK S3 client to implement S3Client.
type awsS3Client struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
	// sse, when non-empty, requests server-side encryption on every PUT
	// and CreateMultipartUpload. "AES256" maps to SSE-B2 against
	// Backblaze's S3-compatible API and SSE-S3 against AWS S3 — both
	// providers manage their own keys, decrypt transparently on GET, and
	// honour the same wire-level header. Sourced from
	// storage.Config.SSEMode (env: STORAGE_SSE_MODE).
	sse s3types.ServerSideEncryption

	// sseCActive is true when SSEMode == "SSE-C". When active, every
	// PUT / GET / HEAD / Copy / multipart op must carry the three
	// customer-key headers: algorithm (AES256), base64(raw key),
	// base64(md5(raw key)). B2 stores only the MD5 and uses it to
	// verify subsequent requests use the right key. The three string
	// fields below are precomputed once at construction so we don't
	// hash the key on every request.
	sseCActive    bool
	sseCAlgorithm *string // always "AES256" when sseCActive
	sseCKeyB64    *string // base64-encoded 32-byte AES key
	sseCKeyMD5B64 *string // base64-encoded MD5 of raw key bytes
}

func newAWSS3Client(cfg Config) (S3Client, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		),
		awsconfig.WithRegion(cfg.Region),
	)
	if err != nil {
		return nil, fmt.Errorf("aws s3: load config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
			o.UsePathStyle = true // Required for B2 and MinIO
		}
		// AWS SDK Go v2 v1.36+ flipped the default request-checksum
		// calculation mode to WhenSupported, which means PutObject on
		// an unseekable stream over plain HTTP fails with
		// "unseekable stream is not supported without TLS and trailing
		// checksum". Production B2 is always HTTPS and seekable from
		// our callers, so the default works — but the thumbnail worker
		// pipes cwebp output as an io.Reader into PutObject over the
		// MinIO test endpoint (HTTP), which blew up during UAT on
		// 2026-04-12. Setting WhenRequired narrows the behavior to
		// operations that mandate a checksum header (none of which we
		// use), which restores PutObject's pre-SDK-v1.36 semantics for
		// both B2 and MinIO.
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})

	// Map STORAGE_SSE_MODE to the typed s3 enum. Empty disables SSE
	// (back-compat); known values pass through. Anything else fails fast
	// at construction so an operator typo doesn't silently leave objects
	// unencrypted in production.
	var sse s3types.ServerSideEncryption
	var sseCActive bool
	switch strings.TrimSpace(cfg.SSEMode) {
	case "":
		// SSE disabled — objects still live on B2's encrypted disks but
		// without the customer-visible SSE-B2 key envelope.
	case "AES256":
		sse = s3types.ServerSideEncryptionAes256
	case "aws:kms":
		sse = s3types.ServerSideEncryptionAwsKms
	case "SSE-C":
		// Customer-managed key. Validated below — must succeed before
		// we hand back a client that would otherwise silently send
		// unencrypted PUTs.
		sseCActive = true
	default:
		return nil, fmt.Errorf("storage: unsupported STORAGE_SSE_MODE %q (allowed: AES256, aws:kms, SSE-C, or empty)", cfg.SSEMode)
	}

	c := &awsS3Client{
		client:    client,
		presigner: s3.NewPresignClient(client),
		bucket:    cfg.Bucket,
		sse:       sse,
	}

	if sseCActive {
		// Required-key validation. Fail FAST at startup if the key is
		// missing, wrong length, or unparseable — a misconfigured
		// process must never get far enough to make B2 calls without
		// the customer key headers.
		raw := strings.TrimSpace(cfg.SSECustomerKeyHex)
		if raw == "" {
			return nil, fmt.Errorf("storage: STORAGE_SSE_MODE=SSE-C requires STORAGE_SSE_C_KEY (64-char hex of a 32-byte AES key)")
		}
		keyBytes, err := hex.DecodeString(raw)
		if err != nil {
			return nil, fmt.Errorf("storage: STORAGE_SSE_C_KEY is not valid hex: %w", err)
		}
		if len(keyBytes) != 32 {
			return nil, fmt.Errorf("storage: STORAGE_SSE_C_KEY must decode to exactly 32 bytes (got %d)", len(keyBytes))
		}
		keyB64 := base64.StdEncoding.EncodeToString(keyBytes)
		sum := md5.Sum(keyBytes)
		md5B64 := base64.StdEncoding.EncodeToString(sum[:])
		alg := "AES256"
		c.sseCActive = true
		c.sseCAlgorithm = &alg
		c.sseCKeyB64 = &keyB64
		c.sseCKeyMD5B64 = &md5B64
	}

	return c, nil
}

func (c *awsS3Client) PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	// AWS SDK Go v2 requires a seekable body so it can compute the
	// request's payload hash for SigV4 signing before dispatching.
	// Our thumbnail pipeline pipes cwebp output through an io.Reader
	// (not a ReadSeeker), which made PutObject fail with "failed to
	// seek body to start" during UAT. Buffer the content into a
	// bytes.Reader here so every PutObject call sees a seekable body.
	// The buffer is bounded by size when the caller provides it; the
	// fallback io.ReadAll path is safe because derivative thumbnails
	// are always a few hundred KB at most.
	var seekable io.ReadSeeker
	if rs, ok := body.(io.ReadSeeker); ok {
		seekable = rs
	} else {
		buf, err := io.ReadAll(body)
		if err != nil {
			return fmt.Errorf("aws s3 put: buffer body: %w", err)
		}
		if size > 0 && int64(len(buf)) != size {
			// Caller lied about size. Trust the actual bytes.
			size = int64(len(buf))
		}
		seekable = bytes.NewReader(buf)
	}

	input := &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		Body:        seekable,
		ContentType: aws.String(contentType),
	}
	if size > 0 {
		input.ContentLength = aws.Int64(size)
	}
	// 2026-05-20: when STORAGE_SSE_MODE is set, tell the backend to wrap
	// this object in server-managed encryption. B2's S3 API honours
	// `x-amz-server-side-encryption: AES256` as SSE-B2; AWS S3 honours
	// the same header as SSE-S3. No client-side key handling, transparent
	// on GET. The header MUST be set on PutObject (this path is used by
	// the legacy direct-upload + every WebP derivative the thumbnail
	// pipeline writes, so a single line here also encrypts every
	// derivative). For chunked uploads the equivalent header lives on
	// CreateMultipartUpload — see multipart.go.
	if c.sse != "" {
		input.ServerSideEncryption = c.sse
	}
	// SSE-C: pass our customer key on the wire. B2 derives the encryption
	// key from these headers, encrypts the bytes, and stores only the MD5
	// of the key — never the key itself. Every subsequent read/head/copy
	// of this object MUST present the same key.
	if c.sseCActive {
		input.SSECustomerAlgorithm = c.sseCAlgorithm
		input.SSECustomerKey = c.sseCKeyB64
		input.SSECustomerKeyMD5 = c.sseCKeyMD5B64
	}

	_, err := c.client.PutObject(ctx, input)
	if err != nil {
		return fmt.Errorf("aws s3 put: %w", err)
	}
	return nil
}

func (c *awsS3Client) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}
	// SSE-C reads require the same key headers that were sent on PUT.
	// B2 uses the headers to derive the decryption key on the fly,
	// verifies against the stored MD5, and rejects with 403 if they
	// don't match. Without these headers, a GET on an SSE-C object
	// returns 400 Bad Request.
	if c.sseCActive {
		input.SSECustomerAlgorithm = c.sseCAlgorithm
		input.SSECustomerKey = c.sseCKeyB64
		input.SSECustomerKeyMD5 = c.sseCKeyMD5B64
	}
	result, err := c.client.GetObject(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("aws s3 get: %w", err)
	}
	return result.Body, nil
}

func (c *awsS3Client) DeleteObject(ctx context.Context, key string) error {
	_, err := c.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("aws s3 delete: %w", err)
	}
	return nil
}

func (c *awsS3Client) PresignGetObject(ctx context.Context, key string, expiresInSeconds int64) (string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}
	// SSE-C: when active, the presigned URL by itself is not enough — the
	// client that fetches it must also send the SSE-C key headers. The SDK
	// can pre-sign the request including those headers; that means the
	// signed URL is only usable by someone who already holds the key, which
	// defeats the typical "share a signed URL" use case. We keep this
	// branch wired for symmetry, but note: nothing in the current handler
	// surface calls PresignURL in production (asset_service.go comment
	// confirms it was replaced by the JWT-gated /storage/* proxy). If a
	// future flow needs SSE-C-aware presigning, ensure the URL is consumed
	// only by trusted endpoints that hold the key.
	if c.sseCActive {
		input.SSECustomerAlgorithm = c.sseCAlgorithm
		input.SSECustomerKey = c.sseCKeyB64
		input.SSECustomerKeyMD5 = c.sseCKeyMD5B64
	}
	req, err := c.presigner.PresignGetObject(ctx, input,
		s3.WithPresignExpires(time.Duration(expiresInSeconds)*time.Second))
	if err != nil {
		return "", fmt.Errorf("aws s3 presign: %w", err)
	}
	return req.URL, nil
}
