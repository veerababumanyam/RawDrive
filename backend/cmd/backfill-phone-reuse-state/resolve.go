package main

import (
	"sort"
	"strconv"
	"time"
)

const (
	stateFree        = "free"
	statePaidActive  = "paid_active"
	statePaidExpired = "paid_expired"
)

// account is one existing user as seen by the backfill.
type account struct {
	ID         string
	Normalized string    // canonical phone identity ("" = no phone)
	CreatedAt  time.Time // tiebreak: oldest keeps the free slot
	Paid       bool      // owns a paid workspace OR has an active paid subscription
}

// decision is the resolved phone_reuse_state for one account.
type decision struct {
	ID         string
	Normalized string
	State      string
	Collision  bool // shares its normalized phone with >=1 other account
}

// planBackfill assigns a phone_reuse_state to every account, auto-resolving
// pre-existing normalized-phone collisions (two real accounts that signed up
// with differently-formatted versions of one number — possible because the old
// users_phone_key was byte-exact):
//
//   - paid accounts                              -> paid_active
//   - among NON-paid accounts sharing a normalized phone, the EARLIEST-created
//     keeps the single free slot (-> free); every later collider -> paid_expired
//   - accounts with no phone ("") are independent singletons (never collide)
//
// Pure + deterministic (each group sorted by CreatedAt then ID). The backfill
// never emits paid_pending — that state exists only mid-signup, never for an
// already-existing account.
func planBackfill(accts []account) []decision {
	groups := map[string][]account{}
	order := []string{} // stable output: group discovery order
	seen := map[string]bool{}

	for i, a := range accts {
		key := a.Normalized
		if key == "" {
			// Each phoneless account is its own singleton group — synthetic key.
			key = "\x00empty\x00" + strconv.Itoa(i)
		}
		if !seen[key] {
			seen[key] = true
			order = append(order, key)
		}
		groups[key] = append(groups[key], a)
	}

	out := make([]decision, 0, len(accts))
	for _, key := range order {
		g := groups[key]
		sort.SliceStable(g, func(i, j int) bool {
			if g[i].CreatedAt.Equal(g[j].CreatedAt) {
				return g[i].ID < g[j].ID
			}
			return g[i].CreatedAt.Before(g[j].CreatedAt)
		})
		collision := len(g) > 1 && g[0].Normalized != ""
		freeAssigned := false
		for _, a := range g {
			st := statePaidExpired
			switch {
			case a.Paid:
				st = statePaidActive
			case !freeAssigned:
				st = stateFree
				freeAssigned = true
			}
			out = append(out, decision{ID: a.ID, Normalized: a.Normalized, State: st, Collision: collision})
		}
	}
	return out
}
