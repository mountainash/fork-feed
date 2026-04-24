package worker

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"strings"
	"time"

	readability "codeberg.org/readeck/go-readability/v2"
	"github.com/kontrolplane/feed/internal/store"
	"github.com/mmcdole/gofeed"
)

type Fetcher struct {
	store    *store.Store
	logger   *slog.Logger
	interval time.Duration
	onSync   func(time.Time)
}

func NewFetcher(s *store.Store, logger *slog.Logger, interval time.Duration, onSync func(time.Time)) *Fetcher {
	return &Fetcher{store: s, logger: logger, interval: interval, onSync: onSync}
}

func (f *Fetcher) Start(ctx context.Context) {
	go func() {
		// initial fetch after a short delay
		select {
		case <-time.After(5 * time.Second):
			f.fetchAll(ctx)
		case <-ctx.Done():
			return
		}

		ticker := time.NewTicker(f.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				f.fetchAll(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (f *Fetcher) fetchAll(ctx context.Context) {
	feeds, err := f.store.Feeds(ctx)
	if err != nil {
		f.logger.Error("error listing feeds", slog.Any("error", err))
		return
	}

	parser := gofeed.NewParser()
	var fetched, errors int

	for _, feed := range feeds {
		items, err := f.fetchFeed(ctx, parser, feed)
		if err != nil {
			f.logger.Error("error fetching feed",
				slog.String("feed", feed.Title),
				slog.Any("error", err),
			)
			errors++
			continue
		}
		fetched++
		for _, item := range items {
			if !f.store.ItemExists(ctx, item.ID) {
				if err := f.store.UpsertItem(ctx, item); err != nil {
					f.logger.Error("error saving item", slog.Any("error", err))
				}
			}
		}
	}

	if f.onSync != nil {
		f.onSync(time.Now())
	}
}

func (f *Fetcher) fetchFeed(ctx context.Context, parser *gofeed.Parser, feed store.Feed) ([]store.Item, error) {
	parsed, err := parser.ParseURLWithContext(feed.URL, ctx)
	if err != nil {
		return nil, err
	}

	var items []store.Item
	for _, entry := range parsed.Items {
		guid := entry.GUID
		if guid == "" {
			guid = entry.Link
		}
		if guid == "" {
			guid = entry.Title
		}

		id := fmt.Sprintf("%x", sha256.Sum256([]byte(feed.ID+":"+guid)))[:16]

		date := time.Now().Format("2006-01-02")
		if entry.PublishedParsed != nil {
			date = entry.PublishedParsed.Format("2006-01-02")
		} else if entry.UpdatedParsed != nil {
			date = entry.UpdatedParsed.Format("2006-01-02")
		}

		authors := ""
		if entry.Author != nil {
			authors = entry.Author.Name
		}
		if len(entry.Authors) > 0 {
			names := make([]string, 0, len(entry.Authors))
			for _, a := range entry.Authors {
				if a.Name != "" {
					names = append(names, a.Name)
				}
			}
			if len(names) > 0 {
				authors = strings.Join(names, " · ")
			}
		}

		abstract := entry.Description
		if abstract == "" {
			abstract = entry.Content
		}
		abstract = stripHTML(abstract)
		if len(abstract) > 300 {
			abstract = abstract[:300] + "…"
		}

		tag := guessTag(entry)

		wordCount := len(strings.Fields(entry.Content))
		if wordCount == 0 {
			wordCount = len(strings.Fields(abstract))
		}
		minutes := wordCount / 200
		if minutes < 1 {
			minutes = 3
		}

		body := entry.Content
		if entry.Link != "" {
			if extracted := f.extractArticle(entry.Link); extracted != "" {
				body = extracted
				// Recalculate word count and reading time from full content
				wordCount = len(strings.Fields(stripHTML(body)))
				minutes = wordCount / 200
				if minutes < 1 {
					minutes = 3
				}
			}
		}

		items = append(items, store.Item{
			ID:       id,
			FeedID:   feed.ID,
			Folder:   feed.Folder,
			Title:    entry.Title,
			Authors:  authors,
			Date:     date,
			Tag:      tag,
			Abstract: abstract,
			Body:     body,
			Link:     entry.Link,
			Minutes:  minutes,
		})
	}

	return items, nil
}

func (f *Fetcher) extractArticle(url string) string {
	article, err := readability.FromURL(url, 15*time.Second)
	if err != nil {
		f.logger.Debug("readability extraction failed", slog.String("url", url), slog.Any("error", err))
		return ""
	}
	if article.Node == nil {
		return ""
	}
	var buf strings.Builder
	if err := article.RenderHTML(&buf); err != nil {
		return ""
	}
	return buf.String()
}

func stripHTML(s string) string {
	var out strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			out.WriteRune(r)
		}
	}
	return strings.TrimSpace(out.String())
}

func guessTag(entry *gofeed.Item) string {
	if len(entry.Categories) > 0 {
		cat := strings.ToLower(entry.Categories[0])
		if len(cat) > 20 {
			cat = cat[:20]
		}
		return cat
	}
	if entry.Content != "" && len(entry.Content) > 2000 {
		return "article"
	}
	return "post"
}
