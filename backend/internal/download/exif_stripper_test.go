package download

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

// buildMinimalJPEG constructs a tiny valid JPEG byte stream with:
//   SOI, APP0 (JFIF), APP1 (EXIF with bogus payload), APP2 (ICC profile chunk),
//   a fake SOS, 2 bytes of scan data, EOI.
// This lets us exercise the stripper without needing a real image fixture for unit tests.
func buildMinimalJPEG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer

	// SOI
	buf.Write([]byte{0xFF, 0xD8})

	// APP0 (JFIF) — keep
	jfifPayload := []byte("JFIF\x00\x01\x02\x00\x01\x00\x01\x00\x00")
	writeSegment(&buf, 0xE0, jfifPayload)

	// APP1 (EXIF) — strip
	exifPayload := append([]byte("Exif\x00\x00"), []byte("SENSITIVE_GPS_AND_CAMERA_SERIAL")...)
	writeSegment(&buf, 0xE1, exifPayload)

	// APP1 (XMP) — conditional
	xmpPayload := append([]byte("http://ns.adobe.com/xap/1.0/\x00"), []byte("<x:xmpmeta>copyright</x:xmpmeta>")...)
	writeSegment(&buf, 0xE1, xmpPayload)

	// APP2 (ICC profile) — keep under print_safe, strip under aggressive
	iccPayload := append([]byte("ICC_PROFILE\x00"), []byte("RGB-ICC-PROFILE-DATA")...)
	writeSegment(&buf, 0xE2, iccPayload)

	// Comment — always strip
	commentPayload := []byte("Taken with Canon R5")
	writeSegment(&buf, 0xFE, commentPayload)

	// SOS (minimal, 2 scan bytes)
	buf.Write([]byte{0xFF, 0xDA})
	binary.Write(&buf, binary.BigEndian, uint16(2+1+2*1+3))
	buf.WriteByte(0x01)            // num components
	buf.Write([]byte{0x01, 0x00})  // component 1 spec
	buf.Write([]byte{0x00, 0x3F, 0x00}) // Ss, Se, Ah/Al
	// 2 bytes of scan data
	buf.Write([]byte{0xAA, 0xBB})

	// EOI
	buf.Write([]byte{0xFF, 0xD9})

	return buf.Bytes()
}

// writeSegment writes 0xFF <marker> <length-be16> <payload> to the buffer,
// where length INCLUDES the 2 length bytes per JPEG spec.
func writeSegment(buf *bytes.Buffer, marker byte, payload []byte) {
	buf.Write([]byte{0xFF, marker})
	length := uint16(2 + len(payload))
	binary.Write(buf, binary.BigEndian, length)
	buf.Write(payload)
}

func TestStripJPEG_PrintSafeRemovesExifKeepsICC(t *testing.T) {
	input := buildMinimalJPEG(t)
	out, result, err := StripJPEG(input, PolicyPrintSafe)
	if err != nil {
		t.Fatalf("StripJPEG failed: %v", err)
	}

	if !result.EXIFRemoved {
		t.Errorf("expected EXIFRemoved=true under print_safe")
	}
	if result.ICCRemoved {
		t.Errorf("print_safe must keep ICC profile")
	}
	if bytes.Contains(out, []byte("SENSITIVE_GPS_AND_CAMERA_SERIAL")) {
		t.Errorf("EXIF payload leaked into output — privacy failure")
	}
	if !bytes.Contains(out, []byte("ICC_PROFILE")) {
		t.Errorf("ICC profile should be preserved under print_safe")
	}
	if !bytes.Contains(out, []byte("JFIF")) {
		t.Errorf("JFIF APP0 should be preserved")
	}
	if bytes.Contains(out, []byte("Canon R5")) {
		t.Errorf("Comment segment should always be stripped")
	}
	if result.StrippedBytes >= result.OriginalBytes {
		t.Errorf("stripped output should be smaller: got %d >= %d", result.StrippedBytes, result.OriginalBytes)
	}
}

func TestStripJPEG_AggressiveRemovesEverything(t *testing.T) {
	input := buildMinimalJPEG(t)
	out, result, err := StripJPEG(input, PolicyAggressive)
	if err != nil {
		t.Fatalf("StripJPEG failed: %v", err)
	}

	if !result.EXIFRemoved || !result.ICCRemoved || !result.XMPRemoved {
		t.Errorf("aggressive should strip EXIF + ICC + XMP, got %+v", result)
	}
	if bytes.Contains(out, []byte("SENSITIVE_GPS_AND_CAMERA_SERIAL")) {
		t.Errorf("EXIF leaked under aggressive")
	}
	if bytes.Contains(out, []byte("ICC_PROFILE")) {
		t.Errorf("ICC should be gone under aggressive")
	}
	if bytes.Contains(out, []byte("xmpmeta")) {
		t.Errorf("XMP should be gone under aggressive")
	}
}

func TestStripJPEG_PrivacyStripsEXIFAndXMP(t *testing.T) {
	input := buildMinimalJPEG(t)
	out, result, err := StripJPEG(input, PolicyPrivacy)
	if err != nil {
		t.Fatalf("StripJPEG failed: %v", err)
	}

	if !result.EXIFRemoved {
		t.Error("privacy should strip EXIF")
	}
	if !result.XMPRemoved {
		t.Error("privacy should strip XMP")
	}
	if result.ICCRemoved {
		t.Error("privacy mode keeps ICC (different from aggressive)")
	}
	if !bytes.Contains(out, []byte("ICC_PROFILE")) {
		t.Error("privacy policy preserves ICC")
	}
}

func TestStripJPEG_PassthroughUnchanged(t *testing.T) {
	input := buildMinimalJPEG(t)
	out, result, err := StripJPEG(input, PolicyPassthrough)
	if err != nil {
		t.Fatalf("StripJPEG failed: %v", err)
	}
	if !bytes.Equal(out, input) {
		t.Error("passthrough must return bytes unchanged")
	}
	if result.EXIFRemoved {
		t.Error("passthrough must not report EXIF removal")
	}
}

func TestStripJPEG_RejectsNonJPEG(t *testing.T) {
	notJPEG := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A} // PNG header
	_, _, err := StripJPEG(notJPEG, PolicyPrintSafe)
	if err == nil {
		t.Error("expected error for non-JPEG input")
	}
}

func TestStripJPEG_PreservesPixelData(t *testing.T) {
	input := buildMinimalJPEG(t)
	out, _, err := StripJPEG(input, PolicyPrintSafe)
	if err != nil {
		t.Fatalf("StripJPEG failed: %v", err)
	}
	// The fake scan bytes should survive unchanged.
	if !bytes.Contains(out, []byte{0xAA, 0xBB}) {
		t.Error("pixel data was corrupted by stripping")
	}
	// SOS marker must still be present
	if !bytes.Contains(out, []byte{0xFF, 0xDA}) {
		t.Error("SOS marker missing from output")
	}
	// EOI must be present
	if !bytes.HasSuffix(out, []byte{0xFF, 0xD9}) {
		t.Error("EOI marker missing from output tail")
	}
}

func TestValidPolicy(t *testing.T) {
	valid := []string{"privacy", "print_safe", "aggressive", "passthrough"}
	for _, p := range valid {
		if !ValidPolicy(p) {
			t.Errorf("expected %q to be valid", p)
		}
	}
	if ValidPolicy("delete_everything") {
		t.Error("unknown policy should be invalid")
	}
}

// TestStripJPEG_RealWeddingPhoto exercises the stripper against a real
// wedding photo from tests/photos/ when the fixture is available.
// Skips gracefully if the fixture directory is not mounted.
func TestStripJPEG_RealWeddingPhoto(t *testing.T) {
	// Walk up the tree to find the repo root (tests/photos/)
	candidates := []string{
		filepath.Join("..", "..", "..", "tests", "photos", "veera.jpg"),
		filepath.Join("..", "..", "tests", "photos", "veera.jpg"),
	}
	var path string
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			path = c
			break
		}
	}
	if path == "" {
		t.Skip("tests/photos/veera.jpg not reachable from this package; skipping integration test")
	}

	input, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	out, result, err := StripJPEG(input, PolicyPrintSafe)
	if err != nil {
		t.Fatalf("StripJPEG on real photo: %v", err)
	}
	if len(out) == 0 {
		t.Fatal("empty output for real photo")
	}
	if len(out) > len(input) {
		t.Errorf("stripped output should be <= original size, got %d > %d", len(out), len(input))
	}
	// Output must still be a valid JPEG
	if out[0] != 0xFF || out[1] != 0xD8 {
		t.Error("output missing SOI marker")
	}
	if out[len(out)-2] != 0xFF || out[len(out)-1] != 0xD9 {
		t.Error("output missing EOI marker")
	}
	t.Logf("veera.jpg: original=%d bytes, stripped=%d bytes, exif=%v, icc=%v, xmp=%v",
		result.OriginalBytes, result.StrippedBytes, result.EXIFRemoved, result.ICCRemoved, result.XMPRemoved)
}
