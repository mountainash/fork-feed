package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/kontrolplane/feed/internal/database"
)

type Feed struct {
	ID      string
	Title   string
	URL     string
	Folder  string
	SiteURL string
}

type Folder struct {
	ID    string
	Label string
}

type Item struct {
	ID       string
	FeedID   string
	Folder   string
	Title    string
	Authors  string
	Date     string
	Read     bool
	Starred  bool
	Tag      string
	Abstract string
	Body     string
	Link     string
	Minutes  int
}

type Counts struct {
	All     int
	Unread  int
	Read    int
	Starred int
	Today   int
	PerFeed map[string]int
}

type ListFilter struct {
	ViewKind string // "view", "feed", "folder"
	ViewID   string // e.g. "unread", feed id, folder id
	Query    string
	Sort     string // "newest", "oldest", "unread"
}

type Store struct {
	db     database.DB
	driver string // "sqlite" or "postgres"
}

// New creates a new Store wrapping the given database connection.
func New(db database.DB, driver string) *Store {
	return &Store{db: db, driver: driver}
}

// ph converts SQLite-style ? placeholders to PostgreSQL $N placeholders
// when the driver is postgres.
func (s *Store) ph(query string) string {
	if s.driver != "postgres" {
		return query
	}
	var out strings.Builder
	n := 1
	for i := 0; i < len(query); i++ {
		if query[i] == '?' {
			out.WriteString(fmt.Sprintf("$%d", n))
			n++
		} else {
			out.WriteByte(query[i])
		}
	}
	return out.String()
}

func (s *Store) UpsertFolder(ctx context.Context, f Folder, pos int) error {
	return s.db.Exec(ctx, s.ph(
		`INSERT INTO folders (id, label, pos) VALUES (?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET label=excluded.label, pos=excluded.pos`),
		f.ID, f.Label, pos)
}

func (s *Store) UpsertFeed(ctx context.Context, f Feed) error {
	return s.db.Exec(ctx, s.ph(
		`INSERT INTO feeds (id, title, url, folder, site_url) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, folder=excluded.folder, site_url=excluded.site_url`),
		f.ID, f.Title, f.URL, f.Folder, f.SiteURL)
}

func (s *Store) UpsertItem(ctx context.Context, it Item) error {
	read := 0
	if it.Read {
		read = 1
	}
	starred := 0
	if it.Starred {
		starred = 1
	}
	return s.db.Exec(ctx, s.ph(
		`INSERT INTO items (id, feed_id, folder, title, authors, date, read, starred, tag, abstract, body, link, minutes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   title=excluded.title, authors=excluded.authors, date=excluded.date,
		   tag=excluded.tag, abstract=excluded.abstract, body=excluded.body,
		   link=excluded.link, minutes=excluded.minutes`),
		it.ID, it.FeedID, it.Folder, it.Title, it.Authors, it.Date,
		read, starred, it.Tag, it.Abstract, it.Body, it.Link, it.Minutes)
}

func (s *Store) Folders(ctx context.Context) ([]Folder, error) {
	rows, err := s.db.Query(ctx, "SELECT id, label FROM folders ORDER BY pos")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Folder
	for rows.Next() {
		var f Folder
		if err := rows.Scan(&f.ID, &f.Label); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) Feeds(ctx context.Context) ([]Feed, error) {
	rows, err := s.db.Query(ctx, "SELECT id, title, url, folder, site_url FROM feeds ORDER BY title")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Feed
	for rows.Next() {
		var f Feed
		if err := rows.Scan(&f.ID, &f.Title, &f.URL, &f.Folder, &f.SiteURL); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) FeedByID(ctx context.Context, id string) (*Feed, error) {
	var f Feed
	err := s.db.QueryRow(ctx, s.ph("SELECT id, title, url, folder, site_url FROM feeds WHERE id=?"), id).
		Scan(&f.ID, &f.Title, &f.URL, &f.Folder, &f.SiteURL)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *Store) ItemByID(ctx context.Context, id string) (*Item, error) {
	var it Item
	var read, starred int
	err := s.db.QueryRow(ctx, s.ph(
		"SELECT id, feed_id, folder, title, authors, date, read, starred, tag, abstract, body, link, minutes FROM items WHERE id=?"), id).
		Scan(&it.ID, &it.FeedID, &it.Folder, &it.Title, &it.Authors, &it.Date, &read, &starred, &it.Tag, &it.Abstract, &it.Body, &it.Link, &it.Minutes)
	if err != nil {
		return nil, err
	}
	it.Read = read == 1
	it.Starred = starred == 1
	return &it, nil
}

func (s *Store) ListItems(ctx context.Context, f ListFilter) ([]Item, error) {
	var where []string
	var args []interface{}

	switch f.ViewKind {
	case "feed":
		where = append(where, "i.feed_id = ?")
		args = append(args, f.ViewID)
	case "folder":
		where = append(where, "i.folder = ?")
		args = append(args, f.ViewID)
	case "view":
		switch f.ViewID {
		case "unread":
			where = append(where, "i.read = 0")
		case "read":
			where = append(where, "i.read = 1")
		case "starred":
			where = append(where, "i.starred = 1")
		case "today":
			yesterday := time.Now().Add(-24 * time.Hour).Format("2006-01-02")
			where = append(where, "i.date >= ?")
			args = append(args, yesterday)
		}
	}

	if f.Query != "" {
		q := "%" + strings.ToLower(f.Query) + "%"
		where = append(where, "(LOWER(i.title) LIKE ? OR LOWER(i.authors) LIKE ? OR LOWER(i.abstract) LIKE ?)")
		args = append(args, q, q, q)
	}

	query := "SELECT i.id, i.feed_id, i.folder, i.title, i.authors, i.date, i.read, i.starred, i.tag, i.abstract, i.body, i.link, i.minutes FROM items i"
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}

	switch f.Sort {
	case "oldest":
		query += " ORDER BY i.date ASC, i.id ASC"
	case "unread":
		query += " ORDER BY i.read ASC, i.date DESC, i.id DESC"
	default:
		query += " ORDER BY i.date DESC, i.id DESC"
	}

	rows, err := s.db.Query(ctx, s.ph(query), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Item
	for rows.Next() {
		var it Item
		var read, starred int
		if err := rows.Scan(&it.ID, &it.FeedID, &it.Folder, &it.Title, &it.Authors, &it.Date, &read, &starred, &it.Tag, &it.Abstract, &it.Body, &it.Link, &it.Minutes); err != nil {
			return nil, err
		}
		it.Read = read == 1
		it.Starred = starred == 1
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *Store) MarkRead(ctx context.Context, id string, read bool) error {
	v := 0
	if read {
		v = 1
	}
	return s.db.Exec(ctx, s.ph("UPDATE items SET read=? WHERE id=?"), v, id)
}

func (s *Store) ToggleStar(ctx context.Context, id string) error {
	return s.db.Exec(ctx, s.ph("UPDATE items SET starred = 1 - starred WHERE id=?"), id)
}

func (s *Store) ToggleRead(ctx context.Context, id string) error {
	return s.db.Exec(ctx, s.ph("UPDATE items SET read = 1 - read WHERE id=?"), id)
}

func (s *Store) Counts(ctx context.Context) (Counts, error) {
	c := Counts{PerFeed: make(map[string]int)}

	if err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM items").Scan(&c.All); err != nil {
		return c, err
	}
	if err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE read=0").Scan(&c.Unread); err != nil {
		return c, err
	}
	if err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE read=1").Scan(&c.Read); err != nil {
		return c, err
	}
	if err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE starred=1").Scan(&c.Starred); err != nil {
		return c, err
	}

	yesterday := time.Now().Add(-24 * time.Hour).Format("2006-01-02")
	if err := s.db.QueryRow(ctx, s.ph("SELECT COUNT(*) FROM items WHERE date >= ?"), yesterday).Scan(&c.Today); err != nil {
		return c, err
	}

	rows, err := s.db.Query(ctx, "SELECT feed_id, COUNT(*) FROM items WHERE read=0 GROUP BY feed_id")
	if err != nil {
		return c, err
	}
	defer rows.Close()
	for rows.Next() {
		var fid string
		var n int
		if err := rows.Scan(&fid, &n); err != nil {
			return c, err
		}
		c.PerFeed[fid] = n
	}

	return c, rows.Err()
}

func (s *Store) ItemExists(ctx context.Context, id string) bool {
	var n int
	s.db.QueryRow(ctx, s.ph("SELECT 1 FROM items WHERE id=? LIMIT 1"), id).Scan(&n)
	return n == 1
}

func (s *Store) AddFeed(ctx context.Context, f Feed) error {
	return s.UpsertFeed(ctx, f)
}

func (s *Store) DeleteFeed(ctx context.Context, id string) error {
	if err := s.db.Exec(ctx, s.ph("DELETE FROM items WHERE feed_id=?"), id); err != nil {
		return err
	}
	return s.db.Exec(ctx, s.ph("DELETE FROM feeds WHERE id=?"), id)
}

func (s *Store) FeedCount(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, "SELECT COUNT(*) FROM feeds").Scan(&n)
	return n, err
}
