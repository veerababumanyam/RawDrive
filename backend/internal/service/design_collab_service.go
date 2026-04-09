package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// DesignCollabService manages real-time collaborative editing for gallery designs.
type DesignCollabService struct {
	nc *nats.Conn
	mu sync.RWMutex
	// galleryID -> map[userID]->presence
	presence map[string]map[string]*PresenceEntry
	// galleryID -> map[sectionID]->lock
	locks map[string]map[string]*SectionLock
}

// PresenceEntry tracks a user's presence in a design session.
type PresenceEntry struct {
	UserID    string    `json:"user_id"`
	UserName  string    `json:"user_name"`
	AvatarURL string    `json:"avatar_url,omitempty"`
	Section   string    `json:"section"`
	LastSeen  time.Time `json:"last_seen"`
}

// SectionLock represents a lock on a design section.
type SectionLock struct {
	SectionID string    `json:"section_id"`
	LockedBy  string    `json:"locked_by"`
	UserName  string    `json:"user_name"`
	LockedAt  time.Time `json:"locked_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// DesignUpdate is a change broadcast to collaborators.
type DesignUpdate struct {
	GalleryID string                 `json:"gallery_id"`
	UserID    string                 `json:"user_id"`
	Section   string                 `json:"section"`
	Changes   map[string]interface{} `json:"changes"`
	Timestamp time.Time              `json:"timestamp"`
}

// NewDesignCollabService creates a new collaborative editing service.
func NewDesignCollabService(nc *nats.Conn) *DesignCollabService {
	svc := &DesignCollabService{
		nc:       nc,
		presence: make(map[string]map[string]*PresenceEntry),
		locks:    make(map[string]map[string]*SectionLock),
	}
	// Clean up stale presence every 30s
	go svc.cleanupLoop()
	return svc
}

// JoinSession registers a user's presence in a design session.
func (s *DesignCollabService) JoinSession(ctx context.Context, galleryID, userID, userName, avatarURL string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.presence[galleryID] == nil {
		s.presence[galleryID] = make(map[string]*PresenceEntry)
	}
	s.presence[galleryID][userID] = &PresenceEntry{
		UserID: userID, UserName: userName, AvatarURL: avatarURL,
		Section: "", LastSeen: time.Now(),
	}

	s.broadcastPresence(galleryID)
	return nil
}

// LeaveSession removes a user's presence.
func (s *DesignCollabService) LeaveSession(ctx context.Context, galleryID, userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if m, ok := s.presence[galleryID]; ok {
		delete(m, userID)
		if len(m) == 0 {
			delete(s.presence, galleryID)
		}
	}
	// Release any locks held by this user
	if locks, ok := s.locks[galleryID]; ok {
		for sid, lock := range locks {
			if lock.LockedBy == userID {
				delete(locks, sid)
			}
		}
	}
	s.broadcastPresence(galleryID)
}

// Heartbeat updates a user's last-seen timestamp and current section.
func (s *DesignCollabService) Heartbeat(ctx context.Context, galleryID, userID, section string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if m, ok := s.presence[galleryID]; ok {
		if p, ok := m[userID]; ok {
			p.LastSeen = time.Now()
			p.Section = section
		}
	}
}

// AcquireLock tries to lock a section for a user.
func (s *DesignCollabService) AcquireLock(ctx context.Context, galleryID, sectionID, userID, userName string) (*SectionLock, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.locks[galleryID] == nil {
		s.locks[galleryID] = make(map[string]*SectionLock)
	}

	if existing, ok := s.locks[galleryID][sectionID]; ok {
		if existing.LockedBy != userID && existing.ExpiresAt.After(time.Now()) {
			return nil, fmt.Errorf("section %s is locked by %s until %s", sectionID, existing.UserName, existing.ExpiresAt.Format(time.RFC3339))
		}
	}

	lock := &SectionLock{
		SectionID: sectionID,
		LockedBy:  userID,
		UserName:  userName,
		LockedAt:  time.Now(),
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	s.locks[galleryID][sectionID] = lock

	s.broadcastLocks(galleryID)
	return lock, nil
}

// ReleaseLock releases a section lock.
func (s *DesignCollabService) ReleaseLock(ctx context.Context, galleryID, sectionID, userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if locks, ok := s.locks[galleryID]; ok {
		if lock, ok := locks[sectionID]; ok && lock.LockedBy == userID {
			delete(locks, sectionID)
		}
	}
	s.broadcastLocks(galleryID)
}

// GetViewerCount returns the number of active viewers for a gallery.
func (s *DesignCollabService) GetViewerCount(galleryID string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.presence[galleryID])
}

// GetPresence returns all active users in a gallery session.
func (s *DesignCollabService) GetPresence(galleryID string) []*PresenceEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var entries []*PresenceEntry
	for _, p := range s.presence[galleryID] {
		entries = append(entries, p)
	}
	return entries
}

// GetLocks returns all active locks for a gallery.
func (s *DesignCollabService) GetLocks(galleryID string) []*SectionLock {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var locks []*SectionLock
	for _, l := range s.locks[galleryID] {
		if l.ExpiresAt.After(time.Now()) {
			locks = append(locks, l)
		}
	}
	return locks
}

// BroadcastUpdate sends a design change to all collaborators.
func (s *DesignCollabService) BroadcastUpdate(ctx context.Context, update DesignUpdate) error {
	if s.nc == nil {
		return nil
	}
	data, err := json.Marshal(update)
	if err != nil {
		return fmt.Errorf("marshal update: %w", err)
	}
	subject := fmt.Sprintf("design.update.%s", update.GalleryID)
	return s.nc.Publish(subject, data)
}

// SubscribeUpdates subscribes to design updates for a gallery. Returns channel and unsubscribe func.
func (s *DesignCollabService) SubscribeUpdates(galleryID string) (chan *DesignUpdate, func(), error) {
	if s.nc == nil {
		ch := make(chan *DesignUpdate, 10)
		return ch, func() { close(ch) }, nil
	}
	ch := make(chan *DesignUpdate, 50)
	subject := fmt.Sprintf("design.update.%s", galleryID)
	sub, err := s.nc.Subscribe(subject, func(msg *nats.Msg) {
		var update DesignUpdate
		if err := json.Unmarshal(msg.Data, &update); err == nil {
			select {
			case ch <- &update:
			default:
			}
		}
	})
	if err != nil {
		close(ch)
		return nil, nil, err
	}
	unsub := func() {
		_ = sub.Unsubscribe()
		close(ch)
	}
	return ch, unsub, nil
}

func (s *DesignCollabService) broadcastPresence(galleryID string) {
	if s.nc == nil {
		return
	}
	entries := s.presence[galleryID]
	data, _ := json.Marshal(entries)
	_ = s.nc.Publish(fmt.Sprintf("design.presence.%s", galleryID), data)
}

func (s *DesignCollabService) broadcastLocks(galleryID string) {
	if s.nc == nil {
		return
	}
	locks := s.locks[galleryID]
	data, _ := json.Marshal(locks)
	_ = s.nc.Publish(fmt.Sprintf("design.locks.%s", galleryID), data)
}

func (s *DesignCollabService) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for gid, m := range s.presence {
			for uid, p := range m {
				if now.Sub(p.LastSeen) > 2*time.Minute {
					delete(m, uid)
					log.Printf("collab: evicted stale user %s from gallery %s", uid, gid)
				}
			}
			if len(m) == 0 {
				delete(s.presence, gid)
			}
		}
		// Clean expired locks
		for gid, locks := range s.locks {
			for sid, lock := range locks {
				if lock.ExpiresAt.Before(now) {
					delete(locks, sid)
				}
			}
			if len(locks) == 0 {
				delete(s.locks, gid)
			}
		}
		s.mu.Unlock()
	}
}

// ensure uuid import used
var _ = uuid.Nil
