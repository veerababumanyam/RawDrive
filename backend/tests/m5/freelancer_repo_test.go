package m5_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestWorkspaceAndUser(t *testing.T) (wsID, userID uuid.UUID, stateID int) {
	t.Helper()
	pool := getTestDB(t)
	ctx := context.Background()

	// Get a state ID from the seeded states
	var sid int
	err := pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&sid)
	require.NoError(t, err, "Need at least one state in DB")

	// Create a test user
	uid := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		uid, uid.String()+"@test.com", "Test User")
	require.NoError(t, err)

	// Create a test workspace
	wid := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO workspaces (id, name, owner_id, state_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
		wid, "Test WS", uid, sid)
	require.NoError(t, err)

	return wid, uid, sid
}

func TestFreelancerRepo_CreateAndGetByID(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "Wedding Photographer",
		Specializations: []string{"wedding", "portrait"},
		IsPublished:     true,
	}
	rate := int64(250000)
	listing.DailyRatePaisa = &rate

	err := repo.Create(ctx, listing)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, listing.ID)

	got, err := repo.GetByID(ctx, listing.ID)
	require.NoError(t, err)
	assert.Equal(t, listing.ID, got.ID)
	assert.Equal(t, "Wedding Photographer", got.Title)
	assert.Equal(t, []string{"wedding", "portrait"}, got.Specializations)
	assert.Equal(t, int64(250000), *got.DailyRatePaisa)
	assert.True(t, got.IsPublished)
}

func TestFreelancerRepo_ListWithStateFilter(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "Event Photographer - State Filter Test",
		Specializations: []string{"event"},
		IsPublished:     true,
	}
	require.NoError(t, repo.Create(ctx, listing))

	results, err := repo.List(ctx, repository.FreelancerFilter{
		StateID:       &stateID,
		PublishedOnly: true,
	})
	require.NoError(t, err)
	assert.NotEmpty(t, results)

	// All results should have the correct state
	for _, r := range results {
		assert.Equal(t, stateID, r.StateID)
	}
}

func TestFreelancerRepo_ListWithSpecializationFilter(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "Drone Specialist",
		Specializations: []string{"drone", "aerial"},
		IsPublished:     true,
	}
	require.NoError(t, repo.Create(ctx, listing))

	results, err := repo.List(ctx, repository.FreelancerFilter{
		Specialization: "drone",
		PublishedOnly:  true,
	})
	require.NoError(t, err)
	found := false
	for _, r := range results {
		if r.Title == "Drone Specialist" {
			found = true
		}
	}
	assert.True(t, found, "Should find listing with drone specialization")
}

func TestFreelancerRepo_Update(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "Original Title",
		Specializations: []string{"wedding"},
		IsPublished:     false,
	}
	require.NoError(t, repo.Create(ctx, listing))

	listing.Title = "Updated Title"
	listing.IsPublished = true
	require.NoError(t, repo.Update(ctx, listing))

	got, err := repo.GetByID(ctx, listing.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Title", got.Title)
	assert.True(t, got.IsPublished)
}

func TestFreelancerRepo_Delete(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "To Delete",
		Specializations: []string{"event"},
	}
	require.NoError(t, repo.Create(ctx, listing))

	err := repo.Delete(ctx, listing.ID, userID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, listing.ID)
	assert.Error(t, err, "Should not find deleted listing")
}

func TestFreelancerRepo_OnlyPublishedForPublicQueries(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	unpublished := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "Unpublished Draft - " + uuid.New().String(),
		Specializations: []string{"event"},
		IsPublished:     false,
	}
	require.NoError(t, repo.Create(ctx, unpublished))

	results, err := repo.List(ctx, repository.FreelancerFilter{PublishedOnly: true})
	require.NoError(t, err)
	for _, r := range results {
		assert.True(t, r.IsPublished, "PublishedOnly filter should only return published listings")
	}
}

func TestFreelancerRepo_HireRequestLifecycle(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	// Create listing first
	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "For Hire",
		Specializations: []string{"wedding"},
		IsPublished:     true,
	}
	require.NoError(t, repo.Create(ctx, listing))

	// Create a second user as requester
	requesterID := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		requesterID, requesterID.String()+"@test.com", "Requester")
	require.NoError(t, err)

	hire := &repository.HireRequest{
		ListingID:    listing.ID,
		RequesterID:  requesterID,
		FreelancerID: userID,
		Status:       "sent",
	}
	require.NoError(t, repo.CreateHireRequest(ctx, hire))
	assert.NotEqual(t, uuid.Nil, hire.ID)

	// Get hire request
	got, err := repo.GetHireRequest(ctx, hire.ID)
	require.NoError(t, err)
	assert.Equal(t, "sent", got.Status)

	// Update to accepted
	require.NoError(t, repo.UpdateHireStatus(ctx, hire.ID, "accepted"))
	got, _ = repo.GetHireRequest(ctx, hire.ID)
	assert.Equal(t, "accepted", got.Status)

	// List by requester
	byReq, err := repo.ListHireRequestsByRequester(ctx, requesterID)
	require.NoError(t, err)
	assert.NotEmpty(t, byReq)

	// List by freelancer
	byFL, err := repo.ListHireRequestsByFreelancer(ctx, userID)
	require.NoError(t, err)
	assert.NotEmpty(t, byFL)
}

func TestFreelancerRepo_ReviewAndRating(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewFreelancerRepo(pool)
	ctx := context.Background()
	wsID, userID, stateID := setupTestWorkspaceAndUser(t)

	listing := &repository.FreelancerListing{
		UserID:          userID,
		WorkspaceID:     wsID,
		StateID:         stateID,
		Title:           "Reviewable",
		Specializations: []string{"wedding"},
		IsPublished:     true,
	}
	require.NoError(t, repo.Create(ctx, listing))

	reviewerID := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		reviewerID, reviewerID.String()+"@test.com", "Reviewer")
	require.NoError(t, err)

	review := &repository.FreelancerReview{
		ListingID:  listing.ID,
		ReviewerID: reviewerID,
		Rating:     4,
	}
	require.NoError(t, repo.CreateReview(ctx, review))

	// Check denormalized rating
	got, err := repo.GetByID(ctx, listing.ID)
	require.NoError(t, err)
	assert.NotNil(t, got.RatingAvg)
	assert.Equal(t, 4.0, *got.RatingAvg)
	assert.Equal(t, 1, got.ReviewCount)

	// List reviews
	reviews, err := repo.ListReviews(ctx, listing.ID)
	require.NoError(t, err)
	assert.Len(t, reviews, 1)
	assert.Equal(t, 4, reviews[0].Rating)
}
