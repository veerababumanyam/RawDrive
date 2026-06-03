package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"io"
	"os"
	"os/exec"

	// Stdlib decoders for the intermediate images the external CLIs emit:
	//   - exiftool/dcraw extract an embedded JPEG preview from RAW.
	//   - heif-convert writes a PNG (or JPEG) from HEIC/HEIF/AVIF.
	// Registered via blank import so image.Decode can sniff whichever the tool
	// produced, but we also call the concrete decoders explicitly below.
	"image/jpeg"
	"image/png"
)

// External-decode tooling. These mirror the cwebp resolution pattern in
// thumbnail_service.go: resolve the binary by name with exec.LookPath and treat
// a missing binary as a TRANSIENT failure (the operator can install the tool
// and the queued message can be retried) rather than dead-lettering a valid
// file forever.
//
// The production runtime image (backend/Dockerfile, alpine, CGO_ENABLED=0)
// installs these via apk: perl-image-exiftool (exiftool), dcraw, and
// libheif-tools (heif-convert). No cgo image libraries are linked — every
// non-web format is decoded out-of-process here.
const (
	binExiftool    = "exiftool"
	binDcraw       = "dcraw"
	binHeifConvert = "heif-convert"
)

// writeReaderToTempFile streams r into a freshly created temp file (the CLI
// tools require an on-disk path, not a stream) and returns the path. The caller
// is responsible for removing the file. A read/write failure here is an
// infrastructure problem (disk full, I/O error) and is treated as transient by
// the decoder callers.
func writeReaderToTempFile(r io.Reader, pattern string) (path string, err error) {
	tmp, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	defer func() {
		if cerr := tmp.Close(); cerr != nil && err == nil {
			err = fmt.Errorf("close temp file: %w", cerr)
		}
	}()
	if _, err = io.Copy(tmp, r); err != nil {
		// Best-effort cleanup; the named return carries the real error.
		_ = os.Remove(tmp.Name())
		return "", fmt.Errorf("write temp file: %w", err)
	}
	return tmp.Name(), nil
}

// rawPreviewDecoder decodes camera RAW files (cr2/cr3/nef/arw/dng/raf/orf/rw2)
// by extracting their embedded full-resolution JPEG preview with an external
// CLI, then decoding that JPEG with the stdlib. There is no pure-Go demosaicer
// for these proprietary RAW formats, and the embedded preview is the camera's
// own full-res render — exactly what we want for thumbnails/display.
//
// Extraction strategy (first that succeeds wins):
//  1. exiftool -b -PreviewImage   (primary; broadest format coverage)
//  2. dcraw -e -c                 (fallback; emits the embedded thumbnail JPEG)
type rawPreviewDecoder struct{}

func newRawPreviewDecoder() *rawPreviewDecoder { return &rawPreviewDecoder{} }

var _ ImageDecoder = (*rawPreviewDecoder)(nil)

func (d *rawPreviewDecoder) Decode(ctx context.Context, _ string, r io.Reader) (image.Image, error) {
	if err := ctx.Err(); err != nil {
		return nil, classifyDecodeError(err)
	}
	if r == nil {
		return nil, &DecodeError{Err: errors.New("nil reader"), Transient: false}
	}

	// The CLIs need a real path; stage the input to a temp file first.
	inPath, err := writeReaderToTempFile(r, "rawdrive-raw-in-*.bin")
	if err != nil {
		// Disk/I/O failure staging the input — transient.
		return nil, &DecodeError{Err: fmt.Errorf("stage raw input: %w", err), Transient: true}
	}
	defer os.Remove(inPath)

	// Resolve the extractors up front so a missing-tool situation is reported as
	// transient (install + retry) rather than mislabeled as a parse failure.
	exiftoolPath, exiftoolErr := exec.LookPath(binExiftool)
	dcrawPath, dcrawErr := exec.LookPath(binDcraw)
	if exiftoolErr != nil && dcrawErr != nil {
		return nil, &DecodeError{
			Err: fmt.Errorf("no RAW preview extractor available (%s: %v; %s: %v)",
				binExiftool, exiftoolErr, binDcraw, dcrawErr),
			Transient: true,
		}
	}

	// Primary: exiftool writes the preview JPEG to stdout with -b -PreviewImage.
	var primaryErr error
	if exiftoolErr == nil {
		jpegBytes, transient, runErr := runCaptureStdout(ctx, exiftoolPath,
			"-b", "-PreviewImage", inPath)
		if runErr == nil && len(jpegBytes) > 0 {
			if img, decErr := jpeg.Decode(bytes.NewReader(jpegBytes)); decErr == nil {
				return img, nil
			} else {
				primaryErr = fmt.Errorf("decode exiftool preview jpeg: %w", decErr)
			}
		} else if transient {
			// A killed/OOM subprocess is transient regardless of fallback.
			return nil, &DecodeError{Err: fmt.Errorf("exiftool preview extract: %w", runErr), Transient: true}
		} else {
			if runErr == nil {
				runErr = errors.New("empty PreviewImage")
			}
			primaryErr = fmt.Errorf("exiftool preview extract: %w", runErr)
		}
	}

	// Fallback: dcraw -e extracts the embedded thumbnail/preview; -c sends it to
	// stdout. Output is typically a JPEG (some bodies emit a TIFF-wrapped
	// preview, but JPEG is the overwhelmingly common case for -e).
	if dcrawErr == nil {
		out, transient, runErr := runCaptureStdout(ctx, dcrawPath, "-e", "-c", inPath)
		if runErr == nil && len(out) > 0 {
			if img, decErr := jpeg.Decode(bytes.NewReader(out)); decErr == nil {
				return img, nil
			} else if img, _, decErr2 := image.Decode(bytes.NewReader(out)); decErr2 == nil {
				// Some dcraw builds emit a PPM/TIFF preview — let the registered
				// stdlib/x-image decoders take a shot before giving up.
				return img, nil
			} else {
				return nil, &DecodeError{
					Err:       fmt.Errorf("decode dcraw preview: %w", decErr),
					Transient: false,
				}
			}
		}
		if transient {
			return nil, &DecodeError{Err: fmt.Errorf("dcraw preview extract: %w", runErr), Transient: true}
		}
		if runErr == nil {
			runErr = errors.New("empty preview output")
		}
		// Both extractors ran and neither produced a usable preview — the bytes
		// have no embedded preview we can read; terminal.
		return nil, &DecodeError{
			Err:       fmt.Errorf("raw preview extraction failed (exiftool: %v; dcraw: %v)", primaryErr, runErr),
			Transient: false,
		}
	}

	// Only exiftool was available and it failed terminally.
	return nil, &DecodeError{
		Err:       fmt.Errorf("raw preview extraction failed: %w", primaryErr),
		Transient: false,
	}
}

// heicDecoder decodes HEIC/HEIF/AVIF by shelling out to libheif's heif-convert,
// which writes a PNG, then decoding that PNG with the stdlib. heif-convert
// infers the output format from the destination extension, so we ask for .png
// (lossless, so no quality loss before the downstream cwebp re-encode).
type heicDecoder struct{}

func newHeicDecoder() *heicDecoder { return &heicDecoder{} }

var _ ImageDecoder = (*heicDecoder)(nil)

func (d *heicDecoder) Decode(ctx context.Context, _ string, r io.Reader) (image.Image, error) {
	if err := ctx.Err(); err != nil {
		return nil, classifyDecodeError(err)
	}
	if r == nil {
		return nil, &DecodeError{Err: errors.New("nil reader"), Transient: false}
	}

	convertPath, lookErr := exec.LookPath(binHeifConvert)
	if lookErr != nil {
		return nil, &DecodeError{
			Err:       fmt.Errorf("%s not available: %w", binHeifConvert, lookErr),
			Transient: true,
		}
	}

	inPath, err := writeReaderToTempFile(r, "rawdrive-heic-in-*.bin")
	if err != nil {
		return nil, &DecodeError{Err: fmt.Errorf("stage heic input: %w", err), Transient: true}
	}
	defer os.Remove(inPath)

	outPath := inPath + ".png"
	defer os.Remove(outPath)

	// heif-convert <in> <out.png>. It exits non-zero on unparseable input.
	if _, transient, runErr := runCaptureStdout(ctx, convertPath, inPath, outPath); runErr != nil {
		if transient {
			return nil, &DecodeError{Err: fmt.Errorf("heif-convert: %w", runErr), Transient: true}
		}
		return nil, &DecodeError{Err: fmt.Errorf("heif-convert failed: %w", runErr), Transient: false}
	}

	pngBytes, readErr := os.ReadFile(outPath)
	if readErr != nil {
		// heif-convert claimed success but produced no readable output —
		// treat the missing artifact as a terminal conversion failure.
		return nil, &DecodeError{
			Err:       fmt.Errorf("read heif-convert output: %w", readErr),
			Transient: false,
		}
	}
	img, decErr := png.Decode(bytes.NewReader(pngBytes))
	if decErr != nil {
		return nil, &DecodeError{Err: fmt.Errorf("decode heif png: %w", decErr), Transient: false}
	}
	return img, nil
}

// runCaptureStdout executes name+args under ctx, returns stdout, and reports
// whether any failure was transient. A transient failure is a killed/OOM
// subprocess or a context deadline/cancel — anything the caller could
// reasonably retry. A non-zero exit on otherwise-healthy execution is terminal
// (the tool rejected the bytes). stderr is folded into the returned error for
// diagnostics but never into stdout.
func runCaptureStdout(ctx context.Context, name string, args ...string) (stdout []byte, transient bool, err error) {
	var outBuf, errBuf bytes.Buffer
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	runErr := cmd.Run()
	if runErr == nil {
		return outBuf.Bytes(), false, nil
	}

	// Context cancellation/deadline → transient.
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, true, fmt.Errorf("%s: %w", name, ctxErr)
	}

	// A subprocess terminated by a signal (e.g. SIGKILL from the OOM killer) is
	// a resource hiccup, not a bad-bytes verdict — retryable.
	var exitErr *exec.ExitError
	if errors.As(runErr, &exitErr) {
		if ws, ok := exitErr.Sys().(interface{ Signaled() bool }); ok && ws.Signaled() {
			return nil, true, fmt.Errorf("%s killed by signal: %w (%s)", name, runErr, errBuf.String())
		}
	}

	// classifyDecodeError already recognizes ENOMEM / "signal: killed" / timeout
	// markers in the message; lean on it so the transient taxonomy stays in one
	// place rather than duplicating string matching here.
	if classifyDecodeError(runErr).Transient {
		return nil, true, fmt.Errorf("%s: %w (%s)", name, runErr, errBuf.String())
	}

	// Plain non-zero exit on healthy execution → the tool rejected the input.
	return nil, false, fmt.Errorf("%s: %w (%s)", name, runErr, errBuf.String())
}
