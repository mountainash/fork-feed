package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/a-h/templ"
	"github.com/kontrolplane/feed/internal/store"
	"github.com/kontrolplane/feed/templates"
)

type Handler struct {
	store     *store.Store
	logger    *slog.Logger
	viewState templates.ViewState
	sort      string
	query     string
	lastSync  time.Time
}

func New(s *store.Store, logger *slog.Logger) *Handler {
	return &Handler{
		store:     s,
		logger:    logger,
		viewState: templates.ViewState{Kind: "view", ID: "unread"},
		sort:      "newest",
		lastSync:  time.Now(),
	}
}

func (h *Handler) SetLastSync(t time.Time) {
	h.lastSync = t
}

func (h *Handler) Register(mux *http.ServeMux) {
	// full page
	mux.HandleFunc("GET /", h.handleIndex)
	mux.HandleFunc("GET /v/{id}", h.handleIndex)
	mux.HandleFunc("GET /items/{id}", h.handleItemPage)
	mux.HandleFunc("GET /feeds/{id}", h.handleFeedOrNew)
	mux.HandleFunc("GET /folders/{id}", h.handleFolderPage)

	// partials for htmx
	mux.HandleFunc("GET /views/{id}", h.handleViewPartial)
	mux.HandleFunc("GET /partials/list", h.handleListPartial)
	mux.HandleFunc("GET /partials/sidebar", h.handleSidebarPartial)
	mux.HandleFunc("GET /partials/status", h.handleStatusPartial)
	mux.HandleFunc("GET /search", h.handleSearch)
	mux.HandleFunc("GET /settings", h.handleSettings)

	// item actions
	mux.HandleFunc("POST /items/{id}/star", h.handleStar)
	mux.HandleFunc("POST /items/{id}/toggle-read", h.handleToggleRead)

	// feed management
	mux.HandleFunc("POST /feeds/probe", h.handleProbe)
	mux.HandleFunc("POST /feeds/subscribe", h.handleSubscribe)
	mux.HandleFunc("DELETE /feeds/{id}", h.handleDeleteFeed)
}

func (h *Handler) isHTMX(r *http.Request) bool {
	return r.Header.Get("HX-Request") == "true"
}

// ---------- full page ----------

func (h *Handler) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" || strings.HasPrefix(r.URL.Path, "/v/") {
		viewID := r.PathValue("id")
		if viewID != "" {
			h.viewState = templates.ViewState{Kind: "view", ID: viewID}
		}
	}

	if h.isHTMX(r) {
		h.renderList(w, r)
		return
	}

	h.renderFullPage(w, r, nil)
}

func (h *Handler) handleItemPage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")

	item, err := h.store.ItemByID(ctx, id)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	h.store.MarkRead(ctx, id, true)
	item.Read = true

	feed, _ := h.store.FeedByID(ctx, item.FeedID)

	if h.isHTMX(r) {
		rd := templates.ReaderData{Item: item, Feed: feed}
		h.renderComponent(w, r, templates.Reader(rd))
		h.renderOOBSidebar(w, r)
		h.renderOOBStatus(w, r)
		return
	}

	h.renderFullPage(w, r, item)
}

func (h *Handler) handleFeedOrNew(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "new" {
		h.handleAddFeedModal(w, r)
		return
	}

	h.viewState = templates.ViewState{Kind: "feed", ID: id}
	h.query = ""

	if h.isHTMX(r) {
		h.renderList(w, r)
		h.renderOOBSidebar(w, r)
		h.renderOOBStatus(w, r)
		h.renderOOBReaderReset(w, r)
		return
	}
	h.renderFullPage(w, r, nil)
}

func (h *Handler) handleFolderPage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	h.viewState = templates.ViewState{Kind: "folder", ID: id}
	h.query = ""

	if h.isHTMX(r) {
		h.renderList(w, r)
		h.renderOOBSidebar(w, r)
		h.renderOOBStatus(w, r)
		h.renderOOBReaderReset(w, r)
		return
	}
	h.renderFullPage(w, r, nil)
}

// ---------- partials ----------

func (h *Handler) handleViewPartial(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	h.viewState = templates.ViewState{Kind: "view", ID: id}
	h.query = ""

	h.renderList(w, r)
	h.renderOOBSidebar(w, r)
	h.renderOOBStatus(w, r)
	h.renderOOBReaderReset(w, r)
}

func (h *Handler) handleListPartial(w http.ResponseWriter, r *http.Request) {
	if s := r.URL.Query().Get("sort"); s != "" {
		h.sort = s
	}
	h.renderList(w, r)
}

func (h *Handler) handleSidebarPartial(w http.ResponseWriter, r *http.Request) {
	sd := h.sidebarData(r.Context())
	h.renderComponent(w, r, templates.Sidebar(sd))
}

func (h *Handler) handleStatusPartial(w http.ResponseWriter, r *http.Request) {
	sd := h.statusData(r.Context())
	h.renderComponent(w, r, templates.Status(sd))
}

func (h *Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	h.query = r.URL.Query().Get("q")
	h.renderList(w, r)
}

func (h *Handler) handleSettings(w http.ResponseWriter, r *http.Request) {
	if h.isHTMX(r) {
		h.viewState = templates.ViewState{Kind: "view", ID: "settings"}
		h.renderComponent(w, r, templates.Settings())
		h.renderOOBSidebar(w, r)
		h.renderOOBStatus(w, r)
		return
	}
	h.viewState = templates.ViewState{Kind: "view", ID: "settings"}
	h.renderFullPage(w, r, nil)
}

// ---------- item actions ----------

func (h *Handler) handleStar(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	h.store.ToggleStar(ctx, id)

	item, err := h.store.ItemByID(ctx, id)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	feed, _ := h.store.FeedByID(ctx, item.FeedID)

	target := r.Header.Get("HX-Target")
	if target == "reader" {
		rd := templates.ReaderData{Item: item, Feed: feed}
		h.renderComponent(w, r, templates.Reader(rd))
	} else {
		feeds, _ := h.store.Feeds(ctx)
		var f *store.Feed
		for _, ff := range feeds {
			if ff.ID == item.FeedID {
				f = &ff
				break
			}
		}
		h.renderComponent(w, r, templates.ItemRow(*item, 0, f))
	}
	h.renderOOBSidebar(w, r)
	h.renderOOBStatus(w, r)
}

func (h *Handler) handleToggleRead(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	h.store.ToggleRead(ctx, id)

	item, _ := h.store.ItemByID(ctx, id)
	feed, _ := h.store.FeedByID(ctx, item.FeedID)

	rd := templates.ReaderData{Item: item, Feed: feed}
	h.renderComponent(w, r, templates.Reader(rd))
	h.renderOOBSidebar(w, r)
	h.renderOOBStatus(w, r)
}

// ---------- feed management ----------

func (h *Handler) handleAddFeedModal(w http.ResponseWriter, r *http.Request) {
	folders, _ := h.store.Folders(r.Context())
	h.renderComponent(w, r, templates.AddFeedModal(folders))
}

func (h *Handler) handleProbe(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	url := r.FormValue("url")
	folders, _ := h.store.Folders(r.Context())
	h.renderComponent(w, r, templates.ProbeResults(url, folders))
}

func (h *Handler) handleSubscribe(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.ParseForm()
	feedURL := r.FormValue("feed_url")
	folder := r.FormValue("folder")

	if feedURL != "" && folder != "" {
		title := r.FormValue("title")
		if title == "" {
			title = feedURL
		}
		id := strings.ReplaceAll(strings.TrimPrefix(strings.TrimPrefix(feedURL, "https://"), "http://"), "/", "-")
		if len(id) > 32 {
			id = id[:32]
		}
		h.store.AddFeed(ctx, store.Feed{
			ID:     id,
			Title:  title,
			URL:    feedURL,
			Folder: folder,
		})
	}

	sd := h.sidebarData(ctx)
	h.renderComponent(w, r, templates.Sidebar(sd))
}

func (h *Handler) handleDeleteFeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")

	if err := h.store.DeleteFeed(ctx, id); err != nil {
		h.logger.Error("delete feed", slog.String("id", id), slog.Any("err", err))
		http.Error(w, "failed to delete feed", http.StatusInternalServerError)
		return
	}

	// reset view to unread if we were viewing the deleted feed
	if h.viewState.Kind == "feed" && h.viewState.ID == id {
		h.viewState = templates.ViewState{Kind: "view", ID: "unread"}
	}

	h.renderList(w, r)
	h.renderOOBSidebar(w, r)
	h.renderOOBStatus(w, r)
	h.renderOOBReaderReset(w, r)
}

// ---------- helpers ----------

func (h *Handler) renderComponent(w http.ResponseWriter, r *http.Request, c templ.Component) {
	c.Render(r.Context(), w)
}

func (h *Handler) renderOOBSidebar(w http.ResponseWriter, r *http.Request) {
	sd := h.sidebarData(r.Context())
	templates.OOBSidebar(sd).Render(r.Context(), w)
}

func (h *Handler) renderOOBStatus(w http.ResponseWriter, r *http.Request) {
	sd := h.statusData(r.Context())
	templates.OOBStatus(sd).Render(r.Context(), w)
}

func (h *Handler) renderOOBReaderReset(w http.ResponseWriter, r *http.Request) {
	templates.OOBReaderReset().Render(r.Context(), w)
}

func (h *Handler) renderList(w http.ResponseWriter, r *http.Request) {
	ld := h.listData(r.Context())
	h.renderComponent(w, r, templates.ItemList(ld))
}

func (h *Handler) renderFullPage(w http.ResponseWriter, r *http.Request, activeItem *store.Item) {
	ctx := r.Context()
	var feed *store.Feed
	if activeItem != nil {
		feed, _ = h.store.FeedByID(ctx, activeItem.FeedID)
	}

	pd := templates.PageData{
		Sidebar: h.sidebarData(ctx),
		List:    h.listData(ctx),
		Reader:  templates.ReaderData{Item: activeItem, Feed: feed},
		Status:  h.statusData(ctx),
	}

	templates.Page(pd).Render(ctx, w)
}

func (h *Handler) sidebarData(ctx context.Context) templates.SidebarData {
	folders, _ := h.store.Folders(ctx)
	feeds, _ := h.store.Feeds(ctx)
	counts, _ := h.store.Counts(ctx)
	return templates.SidebarData{
		Folders: folders,
		Feeds:   feeds,
		Counts:  counts,
		View:    h.viewState,
	}
}

func (h *Handler) listData(ctx context.Context) templates.ListData {
	feeds, _ := h.store.Feeds(ctx)
	items, _ := h.store.ListItems(ctx, store.ListFilter{
		ViewKind: h.viewState.Kind,
		ViewID:   h.viewState.ID,
		Query:    h.query,
		Sort:     h.sort,
	})

	return templates.ListData{
		Items: items,
		Feeds: feeds,
		View:  h.viewState,
		Sort:  h.sort,
		Title: h.viewTitle(ctx),
		Crumb: h.viewCrumb(ctx),
	}
}

func (h *Handler) statusData(ctx context.Context) templates.StatusData {
	counts, _ := h.store.Counts(ctx)
	items, _ := h.store.ListItems(ctx, store.ListFilter{
		ViewKind: h.viewState.Kind,
		ViewID:   h.viewState.ID,
		Query:    h.query,
		Sort:     h.sort,
	})
	feedCount, _ := h.store.FeedCount(ctx)

	syncAgo := time.Since(h.lastSync)
	var syncStr string
	if syncAgo < time.Minute {
		syncStr = fmt.Sprintf("last sync %ds ago", int(syncAgo.Seconds()))
	} else {
		syncStr = fmt.Sprintf("last sync %dm ago", int(syncAgo.Minutes()))
	}

	return templates.StatusData{
		ViewTitle:   h.viewTitle(ctx),
		FilteredLen: len(items),
		TotalLen:    counts.All,
		UnreadCount: counts.Unread,
		FeedCount:   feedCount,
		LastSync:    syncStr,
	}
}

func (h *Handler) viewTitle(ctx context.Context) string {
	switch h.viewState.Kind {
	case "feed":
		f, err := h.store.FeedByID(ctx, h.viewState.ID)
		if err == nil {
			return f.Title
		}
	case "folder":
		folders, _ := h.store.Folders(ctx)
		for _, f := range folders {
			if f.ID == h.viewState.ID {
				return f.Label
			}
		}
	case "view":
		switch h.viewState.ID {
		case "all":
			return "all items"
		case "unread":
			return "unread"
		case "read":
			return "read"
		case "starred":
			return "starred"
		case "today":
			return "today"
		case "settings":
			return "settings"
		}
	}
	return "index"
}

func (h *Handler) viewCrumb(ctx context.Context) string {
	switch h.viewState.Kind {
	case "feed":
		f, err := h.store.FeedByID(ctx, h.viewState.ID)
		if err == nil {
			return fmt.Sprintf("[ feed / %s ]", f.Folder)
		}
	case "folder":
		return fmt.Sprintf("[ folder / %s ]", h.viewState.ID)
	case "view":
		return fmt.Sprintf("[ index / %s ]", h.viewState.ID)
	}
	return ""
}

// statusWriter wraps http.ResponseWriter to capture the status code.
type statusWriter struct {
	http.ResponseWriter
	code int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.code = code
	sw.ResponseWriter.WriteHeader(code)
}

// formatDuration returns a human-readable duration string in ms or s.
func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%.1fms", float64(d.Microseconds())/1000.0)
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}

// LogRequests is a logging middleware that only logs errors (status >= 500).
func LogRequests(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w, code: http.StatusOK}
			next.ServeHTTP(sw, r)
			if sw.code >= 500 {
				logger.Error("request",
					slog.String("method", r.Method),
					slog.String("path", r.URL.Path),
					slog.Int("status", sw.code),
					slog.String("duration", formatDuration(time.Since(start))),
				)
			}
		})
	}
}
