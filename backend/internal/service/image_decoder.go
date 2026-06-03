package service

import (
	"context"
	"errors"
	"fmt"
	"image"
	"io"
	"strings"

	// Pure-Go, CGO-free decoders for TIFF and WebP-input. These are imported
	// HERE (named, not blank) because CompositeDecoder dispatches explicitly on
	// the server-sniffed format token via tiff.Decode / webp.Decode rather than
	// relying on image.Decode's content-based format detection. Importing the
	// packages still registers their format with image.Decode as a side effect,
	// so any incidental image.Decode call elsewhere also gains TIFF/WebP support.
	//
	// IMPORTANT: keep this decode path CGO-free. The production image
	// (backend/Dockerfile) builds CGO_ENABLED=0 static on alpine with no system
	// image libraries, so HEIC/AVIF/RAW are handled out-of-process by external
	// CLIs in stage 2 — never by cgo-linked decoders.
	xtiff "golang.org/x/image/tiff"
	xwebp "golang.org/x/image/webp"

	// Register the stdlib decoders for the always-available web formats.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
)

// ImageDecoder turns stored object bytes into a decoded image, selecting the
// concrete decoder from the SERVER-sniffed format token (see
// service.SniffImageFormat), never the client-supplied content type.
type ImageDecoder interface {
	// Decode reads r and returns the decoded image. format is a normalized
	// lowercase token from SniffImageFormat ("jpeg","png","tiff","heic",…).
	// On failure it returns a *DecodeError so callers can distinguish a
	// transient (retryable) failure from a terminal (poison-message) one.
	Decode(ctx context.Context, format string, r io.Reader) (image.Image, error)
}

// DecodeError wraps a decode failure with a Transient flag the worker uses to
// decide between retry (transient infra/resource hiccup) and dead-lettering
// (terminal parse/format failure — retrying is pointless and just burns CPU).
type DecodeError struct {
	Err       error
	Transient bool
}

func (e *DecodeError) Error() string {
	if e == nil {
		return "<nil decode error>"
	}
	kind := "terminal"
	if e.Transient {
		kind = "transient"
	}
	if e.Err == nil {
		return fmt.Sprintf("image decode failed (%s)", kind)
	}
	return fmt.Sprintf("image decode failed (%s): %v", kind, e.Err)
}

// Unwrap exposes the inner error for errors.Is / errors.As.
func (e *DecodeError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

// classifyDecodeError wraps err in a *DecodeError, inferring whether the failure
// is transient (worth retrying) or terminal (poison message). Resource and
// infrastructure failures — context deadline/cancel, a killed subprocess, OOM,
// or an object-store timeout — are transient. Anything that smells like a
// parse/format/corruption failure is terminal: re-decoding the same bytes will
// fail identically, so the worker must dead-letter rather than loop.
func classifyDecodeError(err error) *DecodeError {
	if err == nil {
		return &DecodeError{Err: nil, Transient: false}
	}

	// Context cancellation / deadline are unambiguous transient signals.
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return &DecodeError{Err: err, Transient: true}
	}

	msg := strings.ToLower(err.Error())

	// Transient infra / resource markers.
	transientMarkers := []string{
		"signal: killed",         // subprocess OOM-killed / SIGKILL
		"killed",                 // generic kill
		"cannot allocate memory", // ENOMEM (Go runtime / syscall)
		"out of memory",
		"enomem",
		"timeout",          // generic I/O / object-store timeout
		"timed out",        // B2/S3 "RequestTimeout"
		"i/o timeout",      // net.Error timeout
		"connection reset", // dropped object-store connection
		"deadline exceeded",
		"context canceled",
		"temporarily unavailable", // EAGAIN-style
		"resource temporarily",
	}
	for _, m := range transientMarkers {
		if strings.Contains(msg, m) {
			return &DecodeError{Err: err, Transient: true}
		}
	}

	// Everything else (parse errors, unknown formats, corrupt payloads,
	// image.ErrFormat, unexpected EOF mid-parse) is terminal. Fail closed
	// toward terminal so we never retry-loop a poison message.
	return &DecodeError{Err: err, Transient: false}
}

// ClassifyDecodeError is the exported entry point the ThumbnailWorker uses to
// turn an arbitrary processing error into a transient-vs-terminal verdict. If
// err is already a *DecodeError (produced by CompositeDecoder.Decode) it is
// returned as-is so an explicit classification from the decoder is honored;
// otherwise the same heuristics as the internal classifier run. A nil err
// yields a nil *DecodeError. This keeps the single source of classification
// truth in this file rather than duplicating the marker list in the worker.
func ClassifyDecodeError(err error) *DecodeError {
	if err == nil {
		return nil
	}
	var de *DecodeError
	if errors.As(err, &de) {
		return de
	}
	return classifyDecodeError(err)
}

// CompositeDecoder is the CGO-free ImageDecoder. It dispatches by the
// server-sniffed format token:
//
//   - jpeg/png/gif  → stdlib image.Decode (registered via blank imports above)
//   - tiff/webp     → golang.org/x/image pure-Go decoders
//   - heic/heif/avif → heicDecoder, shelling out to libheif's heif-convert
//   - RAW families (cr2/cr3/nef/arw/dng/raf/orf/rw2) → rawPreviewDecoder,
//     extracting the embedded full-res JPEG preview via exiftool (primary) or
//     dcraw (fallback) and decoding that with the stdlib.
//
// The external adapters live in image_decoder_external.go. They resolve their
// CLI by exec.LookPath (mirroring thumbnail_service.go's cwebp pattern): a
// missing binary is reported as a TRANSIENT DecodeError so a valid file is
// retried after the operator installs the tool, never dead-lettered. The
// production image (backend/Dockerfile, CGO_ENABLED=0 alpine) ships these via
// apk; no cgo image libraries are linked.
type CompositeDecoder struct {
	heic *heicDecoder
	raw  *rawPreviewDecoder
}

// NewCompositeDecoder returns the default CGO-free decoder with its external
// CLI adapters wired up.
func NewCompositeDecoder() *CompositeDecoder {
	return &CompositeDecoder{
		heic: newHeicDecoder(),
		raw:  newRawPreviewDecoder(),
	}
}

// Compile-time assertion that CompositeDecoder satisfies ImageDecoder.
var _ ImageDecoder = (*CompositeDecoder)(nil)

func (d *CompositeDecoder) Decode(ctx context.Context, format string, r io.Reader) (image.Image, error) {
	// Respect an already-cancelled/expired context before doing any work; this
	// surfaces as a transient error so the caller can retry.
	if err := ctx.Err(); err != nil {
		return nil, classifyDecodeError(err)
	}
	if r == nil {
		return nil, &DecodeError{Err: errors.New("nil reader"), Transient: false}
	}

	// Normalize the token (jpg→jpeg, tif→tiff) so dispatch matches the
	// allowlist's canonical form exactly.
	f := NormalizeImageFormat(format)

	switch f {
	case "jpeg", "png", "gif":
		img, _, err := image.Decode(r)
		if err != nil {
			return nil, classifyDecodeError(fmt.Errorf("decode %s: %w", f, err))
		}
		return img, nil

	case "tiff":
		img, err := xtiff.Decode(r)
		if err != nil {
			return nil, classifyDecodeError(fmt.Errorf("decode tiff: %w", err))
		}
		return img, nil

	case "webp":
		img, err := xwebp.Decode(r)
		if err != nil {
			return nil, classifyDecodeError(fmt.Errorf("decode webp: %w", err))
		}
		return img, nil

	case "heic", "heif", "avif":
		// Out-of-process via libheif's heif-convert. d.heic resolves the CLI
		// per call and classifies tool-missing as transient, conversion failure
		// as terminal.
		return d.heic.Decode(ctx, f, r)

	case "cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2":
		// Out-of-process via exiftool/dcraw embedded-preview extraction. There
		// is no pure-Go demosaicer for these proprietary RAW formats; the
		// camera's embedded full-res JPEG preview is what we decode.
		return d.raw.Decode(ctx, f, r)

	default:
		// Unknown/unsupported token — fail closed, terminal.
		return nil, &DecodeError{
			Err:       fmt.Errorf("unsupported image format %q", f),
			Transient: false,
		}
	}
}
