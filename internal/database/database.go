package database

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/kontrolplane/feed/internal/configuration"
)

// Row represents a single row result from a query.
type Row interface {
	Scan(dest ...any) error
}

// Rows represents multiple row results from a query.
type Rows interface {
	Next() bool
	Scan(dest ...any) error
	Close() error
	Err() error
}

// DB is the common database interface used throughout the application.
// Both SQLite and PostgreSQL implement this interface.
type DB interface {
	Exec(ctx context.Context, query string, args ...any) error
	QueryRow(ctx context.Context, query string, args ...any) Row
	Query(ctx context.Context, query string, args ...any) (Rows, error)
	Close() error
}

// CreatePool creates a database connection based on the configured driver.
// Returns a SQLite connection by default, or a PostgreSQL pool if configured.
func CreatePool(ctx context.Context, cfg configuration.FeedServiceConfiguration, logger *slog.Logger) (DB, error) {
	switch cfg.DatabaseDriver {
	case "postgres":
		return createPostgresPool(ctx, cfg, logger)
	case "sqlite":
		return createSQLitePool(ctx, cfg, logger)
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", cfg.DatabaseDriver)
	}
}
