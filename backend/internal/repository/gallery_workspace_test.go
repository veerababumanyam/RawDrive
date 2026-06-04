package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestGalleryWorkspaceRelationshipFields(t *testing.T) {
	contactID := uuid.New()
	projectID := uuid.New()
	eventID := uuid.New()
	dealID := uuid.New()
	invoiceID := uuid.New()
	publishedAt := time.Now()
	archivedAt := publishedAt.Add(time.Hour)

	gallery := Gallery{
		ContactID:        &contactID,
		PrimaryContactID: &contactID,
		ProjectID:        &projectID,
		EventID:          &eventID,
		DealID:           &dealID,
		InvoiceID:        &invoiceID,
		PublishedAt:      &publishedAt,
		ArchivedAt:       &archivedAt,
	}

	assert.Equal(t, &contactID, gallery.ContactID)
	assert.Equal(t, &contactID, gallery.PrimaryContactID)
	assert.Equal(t, &projectID, gallery.ProjectID)
	assert.Equal(t, &eventID, gallery.EventID)
	assert.Equal(t, &dealID, gallery.DealID)
	assert.Equal(t, &invoiceID, gallery.InvoiceID)
	assert.Equal(t, &publishedAt, gallery.PublishedAt)
	assert.Equal(t, &archivedAt, gallery.ArchivedAt)
}
