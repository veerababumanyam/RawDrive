package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// ContactImportResult holds the result of a CSV import.
type ContactImportResult struct {
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors,omitempty"`
}

// ImportContactsCSV parses a CSV reader and creates contacts in the database.
// Expected CSV columns: name,email,phone,company,type,tags
func ImportContactsCSV(ctx context.Context, repo *repository.ContactRepo, workspaceID uuid.UUID, r io.Reader) (ContactImportResult, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true

	// Read header
	header, err := reader.Read()
	if err != nil {
		return ContactImportResult{}, fmt.Errorf("reading CSV header: %w", err)
	}

	colMap := make(map[string]int)
	for i, col := range header {
		colMap[strings.ToLower(strings.TrimSpace(col))] = i
	}

	nameIdx, hasName := colMap["name"]
	if !hasName {
		return ContactImportResult{}, fmt.Errorf("CSV must have a 'name' column")
	}

	var result ContactImportResult
	lineNum := 1

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("line %d: %v", lineNum+1, err))
			result.Skipped++
			lineNum++
			continue
		}
		lineNum++

		if nameIdx >= len(record) || strings.TrimSpace(record[nameIdx]) == "" {
			result.Errors = append(result.Errors, fmt.Sprintf("line %d: empty name", lineNum))
			result.Skipped++
			continue
		}

		contact := repository.Contact{
			WorkspaceID: workspaceID,
			Name:        strings.TrimSpace(record[nameIdx]),
			ContactType: "client",
			Tags:        []string{},
		}

		if idx, ok := colMap["email"]; ok && idx < len(record) {
			v := strings.TrimSpace(record[idx])
			if v != "" {
				contact.Email = &v
			}
		}
		if idx, ok := colMap["phone"]; ok && idx < len(record) {
			v := strings.TrimSpace(record[idx])
			if v != "" {
				contact.Phone = &v
			}
		}
		if idx, ok := colMap["company"]; ok && idx < len(record) {
			v := strings.TrimSpace(record[idx])
			if v != "" {
				contact.Company = &v
			}
		}
		if idx, ok := colMap["type"]; ok && idx < len(record) {
			v := strings.ToLower(strings.TrimSpace(record[idx]))
			if v == "client" || v == "vendor" || v == "collaborator" {
				contact.ContactType = v
			}
		}
		if idx, ok := colMap["tags"]; ok && idx < len(record) {
			v := strings.TrimSpace(record[idx])
			if v != "" {
				for _, tag := range strings.Split(v, ";") {
					tag = strings.TrimSpace(tag)
					if tag != "" {
						contact.Tags = append(contact.Tags, tag)
					}
				}
			}
		}

		if err := repo.Create(ctx, &contact); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("line %d: %v", lineNum, err))
			result.Skipped++
			continue
		}
		result.Imported++
	}

	return result, nil
}
