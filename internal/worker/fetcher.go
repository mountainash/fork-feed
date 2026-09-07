package worker

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	readability "codeberg.org/readeck/go-readability/v2"
	"github.com/kontrolplane/feed/internal/store"
	"github.com/mmcdole/gofeed"
)

// fetchTimeout bounds how long a single feed's HTTP request and parsing may
// take before it is abandoned, so that one slow or hanging feed cannot stall
// the whole fetch cycle.
const fetchTimeout = 30 * time.Second

// httpClient is used for all feed requests. It sets an overall timeout so a
// non-responsive or slow-drip server cannot hang a fetch indefinitely.
var httpClient = &http.Client{
	Timeout: fetchTimeout,
}

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
	start := time.Now()
	f.logger.Info("starting feed fetch cycle")

	feeds, err := f.store.Feeds(ctx)
	if err != nil {
		f.logger.Error("error listing feeds", slog.Any("error", err))
		return
	}
	f.logger.Info("fetching feeds", slog.Int("count", len(feeds)))

	parser := gofeed.NewParser()
	var fetched, errors int

	for _, feed := range feeds {
		items, err := f.fetchFeedSafely(ctx, parser, feed)
		if err != nil {
			f.logger.Error("error fetching feed",
				slog.String("feed", feed.Title),
				slog.String("url", feed.URL),
				slog.Any("error", err),
			)
			errors++
			continue
		}
		fetched++
		for _, item := range items {
			if !f.store.ItemExists(ctx, item.ID) {
				if err := f.store.UpsertItem(ctx, item); err != nil {
					f.logger.Error("error saving item",
						slog.String("feed", feed.Title),
						slog.Any("error", err),
					)
				}
			}
		}
	}

	f.logger.Info("finished feed fetch cycle",
		slog.Int("fetched", fetched),
		slog.Int("errors", errors),
		slog.Duration("duration", time.Since(start)),
	)

	if f.onSync != nil {
		f.onSync(time.Now())
	}
}

// fetchFeedSafely wraps fetchFeed with a per-feed timeout and panic recovery
// so that a single malformed or hanging feed cannot stall or crash the
// entire fetch cycle.
func (f *Fetcher) fetchFeedSafely(ctx context.Context, parser *gofeed.Parser, feed store.Feed) (items []store.Item, err error) {
	defer func() {
		if r := recover(); r != nil {
			f.logger.Error("panic while fetching feed",
				slog.String("feed", feed.Title),
				slog.String("url", feed.URL),
				slog.Any("panic", r),
			)
			err = fmt.Errorf("panic while fetching feed: %v", r)
		}
	}()

	fetchCtx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	start := time.Now()
	f.logger.Debug("fetching feed", slog.String("feed", feed.Title), slog.String("url", feed.URL))

	items, err = f.fetchFeed(fetchCtx, parser, feed)

	f.logger.Debug("fetch feed done",
		slog.String("feed", feed.Title),
		slog.Int("items", len(items)),
		slog.Duration("duration", time.Since(start)),
		slog.Any("error", err),
	)

	return items, err
}

func (f *Fetcher) fetchFeed(ctx context.Context, parser *gofeed.Parser, feed store.Feed) ([]store.Item, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http error: %s", resp.Status)
	}

	f.logger.Debug("parsing feed", slog.String("feed", feed.Title), slog.String("url", feed.URL))
	parsed, err := parser.Parse(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("parsing feed: %w", err)
	}
	f.logger.Debug("parsed feed", slog.String("feed", feed.Title), slog.Int("entries", len(parsed.Items)))

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

func (f *Fetcher) extractArticle(url string) (result string) {
	defer func() {
		if r := recover(); r != nil {
			f.logger.Error("panic during readability extraction",
				slog.String("url", url),
				slog.Any("panic", r),
			)
			result = ""
		}
	}()

	start := time.Now()
	article, err := readability.FromURL(url, 15*time.Second)
	if err != nil {
		f.logger.Debug("readability extraction failed",
			slog.String("url", url),
			slog.Any("error", err),
			slog.Duration("duration", time.Since(start)),
		)
		return ""
	}
	if article.Node == nil {
		return ""
	}
	var buf strings.Builder
	if err := article.RenderHTML(&buf); err != nil {
		f.logger.Debug("readability render failed", slog.String("url", url), slog.Any("error", err))
		return ""
	}
	f.logger.Debug("readability extraction succeeded",
		slog.String("url", url),
		slog.Duration("duration", time.Since(start)),
	)
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
