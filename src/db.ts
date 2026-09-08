import { Database } from "bun:sqlite";

const SCHEMA = `
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
`;

export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}
