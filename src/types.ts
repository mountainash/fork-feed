export interface Feed {
  id: string;
  title: string;
  url: string;
  folder: string;
  siteUrl: string;
}

export interface Folder {
  id: string;
  label: string;
}

export interface Item {
  id: string;
  feedId: string;
  folder: string;
  title: string;
  authors: string;
  date: string;
  read: boolean;
  starred: boolean;
  tag: string;
  abstract: string;
  body: string;
  link: string;
  minutes: number;
}

export interface Counts {
  all: number;
  unread: number;
  read: number;
  starred: number;
  today: number;
  yesterday: number;
  lastWeek: number;
  lastMonth: number;
  perFeed: Record<string, number>;
}

export interface ListFilter {
  viewKind: string;
  viewId: string;
  query: string;
  sort: string;
}

export interface ViewState {
  kind: string;
  id: string;
}

export interface SidebarData {
  folders: Folder[];
  feeds: Feed[];
  counts: Counts;
  view: ViewState;
}

export interface ListData {
  items: Item[];
  feeds: Feed[];
  view: ViewState;
  sort: string;
  title: string;
  crumb: string;
}

export interface ReaderData {
  item: Item | null;
  feed: Feed | null;
  prevId: string;
  nextId: string;
}

export interface StatusData {
  viewTitle: string;
  filteredLen: number;
  totalLen: number;
  unreadCount: number;
  feedCount: number;
  lastSync: string;
}

export interface SettingsData {
  databaseDriver: string;
  databaseInfo: string;
  refreshInterval: string;
  markReadOn: string;
  retention: string;
  density: string;
  version: string;
}

export interface ManageData {
  feeds: Feed[];
  folders: Folder[];
}

export interface PageData {
  sidebar: SidebarData;
  list: ListData;
  reader: ReaderData;
  status: StatusData;
  manage: ManageData;
  settings: SettingsData;
}
