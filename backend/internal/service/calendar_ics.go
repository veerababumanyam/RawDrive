package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

// GenerateICS creates an iCalendar (ICS) feed from a list of events.
func GenerateICS(events []repository.Event, calendarName string) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString("PRODID:-//RawDrive//Calendar//EN\r\n")
	b.WriteString(fmt.Sprintf("X-WR-CALNAME:%s\r\n", calendarName))

	for _, e := range events {
		b.WriteString("BEGIN:VEVENT\r\n")
		b.WriteString(fmt.Sprintf("UID:%s@rawdrive.in\r\n", e.ID.String()))
		b.WriteString(fmt.Sprintf("DTSTART:%s\r\n", formatICSTime(e.StartAt)))
		b.WriteString(fmt.Sprintf("DTEND:%s\r\n", formatICSTime(e.EndAt)))
		b.WriteString(fmt.Sprintf("SUMMARY:%s\r\n", escapeICS(e.Title)))
		if e.Location != nil && *e.Location != "" {
			b.WriteString(fmt.Sprintf("LOCATION:%s\r\n", escapeICS(*e.Location)))
		}
		if e.Notes != nil && *e.Notes != "" {
			b.WriteString(fmt.Sprintf("DESCRIPTION:%s\r\n", escapeICS(*e.Notes)))
		}
		b.WriteString(fmt.Sprintf("STATUS:%s\r\n", strings.ToUpper(e.Status)))
		b.WriteString(fmt.Sprintf("CREATED:%s\r\n", formatICSTime(e.CreatedAt)))
		b.WriteString("END:VEVENT\r\n")
	}

	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

func formatICSTime(t time.Time) string {
	return t.UTC().Format("20060102T150405Z")
}

func escapeICS(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, ",", "\\,")
	s = strings.ReplaceAll(s, ";", "\\;")
	return s
}
