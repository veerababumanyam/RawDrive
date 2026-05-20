// Command encrypt-existing re-wraps every object in the configured B2
// bucket under the current STORAGE_SSE_MODE by copying each object onto
// itself with the appropriate ServerSideEncryption (and, for SSE-C, the
// customer-key) headers. Idempotent: objects already in the target SSE
// state are skipped via a HeadObject pre-check, so a re-run after a
// partial failure resumes where it left off.
//
// Supports two modes, controlled by STORAGE_SSE_MODE:
//
//	AES256 → SSE-B2 (server-managed). Migrates plaintext / unencrypted
//	         objects to SSE-B2. Used in the first migration pass on
//	         2026-05-20 (505/505 copied).
//	SSE-C  → customer-managed key. Migrates SSE-B2 or plaintext objects
//	         to SSE-C using STORAGE_SSE_C_KEY (64-char hex, 32 bytes).
//	         Re-runs on already-SSE-C-with-our-key objects are no-ops.
//
// Reads the same env vars as cmd/api:
//
//	STORAGE_DRIVER=s3   (required, must be s3)
//	STORAGE_SSE_MODE    (required: AES256 or SSE-C)
//	STORAGE_SSE_C_KEY   (required iff SSE-C; 64-char hex AES-256 key)
//	B2_BUCKET_NAME      (required)
//	B2_KEY_ID           (required — maps to S3 AccessKeyID)
//	B2_APPLICATION_KEY  (required — maps to S3 SecretAccessKey)
//	B2_ENDPOINT         (required)
//	B2_REGION           (required)
//
// Usage:
//
//	# dry-run: list + count only, no writes
//	set -a; source .env.backend; set +a
//	go run ./backend/cmd/encrypt-existing/ --dry-run
//
//	# real run:
//	go run ./backend/cmd/encrypt-existing/
//
//	# limit scope (smoke test on first N objects):
//	go run ./backend/cmd/encrypt-existing/ --limit 10
//
// Exit codes:
//
//	0 = success (per-object counts printed)
//	1 = config error
//	2 = some objects failed (count printed; safe to re-run, already-done
//	    objects will be skipped)
package main

import (
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"flag"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "list and count objects; do not copy")
	limit := flag.Int("limit", 0, "stop after processing N objects (0 = unlimited)")
	logEvery := flag.Int("log-every", 50, "log progress every N objects")
	flag.Parse()

	bucket := requireEnv("B2_BUCKET_NAME")
	keyID := requireEnv("B2_KEY_ID")
	appKey := requireEnv("B2_APPLICATION_KEY")
	endpoint := requireEnv("B2_ENDPOINT")
	region := envOr("us-east-005", "B2_REGION")
	sseMode := strings.TrimSpace(os.Getenv("STORAGE_SSE_MODE"))
	if sseMode == "" {
		log.Fatalf("FATAL: STORAGE_SSE_MODE is required (AES256 or SSE-C)")
	}

	// Pre-compute SSE-C key material once if we're in SSE-C mode. All
	// HeadObject / CopyObject calls below reuse these three strings; the
	// raw key bytes never leave this function.
	var (
		sseCActive    bool
		sseCAlgorithm *string
		sseCKeyB64    *string
		sseCKeyMD5B64 *string
	)
	switch sseMode {
	case "AES256", "aws:kms":
		// Server-managed key — nothing to compute.
	case "SSE-C":
		raw := strings.TrimSpace(os.Getenv("STORAGE_SSE_C_KEY"))
		if raw == "" {
			log.Fatalf("FATAL: STORAGE_SSE_MODE=SSE-C requires STORAGE_SSE_C_KEY (64-char hex)")
		}
		keyBytes, err := hex.DecodeString(raw)
		if err != nil {
			log.Fatalf("FATAL: STORAGE_SSE_C_KEY is not valid hex: %v", err)
		}
		if len(keyBytes) != 32 {
			log.Fatalf("FATAL: STORAGE_SSE_C_KEY must decode to 32 bytes (got %d)", len(keyBytes))
		}
		alg := "AES256"
		kB64 := base64.StdEncoding.EncodeToString(keyBytes)
		sum := md5.Sum(keyBytes)
		mB64 := base64.StdEncoding.EncodeToString(sum[:])
		sseCActive = true
		sseCAlgorithm = &alg
		sseCKeyB64 = &kB64
		sseCKeyMD5B64 = &mB64
	default:
		log.Fatalf("FATAL: unsupported STORAGE_SSE_MODE %q", sseMode)
	}

	ctx := context.Background()
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(keyID, appKey, "")),
		awsconfig.WithRegion(region),
	)
	if err != nil {
		log.Fatalf("FATAL: load aws config: %v", err)
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})

	log.Printf("encrypt-existing: bucket=%s endpoint=%s mode=%s dry-run=%v limit=%d",
		bucket, endpoint, sseMode, *dryRun, *limit)

	var (
		total             int
		alreadyAtTarget   int
		copied            int
		skippedZero       int
		failures          int
		wrongKeyObjects   int
		startTime         = time.Now()
		continuationToken *string
	)

	for {
		listOut, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucket),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			log.Fatalf("FATAL: list objects: %v", err)
		}

		for _, obj := range listOut.Contents {
			if *limit > 0 && total >= *limit {
				goto done
			}
			total++
			key := aws.ToString(obj.Key)
			size := aws.ToInt64(obj.Size)

			// B2 has no concept of zero-byte directory markers via the S3
			// API, but defensive skip anyway — CopyObject on an empty key
			// or a 0-byte sentinel sometimes errors.
			if size == 0 {
				skippedZero++
				continue
			}

			// Pre-check: what is the object's CURRENT encryption state?
			// We need to distinguish four cases so we can:
			//   (a) skip work for objects already at the target
			//   (b) issue the right CopyObject for objects needing migration
			//   (c) surface "wrong SSE-C key" objects loudly
			state, headErr := classifyObject(ctx, client, bucket, key,
				sseCActive, sseCAlgorithm, sseCKeyB64, sseCKeyMD5B64)
			if headErr != nil {
				log.Printf("WARN: head %s: %v (will attempt copy anyway)", key, headErr)
				// Fall through to copy attempt; some warning paths still
				// recover via a successful CopyObject.
			}

			// Already at target — skip. For AES256 mode this means
			// the object reports ServerSideEncryption: AES256. For SSE-C
			// mode it means our HEAD-with-key succeeded and returned the
			// SSE-C marker.
			if state == stateAtTarget {
				alreadyAtTarget++
				if total%(*logEvery) == 0 {
					log.Printf("progress: %d scanned (already-at-target=%d copied=%d failures=%d)",
						total, alreadyAtTarget, copied, failures)
				}
				continue
			}

			// Object exists under a DIFFERENT SSE-C key. We can neither
			// read it nor re-encrypt it. Surface loudly and skip — the
			// only fix is to find the original key (or restore from
			// backup). Counting these separately so the operator can see
			// the gap on the final report.
			if state == stateWrongSSECKey {
				wrongKeyObjects++
				log.Printf("ERROR: %s is SSE-C with a key we don't have (HEAD-with-key returned 403). Skipping.", key)
				continue
			}

			if *dryRun {
				if total%(*logEvery) == 0 {
					log.Printf("dry-run: %d scanned (would-copy=%d already-at-target=%d wrong-key=%d)",
						total, total-alreadyAtTarget-skippedZero-wrongKeyObjects, alreadyAtTarget, wrongKeyObjects)
				}
				continue
			}

			// Server-side copy onto self with the target SSE mode.
			// MetadataDirective: COPY preserves Content-Type and user
			// metadata. CopySource for B2's S3 API is the bare
			// "bucket/key" pair (URL-encoded by the SDK).
			copyIn := &s3.CopyObjectInput{
				Bucket:            aws.String(bucket),
				Key:               aws.String(key),
				CopySource:        aws.String(bucket + "/" + key),
				MetadataDirective: s3types.MetadataDirectiveCopy,
			}
			if sseCActive {
				// Destination encryption: customer-managed key.
				copyIn.SSECustomerAlgorithm = sseCAlgorithm
				copyIn.SSECustomerKey = sseCKeyB64
				copyIn.SSECustomerKeyMD5 = sseCKeyMD5B64
				// If the SOURCE is already SSE-C (with the same key, since
				// stateWrongSSECKey was handled above), B2 needs the key
				// on the source side too so it can decrypt before re-
				// encrypting. For SSE-B2 sources, these copy-source-*
				// headers must NOT be sent (B2 returns 400). The
				// classifyObject return tells us which path to take.
				if state == stateSourceSSEC {
					copyIn.CopySourceSSECustomerAlgorithm = sseCAlgorithm
					copyIn.CopySourceSSECustomerKey = sseCKeyB64
					copyIn.CopySourceSSECustomerKeyMD5 = sseCKeyMD5B64
				}
			} else {
				// SSE-B2/SSE-S3 target. Source has no SSE-C state (we
				// would have detected and skipped wrong-key above), so
				// only the dest SSE header is needed.
				copyIn.ServerSideEncryption = s3types.ServerSideEncryptionAes256
			}

			if _, err := client.CopyObject(ctx, copyIn); err != nil {
				log.Printf("ERROR: copy %s: %v", key, err)
				failures++
				continue
			}
			copied++

			if total%(*logEvery) == 0 {
				elapsed := time.Since(startTime).Seconds()
				rate := float64(total) / elapsed
				log.Printf("progress: %d scanned, %d copied, %d already-at-target, %d failures, %d wrong-key (%.1f obj/s)",
					total, copied, alreadyAtTarget, failures, wrongKeyObjects, rate)
			}
		}

		if !aws.ToBool(listOut.IsTruncated) {
			break
		}
		continuationToken = listOut.NextContinuationToken
	}

done:
	elapsed := time.Since(startTime)
	log.Printf("=== FINAL ===")
	log.Printf("mode:               %s", sseMode)
	log.Printf("total scanned:      %d", total)
	log.Printf("already-at-target:  %d (skipped)", alreadyAtTarget)
	log.Printf("zero-byte skipped:  %d", skippedZero)
	log.Printf("wrong SSE-C key:    %d (unrecoverable — needs the original key)", wrongKeyObjects)
	if *dryRun {
		log.Printf("would-copy:        %d", total-alreadyAtTarget-skippedZero-wrongKeyObjects)
	} else {
		log.Printf("copied:            %d", copied)
		log.Printf("failures:          %d", failures)
	}
	log.Printf("elapsed:            %s", elapsed.Round(time.Second))

	if failures > 0 || wrongKeyObjects > 0 {
		os.Exit(2)
	}
}

// Object classification used by the migrator. Each value tells the copy
// stage what kind of CopyObject input to build.
type objectState int

const (
	stateUnknown      objectState = iota
	stateAtTarget                 // Already in the desired SSE state.
	stateSourceSSEC               // Source is SSE-C with OUR key; copy needs CopySource-SSE-C headers.
	stateSourceSSEB2              // Source is SSE-B2; copy needs no source-side SSE-C headers.
	stateSourcePlain              // Source is plaintext; copy needs no source-side SSE headers either.
	stateWrongSSECKey             // Source is SSE-C but with a key we don't hold.
)

// classifyObject inspects a single object's current encryption state via
// HEAD, distinguishing the cases the migrator needs to act on. The logic:
//
//  1. HEAD without any SSE-C key headers.
//     - 200 + SSE-C marker on the object → can't happen on this path
//       (B2/S3 returns 400 if the object is SSE-C and we don't send
//       the customer key, so this branch sees only SSE-B2 / plaintext).
//     - 200 + ServerSideEncryption: AES256 → source is SSE-B2.
//     - 200 + no SSE → source is plaintext.
//     - 400 (InvalidRequest) → object is SSE-C; re-try with our key.
//
//  2. If we re-try with our key:
//     - 200 → source is SSE-C with OUR key (idempotent skip target,
//       or copy with CopySource-SSE-C-* headers).
//     - 403 → source is SSE-C with a DIFFERENT key (unrecoverable).
//
// Returns the classified state PLUS a sentinel state flag for "this
// object is already at the requested target". The "at target" decision
// depends on the active mode (AES256 vs SSE-C), so the caller passes the
// SSE-C key material in if applicable.
func classifyObject(
	ctx context.Context,
	client *s3.Client,
	bucket, key string,
	sseCActive bool,
	sseCAlgorithm, sseCKeyB64, sseCKeyMD5B64 *string,
) (objectState, error) {
	// Plain HEAD first — finds SSE-B2 / plaintext.
	head, err := client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err == nil {
		// SSE-B2 / SSE-S3 marker present?
		if head.ServerSideEncryption == s3types.ServerSideEncryptionAes256 ||
			head.ServerSideEncryption == s3types.ServerSideEncryptionAwsKms {
			if !sseCActive {
				// Target is SSE-B2 too; this object is already done.
				return stateAtTarget, nil
			}
			// Target is SSE-C; this SSE-B2 object needs migration.
			return stateSourceSSEB2, nil
		}
		// No SSE marker at all → plaintext.
		if !sseCActive {
			// Target is SSE-B2; plaintext needs migration.
			return stateSourcePlain, nil
		}
		return stateSourcePlain, nil
	}

	// HEAD failed. If it was a 400, that's the SSE-C-without-key
	// signal. Anything else is a real error.
	// `smithyhttp.ResponseError` is a struct, so the target of errors.As
	// must be *(*ResponseError), i.e. a **ResponseError pointer-to-pointer.
	// Earlier this used `var apiErr smithyhttp.ResponseError` which gave
	// errors.As a *ResponseError target — and that panicked because the
	// struct doesn't implement `error` on its value receiver. Pointer form
	// works because *smithyhttp.ResponseError has Error() defined.
	var apiErr *smithyhttp.ResponseError
	if !errors.As(err, &apiErr) || apiErr.HTTPStatusCode() != 400 {
		return stateUnknown, err
	}
	if !sseCActive {
		// Target is SSE-B2 but the object is SSE-C with an unknown key.
		// We can't read it, so we also can't migrate it.
		return stateWrongSSECKey, nil
	}

	// Re-try HEAD WITH our SSE-C key. If it succeeds, the object is
	// already SSE-C with our key. If it 403s, the key is different.
	head2, err2 := client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket:               aws.String(bucket),
		Key:                  aws.String(key),
		SSECustomerAlgorithm: sseCAlgorithm,
		SSECustomerKey:       sseCKeyB64,
		SSECustomerKeyMD5:    sseCKeyMD5B64,
	})
	if err2 != nil {
		var apiErr2 *smithyhttp.ResponseError
		if errors.As(err2, &apiErr2) && apiErr2.HTTPStatusCode() == 403 {
			return stateWrongSSECKey, nil
		}
		return stateUnknown, err2
	}
	_ = head2
	// 200 with our key — object IS SSE-C with our key. For the SSE-C
	// target mode this is "at target". For AES256 target mode this is
	// unreachable (sseCActive would be false above), but defensive.
	if sseCActive {
		return stateAtTarget, nil
	}
	return stateSourceSSEC, nil
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("FATAL: env var %s is required", key)
	}
	return v
}

func envOr(def string, keys ...string) string {
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return def
}
