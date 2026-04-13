package handler

import (
	"testing"

	"github.com/rawdrive/backend/internal/repository"
)

func TestCalendarUpdateConflictCheckIntent(t *testing.T) {
	if !calendarUpdateNeedsConflictCheck(repository.Event{Status: "confirmed"}) {
		t.Fatal("confirmed event updates must run conflict checks")
	}
	if calendarUpdateNeedsConflictCheck(repository.Event{Status: "tentative"}) {
		t.Fatal("tentative event updates must not block on confirmed-event conflicts")
	}
	if calendarUpdateNeedsConflictCheck(repository.Event{Status: "cancelled"}) {
		t.Fatal("cancelled event updates must not block on confirmed-event conflicts")
	}
}
