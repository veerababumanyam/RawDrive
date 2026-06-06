package handler

import (
	"testing"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestCompletedPartsFromETags_SortsByPartNumber is the regression for the prod
// S3 "InvalidPartOrder: The list of parts was not in ascending order" finalize
// 500. row.R2PartETags is persisted in the order chunks were uploaded, which is
// NOT ascending when chunks upload concurrently. finalizeUpload must sort by
// PartNumber before CompleteMultipartUpload — S3/R2 reject a non-ascending list.
func TestCompletedPartsFromETags_SortsByPartNumber(t *testing.T) {
	// Persisted in a NON-ascending order, as concurrent chunk uploads produce.
	// (Includes 10 vs 2 so the sort is proven numeric, not lexicographic.)
	parts := []repository.UploadPartETag{
		{PartNumber: 3, ETag: "etag-3"},
		{PartNumber: 1, ETag: "etag-1"},
		{PartNumber: 10, ETag: "etag-10"},
		{PartNumber: 2, ETag: "etag-2"},
	}

	got := completedPartsFromETags(parts)

	require.Len(t, got, 4)
	for i := 1; i < len(got); i++ {
		assert.Less(t, got[i-1].PartNumber, got[i].PartNumber,
			"parts must be in ascending PartNumber order (S3 InvalidPartOrder otherwise)")
	}
	// Each ETag must stay paired with its part number after the sort.
	assert.Equal(t, int32(1), got[0].PartNumber)
	assert.Equal(t, "etag-1", got[0].ETag)
	assert.Equal(t, int32(2), got[1].PartNumber)
	assert.Equal(t, int32(3), got[2].PartNumber)
	assert.Equal(t, int32(10), got[3].PartNumber)
	assert.Equal(t, "etag-10", got[3].ETag)
}

func TestCompletedPartsFromETags_Empty(t *testing.T) {
	assert.Empty(t, completedPartsFromETags(nil))
}
