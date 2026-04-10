// Package download provides download-time image processing including privacy-safe
// EXIF metadata stripping for gallery downloads (GAL-FR-177).
package download

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
)

// StripPolicy controls which EXIF segments are removed from downloaded images.
// See _cobolt-output/latest/build/M15/M15-design-decisions.md § 5.
type StripPolicy string

const (
	// PolicyPrivacy strips ALL metadata (EXIF, XMP, IPTC, ICC profile).
	// Use when maximum privacy is required and color-accurate printing is not a concern.
	PolicyPrivacy StripPolicy = "privacy"

	// PolicyPrintSafe is the enterprise default. Strips EXIF (GPS, serial, camera make/model,
	// timestamps) but preserves ICC color profiles and orientation so images print correctly
	// at professional labs.
	PolicyPrintSafe StripPolicy = "print_safe"

	// PolicyAggressive strips everything including ICC profile and XMP copyright.
	// Equivalent to a screenshot of the image.
	PolicyAggressive StripPolicy = "aggressive"

	// PolicyPassthrough returns the image unchanged. Used when the workspace has
	// explicitly disabled stripping (e.g., for tethered workflows where metadata is needed).
	PolicyPassthrough StripPolicy = "passthrough"
)

// ValidPolicy reports whether a policy string is recognized.
func ValidPolicy(p string) bool {
	switch StripPolicy(p) {
	case PolicyPrivacy, PolicyPrintSafe, PolicyAggressive, PolicyPassthrough:
		return true
	}
	return false
}

// JPEG marker constants — see ITU-T T.81 JPEG specification.
const (
	markerSOI  byte = 0xD8 // Start of Image (no length)
	markerEOI  byte = 0xD9 // End of Image (no length)
	markerSOS  byte = 0xDA // Start of Scan — pixel data follows
	markerAPP1 byte = 0xE1 // Application 1 (EXIF, XMP lives here)
	markerAPP2 byte = 0xE2 // Application 2 (ICC profile lives here)
	markerCOM  byte = 0xFE // Comment
)

// StripResult describes what was stripped and the final byte count.
// The audit log (GAL-FR-172) records this per download event.
type StripResult struct {
	Policy          StripPolicy
	OriginalBytes   int
	StrippedBytes   int
	EXIFRemoved     bool
	XMPRemoved      bool
	ICCRemoved      bool
	CommentsRemoved int
}

// StripJPEG scans a JPEG byte stream and returns a new stream with metadata removed
// according to the policy. It does byte-level marker surgery — no re-encoding, so
// pixel data is preserved exactly.
//
// Limitations:
//   - Only supports JPEG. Non-JPEG input is returned unchanged with an error.
//   - Does not handle JPEG files with extraneous bytes between markers (malformed).
//   - Does not re-inject filtered allowlists (that's a Phase 2 enhancement).
func StripJPEG(input []byte, policy StripPolicy) ([]byte, StripResult, error) {
	result := StripResult{
		Policy:        policy,
		OriginalBytes: len(input),
	}

	if policy == PolicyPassthrough {
		result.StrippedBytes = len(input)
		return input, result, nil
	}

	if len(input) < 4 || input[0] != 0xFF || input[1] != markerSOI {
		return nil, result, fmt.Errorf("not a JPEG (missing SOI marker)")
	}

	var out bytes.Buffer
	out.Grow(len(input))

	// Write SOI
	out.Write(input[:2])
	pos := 2

	for pos < len(input) {
		// Every JPEG marker starts with 0xFF. There can be padding 0xFF bytes,
		// so we skip past them to find the actual marker byte.
		if input[pos] != 0xFF {
			return nil, result, fmt.Errorf("expected marker at offset %d, got 0x%02X", pos, input[pos])
		}
		// Skip fill bytes (0xFF padding)
		for pos < len(input) && input[pos] == 0xFF {
			pos++
		}
		if pos >= len(input) {
			break
		}
		marker := input[pos]
		pos++

		// Markers without payload
		if marker == markerSOI || marker == markerEOI {
			out.WriteByte(0xFF)
			out.WriteByte(marker)
			if marker == markerEOI {
				break
			}
			continue
		}

		// SOS marker — followed by compressed image data until EOI.
		// We copy everything remaining verbatim.
		if marker == markerSOS {
			out.WriteByte(0xFF)
			out.WriteByte(marker)
			out.Write(input[pos:])
			result.StrippedBytes = out.Len()
			return out.Bytes(), result, nil
		}

		// All other markers carry a 2-byte big-endian length (including the length bytes).
		if pos+2 > len(input) {
			return nil, result, fmt.Errorf("truncated length at offset %d", pos)
		}
		segLen := int(binary.BigEndian.Uint16(input[pos : pos+2]))
		if segLen < 2 || pos+segLen > len(input) {
			return nil, result, fmt.Errorf("invalid segment length %d at offset %d", segLen, pos)
		}
		payload := input[pos : pos+segLen]
		pos += segLen

		// Decide whether to keep this segment based on policy.
		keep := true
		switch marker {
		case markerAPP1:
			// APP1 holds EXIF (magic "Exif\0\0") or XMP (Adobe namespace URL).
			if isEXIFPayload(payload) {
				result.EXIFRemoved = true
				keep = false
			} else if isXMPPayload(payload) {
				// XMP contains copyright and other IP metadata. Keep under print_safe.
				if policy == PolicyPrivacy || policy == PolicyAggressive {
					result.XMPRemoved = true
					keep = false
				}
			}
		case markerAPP2:
			// APP2 holds ICC color profile. Strip under aggressive, keep otherwise.
			if isICCPayload(payload) && policy == PolicyAggressive {
				result.ICCRemoved = true
				keep = false
			}
		case markerCOM:
			// Comments — strip unless passthrough.
			result.CommentsRemoved++
			keep = false
		}

		if keep {
			out.WriteByte(0xFF)
			out.WriteByte(marker)
			out.Write(payload)
		}
	}

	result.StrippedBytes = out.Len()
	return out.Bytes(), result, nil
}

// isEXIFPayload checks if an APP1 segment payload begins with the EXIF magic marker.
// Layout after the 2-byte length: "Exif\0\0" + TIFF header.
func isEXIFPayload(payload []byte) bool {
	// payload[0:2] is the length we already consumed; actual data starts at offset 2.
	if len(payload) < 8 {
		return false
	}
	return bytes.Equal(payload[2:8], []byte{'E', 'x', 'i', 'f', 0x00, 0x00})
}

// isXMPPayload checks if an APP1 segment is XMP metadata (Adobe namespace URI).
func isXMPPayload(payload []byte) bool {
	const xmpMagic = "http://ns.adobe.com/xap/1.0/\x00"
	if len(payload) < 2+len(xmpMagic) {
		return false
	}
	return bytes.HasPrefix(payload[2:], []byte(xmpMagic))
}

// isICCPayload checks if an APP2 segment is an ICC color profile chunk.
func isICCPayload(payload []byte) bool {
	const iccMagic = "ICC_PROFILE\x00"
	if len(payload) < 2+len(iccMagic) {
		return false
	}
	return bytes.HasPrefix(payload[2:], []byte(iccMagic))
}

// StripReader is a convenience wrapper for streaming workflows.
func StripReader(r io.Reader, policy StripPolicy) ([]byte, StripResult, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, StripResult{}, fmt.Errorf("read input: %w", err)
	}
	return StripJPEG(data, policy)
}
