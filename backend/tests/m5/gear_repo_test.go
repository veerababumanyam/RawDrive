package m5_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGearRepo_CreateAndGetByID(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewGearRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.GearListing{
		UserID:      userID,
		WorkspaceID: wsID,
		StateID:     stateID,
		ListingType: "rental",
		Title:       "Canon EOS R5 Body",
		Category:    "camera_body",
		PricePaisa:  350000,
		IsPublished: true,
		IsAvailable: true,
		Images:      json.RawMessage(`["https://cdn.example.com/img1.jpg"]`),
	}
	brand := "Canon"
	listing.Brand = &brand

	err := repo.Create(ctx, listing)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, listing.ID)

	got, err := repo.GetByID(ctx, listing.ID)
	require.NoError(t, err)
	assert.Equal(t, "Canon EOS R5 Body", got.Title)
	assert.Equal(t, "camera_body", got.Category)
	assert.Equal(t, int64(350000), got.PricePaisa)
	assert.Equal(t, "Canon", *got.Brand)
}

func TestGearRepo_ListWithCategoryFilter(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewGearRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.GearListing{
		UserID:      userID,
		WorkspaceID: wsID,
		StateID:     stateID,
		ListingType: "rental",
		Title:       "Godox AD600Pro",
		Category:    "lighting",
		PricePaisa:  100000,
		IsPublished: true,
		IsAvailable: true,
	}
	require.NoError(t, repo.Create(ctx, listing))

	results, err := repo.List(ctx, repository.GearFilter{
		Category:      "lighting",
		PublishedOnly: true,
	})
	require.NoError(t, err)
	assert.NotEmpty(t, results)
	for _, r := range results {
		assert.Equal(t, "lighting", r.Category)
	}
}

func TestGearRepo_Delete(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewGearRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.GearListing{
		UserID:      userID,
		WorkspaceID: wsID,
		StateID:     stateID,
		ListingType: "sale",
		Title:       "Delete Me",
		Category:    "accessory",
		PricePaisa:  50000,
	}
	require.NoError(t, repo.Create(ctx, listing))

	err := repo.Delete(ctx, listing.ID, userID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, listing.ID)
	assert.Error(t, err)
}

func TestGearRepo_DeleteFailsForNonOwner(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewGearRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.GearListing{
		UserID:      userID,
		WorkspaceID: wsID,
		StateID:     stateID,
		ListingType: "rental",
		Title:       "Not Yours",
		Category:    "lens",
		PricePaisa:  200000,
	}
	require.NoError(t, repo.Create(ctx, listing))

	otherUser := uuid.New()
	err := repo.Delete(ctx, listing.ID, otherUser)
	assert.Error(t, err, "Should fail for non-owner")
}

func TestGearRepo_BookingLifecycle(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewGearRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.GearListing{
		UserID:      userID,
		WorkspaceID: wsID,
		StateID:     stateID,
		ListingType: "rental",
		Title:       "Bookable Gear",
		Category:    "camera_body",
		PricePaisa:  350000,
		IsPublished: true,
		IsAvailable: true,
	}
	require.NoError(t, repo.Create(ctx, listing))

	renterID := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		renterID, renterID.String()+"@test.com", "Renter")
	require.NoError(t, err)

	booking := &repository.GearBooking{
		GearListingID: listing.ID,
		RenterID:      renterID,
		OwnerID:       userID,
		StartDate:     time.Now().Add(24 * time.Hour),
		EndDate:       time.Now().Add(72 * time.Hour),
		TotalPaisa:    1050000,
		DepositPaisa:  500000,
	}
	require.NoError(t, repo.CreateBooking(ctx, booking))
	assert.Equal(t, "pending", booking.Status)

	// Approve
	require.NoError(t, repo.UpdateBookingStatus(ctx, booking.ID, "approved"))
	got, _ := repo.GetBooking(ctx, booking.ID)
	assert.Equal(t, "approved", got.Status)

	// Return
	require.NoError(t, repo.UpdateBookingStatus(ctx, booking.ID, "returned"))
	got, _ = repo.GetBooking(ctx, booking.ID)
	assert.Equal(t, "returned", got.Status)

	// Complete
	require.NoError(t, repo.UpdateBookingStatus(ctx, booking.ID, "completed"))
	got, _ = repo.GetBooking(ctx, booking.ID)
	assert.Equal(t, "completed", got.Status)

	// List by renter
	byRenter, err := repo.ListBookingsByRenter(ctx, renterID)
	require.NoError(t, err)
	assert.NotEmpty(t, byRenter)
}
