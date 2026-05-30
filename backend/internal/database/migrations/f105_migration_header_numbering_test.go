package migrations

// Regression test for F-105.
//
// Root cause: when migration slots were renumbered, the FIRST-LINE header
// comment of 114_marketplace_inquiry_reply kept a stale self-label that named
// the WRONG migration number:
//
//	114_marketplace_inquiry_reply.up.sql  first line was  "-- Migration 109: ..."
//
// The sibling 115_inquiry_messages files have the same class of defect
// ("-- Migration 110: ..."), owned by a different fix in this wave. Two
// distinct migrations both claimed "110" — one survived as 115, the other
// (the workspaces.face_recognition_enabled column adder, old slot 110, commit
// 7d918a0) was lost in the renumbering. The mismatched self-label obscured
// that loss and is the documentary footprint of F-006.
//
// Scope of this guard (deliberately narrow): only the FIRST non-empty comment
// line is examined, and only when it is a SELF-LABEL of the form
// "-- Migration N: ...". That colon form is how a migration declares its own
// number. Body prose that merely references OTHER migrations
// ("Migration 022 created ...", "from migration 039", "Migration 110 introduced
// ...") is intentionally NOT matched — those are correct cross-references, not
// mislabels, and flagging them would produce false positives on legitimate,
// non-owned files. This is a pure-unit, hermetic check (no database required).

import (
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// filePrefixRe extracts the leading NNN_ numeric prefix from a migration file
// name, e.g. "114_marketplace_inquiry_reply.up.sql" -> "114".
var filePrefixRe = regexp.MustCompile(`^(\d+)_`)

// selfLabelRe matches a first-line SELF-LABEL header that declares THIS file's
// own migration number, e.g. "-- Migration 114: add reply_message ...". The
// trailing colon is the disambiguator that distinguishes a self-label from a
// prose cross-reference to another migration. Capture group 1 is the number.
var selfLabelRe = regexp.MustCompile(`^\s*--\s*Migration\s+(\d+)\s*:`)

// firstCommentLine returns the first non-empty line of the file, trimmed.
func firstCommentLine(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(name) //nolint:gosec // fixed-set local migration file
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.TrimSpace(line) != "" {
			return line
		}
	}
	return ""
}

// assertSelfLabelMatchesFile fails if the file's first-line "-- Migration N:"
// self-label disagrees with the numeric NNN_ prefix in its file name. Files
// whose first line is not a self-label are accepted (nothing to drift).
func assertSelfLabelMatchesFile(t *testing.T, name string) {
	t.Helper()

	pm := filePrefixRe.FindStringSubmatch(name)
	if pm == nil {
		t.Fatalf("%s has no NNN_ numeric file prefix", name)
	}
	fileNum, err := strconv.Atoi(pm[1])
	if err != nil {
		t.Fatalf("%s: bad numeric prefix %q: %v", name, pm[1], err)
	}

	lm := selfLabelRe.FindStringSubmatch(firstCommentLine(t, name))
	if lm == nil {
		// First line is not a "-- Migration N:" self-label — nothing to verify.
		return
	}
	labelNum, err := strconv.Atoi(lm[1])
	if err != nil {
		t.Fatalf("%s: unparsable self-label number %q: %v", name, lm[1], err)
	}

	if labelNum != fileNum {
		t.Errorf(
			"%s first-line self-label declares \"-- Migration %d:\" but its "+
				"file-number prefix is %d; the self-label must match the actual "+
				"file number (F-105)",
			name, labelNum, fileNum,
		)
	}
}

// TestF105_OwnedMigrationSelfLabelMatchesFileNumber is the hard guard for the
// file this fix owns: 114_marketplace_inquiry_reply (up + down). It fails on the
// broken tree (first line said "-- Migration 109:") and passes after the fix.
func TestF105_OwnedMigrationSelfLabelMatchesFileNumber(t *testing.T) {
	for _, name := range []string{
		"114_marketplace_inquiry_reply.up.sql",
		"114_marketplace_inquiry_reply.down.sql",
	} {
		assertSelfLabelMatchesFile(t, name)
	}
}
