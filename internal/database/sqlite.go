package database

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"

	"github.com/kontrolplane/feed/internal/configuration"
	_ "github.com/mattn/go-sqlite3"
)

// SQLiteDB wraps a *sql.DB to implement the DB interface.
type SQLiteDB struct {
	db *sql.DB
}

func createSQLitePool(ctx context.Context, cfg configuration.FeedServiceConfiguration, logger *slog.Logger) (*SQLiteDB, error) {
	dsn := cfg.DatabasePath + "?_journal_mode=WAL&_busy_timeout=5000"

	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		logger.Error("failed to open sqlite database", slog.Any("error", err))
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	if err := validateSQLitePool(ctx, logger, db); err != nil {
		logger.Error("failed to validate sqlite database", slog.Any("error", err))
		db.Close()
		return nil, fmt.Errorf("failed to validate sqlite database: %w", err)
	}

	return &SQLiteDB{db: db}, nil
}

func validateSQLitePool(ctx context.Context, logger *slog.Logger, db *sql.DB) error {
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("sqlite connection error: %w", err)
	}

	var version string
	if err := db.QueryRowContext(ctx, "SELECT sqlite_version()").Scan(&version); err != nil {
		return fmt.Errorf("sqlite query error: %w", err)
	}

	return nil
}

func (s *SQLiteDB) Exec(ctx context.Context, query string, args ...any) error {
	_, err := s.db.ExecContext(ctx, query, args...)
	return err
}

func (s *SQLiteDB) QueryRow(ctx context.Context, query string, args ...any) Row {
	return s.db.QueryRowContext(ctx, query, args...)
}

func (s *SQLiteDB) Query(ctx context.Context, query string, args ...any) (Rows, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	return &sqlRows{rows}, nil
}

func (s *SQLiteDB) Close() error {
	return s.db.Close()
}

// sqlRows wraps *sql.Rows to implement the Rows interface.
type sqlRows struct {
	rows *sql.Rows
}

func (r *sqlRows) Next() bool             { return r.rows.Next() }
func (r *sqlRows) Scan(dest ...any) error { return r.rows.Scan(dest...) }
func (r *sqlRows) Close() error           { return r.rows.Close() }
func (r *sqlRows) Err() error             { return r.rows.Err() }
