package store

import "context"

func Seed(ctx context.Context, s *Store) error {
	folders := []Folder{
		{ID: "default", Label: "default"},
	}
	for i, f := range folders {
		if err := s.UpsertFolder(ctx, f, i); err != nil {
			return err
		}
	}

	feeds := []Feed{
		{
			ID:     "hacker-news",
			Title:  "hacker news",
			URL:    "https://news.ycombinator.com/rss",
			Folder: "default",
		},
		{
			ID:     "cncf",
			Title:  "cloud native computing foundation",
			URL:    "http://cncf.io/feed",
			Folder: "default",
		},
	}
	for _, f := range feeds {
		if err := s.UpsertFeed(ctx, f); err != nil {
			return err
		}
	}

	return nil
}
