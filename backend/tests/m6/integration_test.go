package m6_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

func TestDealerFullLifecycle(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	// Bypass RLS for test
	_, err := pool.Exec(ctx, "SELECT set_config('app.bypass_rls', 'on', false)")
	require.NoError(t, err)

	dealerRepo := repository.NewDealerRepo(pool)

	// Create a test user first (needed for FK)
	testUserID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, display_name, phone, state_id) VALUES ($1, $2, $3, $4, $5)`,
		testUserID, testUserID.String()+"@test.com", "Test Dealer", "+91"+testUserID.String()[:10], 1)
	require.NoError(t, err, "test user creation should succeed")

	// 1. Register dealer
	dealer := &repository.Dealer{
		UserID:        testUserID,
		StateID:       1, // Maharashtra
		BusinessName:  "Test Photo Studio",
		TerritoryType: "primary",
		PANNumber:     "ABCDE1234F",
		GSTIN:         nil,
		Status:        "pending",
	}
	err = dealerRepo.Create(ctx, dealer)
	require.NoError(t, err, "dealer creation should succeed")
	assert.NotEqual(t, uuid.Nil, dealer.ID, "dealer should have an ID")
	assert.Equal(t, "pending", dealer.Status)

	// 2. Fetch by user ID
	fetched, err := dealerRepo.GetByUserID(ctx, testUserID)
	require.NoError(t, err)
	assert.Equal(t, dealer.ID, fetched.ID)
	assert.Equal(t, "Test Photo Studio", fetched.BusinessName)

	// 3. Generate referral code
	code, err := dealerRepo.GenerateReferralCode(ctx)
	require.NoError(t, err)
	assert.Len(t, code, 8, "referral code should be 8 characters")

	// 4. Approve dealer (use testUserID as admin — must exist in users table)
	adminID := testUserID
	err = dealerRepo.UpdateStatus(ctx, dealer.ID, "approved", &adminID, nil)
	require.NoError(t, err)
	err = dealerRepo.SetReferralCode(ctx, dealer.ID, code)
	require.NoError(t, err)

	approved, err := dealerRepo.GetByID(ctx, dealer.ID)
	require.NoError(t, err)
	assert.Equal(t, "approved", approved.Status)
	assert.NotNil(t, approved.ReferralCode)
	assert.Equal(t, code, *approved.ReferralCode)

	// 5. List dealers by status
	dealers, err := dealerRepo.List(ctx, repository.DealerFilter{Status: "approved"})
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(dealers), 1)

	// Cleanup
	pool.Exec(ctx, "DELETE FROM dealers WHERE id = $1", dealer.ID)
	pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
}

func TestCouponCRUDIntegration(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx, "SELECT set_config('app.bypass_rls', 'on', false)")
	require.NoError(t, err)

	couponRepo := repository.NewCouponRepo(pool)

	// Need a user for created_by FK
	testUserID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, display_name, phone, state_id) VALUES ($1, $2, $3, $4, $5)`,
		testUserID, "coupon-test@example.com", "Test Admin", "+919999999998", 1)
	require.NoError(t, err)

	// Create coupon
	coupon := &repository.Coupon{
		Code:          "TEST50",
		CreatedBy:     testUserID,
		OwnerType:     "admin",
		CouponType:    "percentage",
		DiscountValue: 5000, // 50% in basis points
		IsActive:      true,
		PerUserLimit:  1,
	}

	err = couponRepo.Create(ctx, coupon)
	require.NoError(t, err, "coupon creation should succeed")
	assert.Equal(t, "TEST50", coupon.Code, "code should be uppercased")

	// Fetch by code (case-insensitive)
	fetched, err := couponRepo.GetByCode(ctx, "test50")
	require.NoError(t, err)
	assert.Equal(t, coupon.ID, fetched.ID)

	// Fetch active by code
	active, err := couponRepo.GetByCodeActive(ctx, "TEST50")
	require.NoError(t, err)
	assert.True(t, active.IsActive)

	// Check user redemption count (should be 0)
	count, err := couponRepo.GetUserRedemptionCount(ctx, coupon.ID, uuid.New())
	require.NoError(t, err)
	assert.Equal(t, 0, count)

	// Duplicate code should fail
	dup := &repository.Coupon{
		Code:          "test50", // lowercase — should conflict with TEST50
		CreatedBy:     testUserID,
		OwnerType:     "admin",
		CouponType:    "fixed_amount",
		DiscountValue: 10000,
		IsActive:      true,
		PerUserLimit:  1,
	}
	err = couponRepo.Create(ctx, dup)
	assert.Error(t, err, "duplicate code should fail")

	// Cleanup
	pool.Exec(ctx, "DELETE FROM coupons WHERE id = $1", coupon.ID)
	pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
}

func TestMarginRatioConstraint(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx, "SELECT set_config('app.bypass_rls', 'on', false)")
	require.NoError(t, err)

	// Create test user
	testUserID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, display_name, phone, state_id) VALUES ($1, $2, $3, $4, $5)`,
		testUserID, "margin-test@example.com", "Margin Admin", "+919999999997", 1)
	require.NoError(t, err)

	// Valid margin: 70 + 30 = 100
	_, err = pool.Exec(ctx, `INSERT INTO margin_ratios (state_id, dealer_pct, platform_pct, effective_from, created_by) VALUES ($1, $2, $3, CURRENT_DATE, $4)`,
		1, 70.0, 30.0, testUserID)
	assert.NoError(t, err, "valid margin (70+30=100) should succeed")

	// Invalid margin: 60 + 30 = 90 ≠ 100
	_, err = pool.Exec(ctx, `INSERT INTO margin_ratios (state_id, dealer_pct, platform_pct, effective_from, created_by) VALUES ($1, $2, $3, CURRENT_DATE, $4)`,
		1, 60.0, 30.0, testUserID)
	assert.Error(t, err, "invalid margin (60+30=90) should fail CHECK constraint")

	// Cleanup
	pool.Exec(ctx, "DELETE FROM margin_ratios WHERE created_by = $1", testUserID)
	pool.Exec(ctx, "DELETE FROM users WHERE id = $1", testUserID)
}
