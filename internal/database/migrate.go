package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log/slog"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/kontrolplane/feed/internal/configuration"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migrate runs all pending database migrations using goose.
func Migrate(ctx context.Context, cfg configuration.FeedServiceConfiguration, logger *slog.Logger) error {
	var dialect string
	var dsn string

	switch cfg.DatabaseDriver {
	case "sqlite":
		dialect = "sqlite3"
		dsn = cfg.DatabasePath + "?_journal_mode=WAL&_busy_timeout=5000"
	case "postgres":
		dialect = "pgx"
		dsn = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
			cfg.DatabaseUser,
			cfg.DatabasePassword,
			cfg.DatabaseHost,
			cfg.DatabasePort,
			cfg.DatabaseName,
			cfg.DatabaseSslMode,
		)
	default:
		return fmt.Errorf("unsupported database driver for migration: %s", cfg.DatabaseDriver)
	}

	db, err := sql.Open(dialect, dsn)
	if err != nil {
		return fmt.Errorf("failed to open database for migration: %w", err)
	}
	defer db.Close()

	goose.SetLogger(goose.NopLogger())
	goose.SetBaseFS(migrations)

	if err := goose.SetDialect(dialect); err != nil {
		return fmt.Errorf("failed to set goose dialect: %w", err)
	}

	if _, err := goose.EnsureDBVersionContext(ctx, db); err != nil {
		return fmt.Errorf("failed to ensure goose version table: %w", err)
	}

	if err := goose.UpContext(ctx, db, "migrations"); err != nil {
		logger.Error("failed to run migrations", slog.Any("error", err))
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	version, err := goose.GetDBVersionContext(ctx, db)
	if err == nil {
		logger.Info("database migrated", slog.Int64("version", version))
	}

	return nil
}
