package store

import (
	"context"
	"encoding/xml"
	"fmt"
	"os"
	"strings"
)

type opml struct {
	XMLName xml.Name `xml:"opml"`
	Body    opmlBody `xml:"body"`
}

type opmlBody struct {
	Outlines []opmlOutline `xml:"outline"`
}

type opmlOutline struct {
	Text     string        `xml:"text,attr"`
	Title    string        `xml:"title,attr,omitempty"`
	XMLURL   string        `xml:"xmlUrl,attr,omitempty"`
	HTMLURL  string        `xml:"htmlUrl,attr,omitempty"`
	Outlines []opmlOutline `xml:"outline,omitempty"`
}

// ImportOPMLFile reads an OPML file from the given path and imports all feeds
// into the store. Folders are created as needed.
func ImportOPMLFile(ctx context.Context, s *Store, path string) (int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, fmt.Errorf("read feeds file: %w", err)
	}

	var doc opml
	if err := xml.Unmarshal(data, &doc); err != nil {
		return 0, fmt.Errorf("parse feeds file: %w", err)
	}

	var imported int
	folderCount, _ := s.FolderCount(ctx)

	for _, outline := range doc.Body.Outlines {
		if outline.XMLURL != "" {
			// Top-level feed (no folder grouping) — put in default
			if err := s.UpsertFolder(ctx, Folder{ID: "default", Label: "default"}, folderCount); err != nil {
				return imported, err
			}
			imported += importFeed(ctx, s, outline, "default")
		} else {
			// Folder with nested feeds
			folderID := strings.ToLower(strings.ReplaceAll(outline.Text, " ", "-"))
			if folderID == "" {
				folderID = "default"
			}
			folderLabel := outline.Text
			if folderLabel == "" {
				folderLabel = "default"
			}
			if err := s.UpsertFolder(ctx, Folder{ID: folderID, Label: folderLabel}, folderCount); err != nil {
				return imported, err
			}
			folderCount++

			for _, child := range outline.Outlines {
				imported += importFeed(ctx, s, child, folderID)
			}
		}
	}

	return imported, nil
}

func importFeed(ctx context.Context, s *Store, outline opmlOutline, folderID string) int {
	if outline.XMLURL == "" {
		return 0
	}

	title := outline.Title
	if title == "" {
		title = outline.Text
	}
	if title == "" {
		title = outline.XMLURL
	}

	id := strings.ReplaceAll(strings.TrimPrefix(strings.TrimPrefix(outline.XMLURL, "https://"), "http://"), "/", "-")
	if len(id) > 32 {
		id = id[:32]
	}

	s.AddFeed(ctx, Feed{
		ID:      id,
		Title:   title,
		URL:     outline.XMLURL,
		Folder:  folderID,
		SiteURL: outline.HTMLURL,
	})

	return 1
}
