package database

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kontrolplane/feed/internal/configuration"
)

// PostgresDB wraps a *pgxpool.Pool to implement the DB interface.
type PostgresDB struct {
	pool *pgxpool.Pool
}

func createPostgresPool(ctx context.Context, cfg configuration.FeedServiceConfiguration, logger *slog.Logger) (*PostgresDB, error) {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		cfg.DatabaseUser,
		cfg.DatabasePassword,
		cfg.DatabaseHost,
		cfg.DatabasePort,
		cfg.DatabaseName,
		cfg.DatabaseSslMode,
	)

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logger.Error("failed to create a database pool", slog.Any("error", err))
		return nil, fmt.Errorf("failed to create database pool: %w", err)
	}

	if err := validatePostgresPool(ctx, logger, pool); err != nil {
		logger.Error("failed to validate database pool", slog.Any("error", err))
		pool.Close()
		return nil, fmt.Errorf("failed to validate database pool: %w", err)
	}

	return &PostgresDB{pool: pool}, nil
}

func validatePostgresPool(ctx context.Context, logger *slog.Logger, pool *pgxpool.Pool) error {
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("database connection error: %w", err)
	}

	const validation = `SELECT current_database(), current_user, version()`

	var database, user, version string
	err := pool.QueryRow(ctx, validation).Scan(&database, &user, &version)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("no rows were returned")
		}
		return fmt.Errorf("database query error: %w", err)
	}

	return nil
}

func (p *PostgresDB) Exec(ctx context.Context, query string, args ...any) error {
	_, err := p.pool.Exec(ctx, query, args...)
	return err
}

func (p *PostgresDB) QueryRow(ctx context.Context, query string, args ...any) Row {
	return p.pool.QueryRow(ctx, query, args...)
}

func (p *PostgresDB) Query(ctx context.Context, query string, args ...any) (Rows, error) {
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	return &pgxRows{rows}, nil
}

func (p *PostgresDB) Close() error {
	p.pool.Close()
	return nil
}

// pgxRows wraps pgx.Rows to implement the Rows interface.
type pgxRows struct {
	rows pgx.Rows
}

func (r *pgxRows) Next() bool             { return r.rows.Next() }
func (r *pgxRows) Scan(dest ...any) error { return r.rows.Scan(dest...) }
func (r *pgxRows) Close() error           { r.rows.Close(); return nil }
func (r *pgxRows) Err() error             { return r.rows.Err() }
