package ai

import (
	"io"
	"time"

	"github.com/google/uuid"
)

// readAll reads all bytes from a ReadCloser.
func readAll(r io.ReadCloser) ([]byte, error) {
	return io.ReadAll(r)
}

// timeNow returns the current UTC time.
func timeNow() time.Time {
	return time.Now().UTC()
}

// parseUUID parses a UUID string, returning uuid.Nil on failure.
func parseUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}
