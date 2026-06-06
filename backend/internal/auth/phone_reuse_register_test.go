package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubPhoneReuseFlag is a controllable auth.PhoneReuseEnforcement for tests.
type stubPhoneReuseFlag struct{ on bool }

func (s stubPhoneReuseFlag) Enabled(_ context.Context) bool { return s.on }

// normalized form of the test phone "9876543210" (India-first: +91 prefix).
const testNormalizedPhone = "919876543210"

func registerBody(email, plan string) map[string]any {
	return map[string]any{
		"email":    email,
		"password": "TestPassword123!",
		"phone":    "98765 43210", // formatted variant -> normalizes to testNormalizedPhone
		"plan":     plan,
	}
}

// Flag OFF + phone not in use -> normal free signup (reuse state empty => free).
func TestRegister_PhoneReuse_FlagOff_NewPhone_CreatesFree(t *testing.T) {
	handler, _, _, mock := setupAuthRouter()
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", registerBody("new@example.com", "free"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.Equal(t, "", mock.lastReuseState, "new phone must be created as free (empty reuse state)")
}

// Flag OFF + phone already in use -> 409 (preserves one-account-per-phone), even
// with paid intent, because enforcement (paid_pending routing) is off.
func TestRegister_PhoneReuse_FlagOff_DuplicatePhone_Rejected(t *testing.T) {
	handler, _, _, mock := setupAuthRouter()
	mock.phonesInUse[testNormalizedPhone] = true
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", registerBody("dup@example.com", "studio"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusConflict, resp.StatusCode)
	var body map[string]string
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Contains(t, body["error"], "already registered")
	assert.Empty(t, mock.users["dup@example.com"], "no account must be created for a rejected duplicate")
}

// Flag ON + duplicate phone + PAID intent -> account created as paid_pending.
func TestRegister_PhoneReuse_FlagOn_DuplicatePaid_RoutesPaidPending(t *testing.T) {
	handler, _, _, mock := setupAuthRouter()
	handler.WithPhoneReuseEnforcement(stubPhoneReuseFlag{on: true})
	mock.phonesInUse[testNormalizedPhone] = true
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", registerBody("paid@example.com", "studio"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.Equal(t, "paid_pending", mock.lastReuseState,
		"paid-intent duplicate must be created as paid_pending")
}

// Flag ON + duplicate phone + FREE intent -> 409 with the paid-path guidance.
func TestRegister_PhoneReuse_FlagOn_DuplicateFree_Rejected(t *testing.T) {
	handler, _, _, mock := setupAuthRouter()
	handler.WithPhoneReuseEnforcement(stubPhoneReuseFlag{on: true})
	mock.phonesInUse[testNormalizedPhone] = true
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", registerBody("free2@example.com", "free"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusConflict, resp.StatusCode)
	var body map[string]string
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Contains(t, body["error"], "paid plan", "free duplicate must be told to log in or pay")
	assert.Empty(t, mock.users["free2@example.com"])
}

// Flag ON + paid intent but phone NOT in use -> normal free signup (intent alone
// never grants paid; the account is plain free until it actually pays).
func TestRegister_PhoneReuse_FlagOn_NewPhonePaidIntent_StaysFree(t *testing.T) {
	handler, _, _, mock := setupAuthRouter()
	handler.WithPhoneReuseEnforcement(stubPhoneReuseFlag{on: true})
	ts := newTestServer(handler)
	defer ts.Close()

	resp, err := postJSON(ts.URL+"/auth/register", registerBody("fresh@example.com", "studio"))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.Equal(t, "", mock.lastReuseState,
		"a non-duplicate phone is always free regardless of paid intent")
}
