package handler

import (
	"context"
	"strings"
	"sync"
)

// Event represents a published event with its subject and payload.
type Event struct {
	Subject string
	Data    []byte
}

type subscriber struct {
	ch       chan Event
	patterns []string
}

func (s *subscriber) matches(subject string) bool {
	for _, p := range s.patterns {
		if strings.HasPrefix(subject, p+".") || subject == p {
			return true
		}
	}
	return false
}

// EventBroker is a simple in-process pub/sub broker that satisfies
// EventPublisher and also allows SSE subscribers to receive events.
type EventBroker struct {
	mu          sync.RWMutex
	subscribers map[*subscriber]struct{}
}

func NewEventBroker() *EventBroker {
	return &EventBroker{subscribers: make(map[*subscriber]struct{})}
}

// Publish sends an event to all matching subscribers. Non-blocking.
func (b *EventBroker) Publish(_ context.Context, subject string, data []byte) error {
	evt := Event{Subject: subject, Data: data}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for sub := range b.subscribers {
		if sub.matches(subject) {
			select {
			case sub.ch <- evt:
			default:
			}
		}
	}
	return nil
}

// Subscribe returns an event channel and an unsubscribe function.
func (b *EventBroker) Subscribe(patterns []string) (<-chan Event, func()) {
	sub := &subscriber{ch: make(chan Event, 64), patterns: patterns}
	b.mu.Lock()
	b.subscribers[sub] = struct{}{}
	b.mu.Unlock()
	return sub.ch, func() {
		b.mu.Lock()
		delete(b.subscribers, sub)
		b.mu.Unlock()
		close(sub.ch)
	}
}
