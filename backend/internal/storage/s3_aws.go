package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// awsS3Client wraps the real AWS SDK S3 client to implement S3Client.
type awsS3Client struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
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
			o.UsePathStyle = true // Required for R2 and MinIO
		}
		// AWS SDK Go v2 v1.36+ flipped the default request-checksum
		// calculation mode to WhenSupported, which means PutObject on
		// an unseekable stream over plain HTTP fails with
		// "unseekable stream is not supported without TLS and trailing
		// checksum". Production R2 is always HTTPS and seekable from
		// our callers, so the default works — but the thumbnail worker
		// pipes cwebp output as an io.Reader into PutObject over the
		// MinIO test endpoint (HTTP), which blew up during UAT on
		// 2026-04-12. Setting WhenRequired narrows the behavior to
		// operations that mandate a checksum header (none of which we
		// use), which restores PutObject's pre-SDK-v1.36 semantics for
		// both R2 and MinIO.
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})

	return &awsS3Client{
		client:    client,
		presigner: s3.NewPresignClient(client),
		bucket:    cfg.Bucket,
	}, nil
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

	_, err := c.client.PutObject(ctx, input)
	if err != nil {
		return fmt.Errorf("aws s3 put: %w", err)
	}
	return nil
}

func (c *awsS3Client) GetObject(ctx context.Context, key string) (io.ReadCloser, error) {
	result, err := c.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
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
	req, err := c.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Duration(expiresInSeconds)*time.Second))
	if err != nil {
		return "", fmt.Errorf("aws s3 presign: %w", err)
	}
	return req.URL, nil
}
