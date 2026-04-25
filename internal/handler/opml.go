package handler

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/kontrolplane/feed/internal/store"
)

// OPML structures

type opml struct {
	XMLName xml.Name `xml:"opml"`
	Version string   `xml:"version,attr"`
	Head    opmlHead `xml:"head"`
	Body    opmlBody `xml:"body"`
}

type opmlHead struct {
	Title       string `xml:"title"`
	DateCreated string `xml:"dateCreated,omitempty"`
}

type opmlBody struct {
	Outlines []opmlOutline `xml:"outline"`
}

type opmlOutline struct {
	Text     string        `xml:"text,attr"`
	Title    string        `xml:"title,attr,omitempty"`
	Type     string        `xml:"type,attr,omitempty"`
	XMLURL   string        `xml:"xmlUrl,attr,omitempty"`
	HTMLURL  string        `xml:"htmlUrl,attr,omitempty"`
	Outlines []opmlOutline `xml:"outline,omitempty"`
}

func (h *Handler) handleExportOPML(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	folders, _ := h.store.Folders(ctx)
	feeds, _ := h.store.Feeds(ctx)

	doc := opml{
		Version: "2.0",
		Head: opmlHead{
			Title:       "kontrolplane/feed",
			DateCreated: time.Now().UTC().Format(time.RFC1123Z),
		},
	}

	for _, folder := range folders {
		group := opmlOutline{Text: folder.Label, Title: folder.Label}
		for _, feed := range feeds {
			if feed.Folder == folder.ID {
				group.Outlines = append(group.Outlines, opmlOutline{
					Text:    feed.Title,
					Title:   feed.Title,
					Type:    "rss",
					XMLURL:  feed.URL,
					HTMLURL: feed.SiteURL,
				})
			}
		}
		if len(group.Outlines) > 0 {
			doc.Body.Outlines = append(doc.Body.Outlines, group)
		}
	}

	w.Header().Set("Content-Type", "application/xml")
	w.Header().Set("Content-Disposition", `attachment; filename="feeds.opml"`)
	w.Write([]byte(xml.Header))
	enc := xml.NewEncoder(w)
	enc.Indent("", "  ")
	enc.Encode(doc)
}

func (h *Handler) handleImportOPML(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	file, _, err := r.FormFile("file")
	if err != nil {
		h.logger.Error("import opml: no file", slog.Any("error", err))
		http.Error(w, "no file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, 10<<20)) // 10MB limit
	if err != nil {
		h.logger.Error("import opml: read error", slog.Any("error", err))
		http.Error(w, "failed to read file", http.StatusBadRequest)
		return
	}

	var doc opml
	if err := xml.Unmarshal(data, &doc); err != nil {
		h.logger.Error("import opml: parse error", slog.Any("error", err))
		http.Error(w, "invalid OPML file", http.StatusBadRequest)
		return
	}

	var imported int
	folderCount, _ := h.store.FolderCount(ctx)

	for _, outline := range doc.Body.Outlines {
		if outline.XMLURL != "" {
			// Top-level feed (no folder grouping)
			imported += h.importFeed(ctx, outline, "default")
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
			h.store.UpsertFolder(ctx, store.Folder{ID: folderID, Label: folderLabel}, folderCount)
			folderCount++

			for _, child := range outline.Outlines {
				imported += h.importFeed(ctx, child, folderID)
			}
		}
	}

	h.logger.Info("imported opml", slog.Int("feeds", imported))

	// Return the settings page with a refresh
	if r.Header.Get("HX-Request") == "true" {
		w.Header().Set("HX-Redirect", "/settings")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "imported %d feeds", imported)
	} else {
		http.Redirect(w, r, "/settings", http.StatusSeeOther)
	}
}

func (h *Handler) importFeed(ctx context.Context, outline opmlOutline, folderID string) int {
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

	h.store.AddFeed(ctx, store.Feed{
		ID:      id,
		Title:   title,
		URL:     outline.XMLURL,
		Folder:  folderID,
		SiteURL: outline.HTMLURL,
	})

	return 1
}
