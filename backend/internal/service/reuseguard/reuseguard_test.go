package reuseguard

import (
	"context"
	"testing"
)

func TestEvaluateReuseAccess(t *testing.T) {
	cases := []struct {
		name        string
		state       string
		hasSub      bool
		wantBlocked bool
		wantNew     string
	}{
		{"free always allowed", StateFree, false, false, ""},
		{"paid_active with sub allowed", StatePaidActive, true, false, ""},
		{"paid_active lapsed flips to expired + blocked", StatePaidActive, false, true, StatePaidExpired},
		{"paid_expired stays blocked", StatePaidExpired, false, true, ""},
		{"paid_pending blocked from free tier", StatePaidPending, false, true, ""},
		{"unknown fails open", "legacy_weird", false, false, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := EvaluateReuseAccess(c.state, c.hasSub)
			if d.Blocked != c.wantBlocked {
				t.Fatalf("blocked = %v, want %v", d.Blocked, c.wantBlocked)
			}
			if d.NewState != c.wantNew {
				t.Fatalf("newState = %q, want %q", d.NewState, c.wantNew)
			}
		})
	}
}

// --- applier ---------------------------------------------------------------

type fakeStore struct {
	state    string
	hasSub   bool
	setTo    string
	setCalls int
}

func (f *fakeStore) GetReuseState(context.Context, string) (string, error) { return f.state, nil }
func (f *fakeStore) HasActiveSubscription(context.Context, string) (bool, error) {
	return f.hasSub, nil
}
func (f *fakeStore) SetReuseState(_ context.Context, _, state string) error {
	f.setTo = state
	f.setCalls++
	return nil
}

func TestGuard_LapsedPaidActive_FlipsAndBlocks(t *testing.T) {
	st := &fakeStore{state: StatePaidActive, hasSub: false}
	blocked, err := NewGuard(st).Check(context.Background(), "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !blocked {
		t.Fatal("lapsed paid_active must be blocked")
	}
	if st.setTo != StatePaidExpired || st.setCalls != 1 {
		t.Fatalf("must persist paid_expired exactly once; setTo=%q calls=%d", st.setTo, st.setCalls)
	}
}

func TestGuard_CurrentPaidActive_NoFlip(t *testing.T) {
	st := &fakeStore{state: StatePaidActive, hasSub: true}
	blocked, _ := NewGuard(st).Check(context.Background(), "u1")
	if blocked {
		t.Fatal("current paid_active must not be blocked")
	}
	if st.setCalls != 0 {
		t.Fatalf("must not write state for a current paid_active; calls=%d", st.setCalls)
	}
}

func TestGuard_Free_NoSubCheckNoWrite(t *testing.T) {
	st := &fakeStore{state: StateFree}
	blocked, _ := NewGuard(st).Check(context.Background(), "u1")
	if blocked || st.setCalls != 0 {
		t.Fatalf("free must be allowed with no writes; blocked=%v calls=%d", blocked, st.setCalls)
	}
}

func TestGuard_PaidExpired_StaysBlockedNoRewrite(t *testing.T) {
	st := &fakeStore{state: StatePaidExpired}
	blocked, _ := NewGuard(st).Check(context.Background(), "u1")
	if !blocked {
		t.Fatal("paid_expired must stay blocked")
	}
	if st.setCalls != 0 {
		t.Fatalf("no rewrite when already expired; calls=%d", st.setCalls)
	}
}
