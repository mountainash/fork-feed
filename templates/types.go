package templates

import "github.com/kontrolplane/feed/internal/store"

type ViewState struct {
	Kind string // "view", "feed", "folder"
	ID   string
}

type SidebarData struct {
	Folders []store.Folder
	Feeds   []store.Feed
	Counts  store.Counts
	View    ViewState
}

type ListData struct {
	Items []store.Item
	Feeds []store.Feed
	View  ViewState
	Sort  string
	Title string
	Crumb string
}

type ReaderData struct {
	Item   *store.Item
	Feed   *store.Feed
	PrevID string
	NextID string
}

type StatusData struct {
	ViewTitle   string
	FilteredLen int
	TotalLen    int
	UnreadCount int
	FeedCount   int
	LastSync    string
}

type ManageData struct {
	Feeds   []store.Feed
	Folders []store.Folder
}

type PageData struct {
	Sidebar SidebarData
	List    ListData
	Reader  ReaderData
	Status  StatusData
	Manage  ManageData
}
