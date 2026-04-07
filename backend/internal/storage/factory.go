package storage

import "fmt"

// NewProvider creates a storage Provider based on the given Config.
func NewProvider(cfg Config) (Provider, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	switch cfg.Driver {
	case "local":
		return NewLocalDriver(cfg.LocalDir), nil
	case "s3":
		return NewS3Driver(cfg)
	default:
		return nil, fmt.Errorf("storage: unsupported driver %q", cfg.Driver)
	}
}
