package database

import (
	"context"
	"fmt"
	"log/slog"
)

// SQLite schema
const sqliteMigration = `
CREATE TABLE IF NOT EXISTS folders (
	id    TEXT PRIMARY KEY,
	label TEXT NOT NULL,
	pos   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS feeds (
	id       TEXT PRIMARY KEY,
	title    TEXT NOT NULL,
	url      TEXT NOT NULL UNIQUE,
	folder   TEXT NOT NULL REFERENCES folders(id),
	site_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS items (
	id       TEXT PRIMARY KEY,
	feed_id  TEXT NOT NULL REFERENCES feeds(id),
	folder   TEXT NOT NULL,
	title    TEXT NOT NULL,
	authors  TEXT NOT NULL DEFAULT '',
	date     TEXT NOT NULL,
	read     INTEGER NOT NULL DEFAULT 0,
	starred  INTEGER NOT NULL DEFAULT 0,
	tag      TEXT NOT NULL DEFAULT 'post',
	abstract TEXT NOT NULL DEFAULT '',
	body     TEXT NOT NULL DEFAULT '',
	link     TEXT NOT NULL DEFAULT '',
	minutes  INTEGER NOT NULL DEFAULT 5
);
CREATE INDEX IF NOT EXISTS idx_items_feed ON items(feed_id);
CREATE INDEX IF NOT EXISTS idx_items_date ON items(date DESC);
CREATE INDEX IF NOT EXISTS idx_items_read ON items(read);
`

// PostgreSQL schema
const postgresMigration = `
CREATE TABLE IF NOT EXISTS folders (
	id    TEXT PRIMARY KEY,
	label TEXT NOT NULL,
	pos   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS feeds (
	id       TEXT PRIMARY KEY,
	title    TEXT NOT NULL,
	url      TEXT NOT NULL UNIQUE,
	folder   TEXT NOT NULL REFERENCES folders(id),
	site_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS items (
	id       TEXT PRIMARY KEY,
	feed_id  TEXT NOT NULL REFERENCES feeds(id),
	folder   TEXT NOT NULL,
	title    TEXT NOT NULL,
	authors  TEXT NOT NULL DEFAULT '',
	date     TEXT NOT NULL,
	read     INTEGER NOT NULL DEFAULT 0,
	starred  INTEGER NOT NULL DEFAULT 0,
	tag      TEXT NOT NULL DEFAULT 'post',
	abstract TEXT NOT NULL DEFAULT '',
	body     TEXT NOT NULL DEFAULT '',
	link     TEXT NOT NULL DEFAULT '',
	minutes  INTEGER NOT NULL DEFAULT 5
);
CREATE INDEX IF NOT EXISTS idx_items_feed ON items(feed_id);
CREATE INDEX IF NOT EXISTS idx_items_date ON items(date DESC);
CREATE INDEX IF NOT EXISTS idx_items_read ON items(read);
`

// Migrate runs the database schema migration for the given driver.
func Migrate(ctx context.Context, db DB, driver string, logger *slog.Logger) error {
	var migration string
	switch driver {
	case "postgres":
		migration = postgresMigration
	case "sqlite":
		migration = sqliteMigration
	default:
		return fmt.Errorf("unsupported database driver for migration: %s", driver)
	}

	if err := db.Exec(ctx, migration); err != nil {
		logger.Error("failed to run database migration", slog.Any("error", err))
		return fmt.Errorf("failed to run migration: %w", err)
	}

	return nil
}
