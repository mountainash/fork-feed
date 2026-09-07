package worker

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kontrolplane/feed/internal/store"
	"github.com/mmcdole/gofeed"
)

func TestFetchFeedSkipsNon200Responses(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()

	fetcher := &Fetcher{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	_, err := fetcher.fetchFeed(context.Background(), gofeed.NewParser(), store.Feed{ID: "feed-1", URL: server.URL})
	if err == nil {
		t.Fatal("expected an error for non-200 response")
	}
	if !strings.Contains(err.Error(), "http error: 404 Not Found") {
		t.Fatalf("expected 404 error, got %v", err)
	}
}

func TestFetchFeedParsesValidFeed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Item One</title>
      <description>Hello world</description>
    </item>
  </channel>
</rss>`))
	}))
	defer server.Close()

	fetcher := &Fetcher{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	items, err := fetcher.fetchFeed(context.Background(), gofeed.NewParser(), store.Feed{ID: "feed-1", URL: server.URL})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected one parsed item, got %d", len(items))
	}
	if items[0].Title != "Item One" {
		t.Fatalf("expected title Item One, got %q", items[0].Title)
	}
}

func TestFetchFeedSafelyRecoversFromMalformedFeed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = w.Write([]byte(`not a valid feed at all <<<`))
	}))
	defer server.Close()

	fetcher := &Fetcher{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	items, err := fetcher.fetchFeedSafely(context.Background(), gofeed.NewParser(), store.Feed{ID: "feed-1", URL: server.URL})
	if err == nil {
		t.Fatal("expected an error for malformed feed")
	}
	if items != nil {
		t.Fatalf("expected no items, got %v", items)
	}
}

func TestFetchFeedSafelyRecoversFromPanic(t *testing.T) {
	fetcher := &Fetcher{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<rss></rss>`))
	}))
	defer server.Close()

	// panicParser deterministically panics when parsing, exercising the
	// panic-recovery path in fetchFeedSafely independently of gofeed's
	// internal behavior.
	items, err := fetcher.fetchFeedSafely(context.Background(), panicParser{}, store.Feed{ID: "feed-1", URL: server.URL})
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !strings.Contains(err.Error(), "panic while fetching feed") {
		t.Fatalf("expected panic error, got %v", err)
	}
	if items != nil {
		t.Fatalf("expected no items, got %v", items)
	}
}

type panicParser struct{}

func (panicParser) Parse(io.Reader) (*gofeed.Feed, error) {
	panic("simulated parser panic")
}
