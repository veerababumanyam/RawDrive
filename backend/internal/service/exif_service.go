package service

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
	"github.com/rwcarlsen/goexif/exif"
)

// ExifService extracts EXIF metadata from images.
type ExifService struct {
	store     storage.Provider
	assetRepo *repository.AssetRepo
}

// NewExifService creates a new ExifService.
func NewExifService() *ExifService {
	return &ExifService{}
}

// NewExifServiceWithDeps creates an ExifService with storage and repo dependencies for pipeline use.
func NewExifServiceWithDeps(store storage.Provider, assetRepo *repository.AssetRepo) *ExifService {
	return &ExifService{store: store, assetRepo: assetRepo}
}

// ExtractAndStore fetches an asset from storage, extracts EXIF data, and updates the asset record.
func (s *ExifService) ExtractAndStore(ctx context.Context, assetID uuid.UUID, storageKey string) error {
	if s.store == nil {
		return fmt.Errorf("exif: storage provider not configured")
	}

	reader, err := s.store.Get(ctx, storageKey)
	if err != nil {
		return fmt.Errorf("exif: get original: %w", err)
	}
	defer reader.Close()

	meta, err := s.Extract(reader)
	if err != nil {
		// EXIF extraction failure is non-fatal — some files don't have EXIF
		return nil
	}

	if s.assetRepo != nil {
		return s.assetRepo.UpdateExif(ctx, assetID, meta.ToMap())
	}
	return nil
}

// ExifMetadata holds extracted EXIF data.
type ExifMetadata struct {
	Make         string     `json:"make,omitempty"`
	Model        string     `json:"model,omitempty"`
	DateTime     *time.Time `json:"date_time,omitempty"`
	ExposureTime string     `json:"exposure_time,omitempty"`
	FNumber      float64    `json:"f_number,omitempty"`
	ISO          int        `json:"iso,omitempty"`
	FocalLength  float64    `json:"focal_length,omitempty"`
	Orientation  int        `json:"orientation,omitempty"`
	Latitude     float64    `json:"latitude,omitempty"`
	Longitude    float64    `json:"longitude,omitempty"`
	Width        int        `json:"width,omitempty"`
	Height       int        `json:"height,omitempty"`
}

// Extract reads EXIF metadata from an image reader.
func (s *ExifService) Extract(r io.Reader) (*ExifMetadata, error) {
	x, err := exif.Decode(r)
	if err != nil {
		return nil, fmt.Errorf("exif decode: %w", err)
	}

	meta := &ExifMetadata{}

	if tag, err := x.Get(exif.Make); err == nil {
		if v, e := tag.StringVal(); e == nil {
			meta.Make = v
		}
	}
	if tag, err := x.Get(exif.Model); err == nil {
		if v, e := tag.StringVal(); e == nil {
			meta.Model = v
		}
	}
	if tm, err := x.DateTime(); err == nil {
		meta.DateTime = &tm
	}
	if tag, err := x.Get(exif.ExposureTime); err == nil {
		num, den, _ := tag.Rat2(0)
		if den != 0 {
			meta.ExposureTime = fmt.Sprintf("%d/%d", num, den)
		}
	}
	if tag, err := x.Get(exif.FNumber); err == nil {
		num, den, _ := tag.Rat2(0)
		if den != 0 {
			meta.FNumber = float64(num) / float64(den)
		}
	}
	if tag, err := x.Get(exif.ISOSpeedRatings); err == nil {
		val, _ := tag.Int(0)
		meta.ISO = val
	}
	if tag, err := x.Get(exif.FocalLength); err == nil {
		num, den, _ := tag.Rat2(0)
		if den != 0 {
			meta.FocalLength = float64(num) / float64(den)
		}
	}
	if tag, err := x.Get(exif.Orientation); err == nil {
		val, _ := tag.Int(0)
		meta.Orientation = val
	}
	if lat, lon, err := x.LatLong(); err == nil {
		meta.Latitude = lat
		meta.Longitude = lon
	}

	return meta, nil
}

// ToMap converts ExifMetadata to a map for JSONB storage.
func (m *ExifMetadata) ToMap() map[string]interface{} {
	result := map[string]interface{}{}
	if m.Make != "" {
		result["make"] = m.Make
	}
	if m.Model != "" {
		result["model"] = m.Model
	}
	if m.DateTime != nil {
		result["date_time"] = m.DateTime.Format(time.RFC3339)
	}
	if m.ExposureTime != "" {
		result["exposure_time"] = m.ExposureTime
	}
	if m.FNumber > 0 {
		result["f_number"] = m.FNumber
	}
	if m.ISO > 0 {
		result["iso"] = m.ISO
	}
	if m.FocalLength > 0 {
		result["focal_length"] = m.FocalLength
	}
	if m.Orientation > 0 {
		result["orientation"] = m.Orientation
	}
	if m.Latitude != 0 || m.Longitude != 0 {
		result["latitude"] = m.Latitude
		result["longitude"] = m.Longitude
	}
	return result
}
