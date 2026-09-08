import { loadConfig } from "./config";
import { openDb } from "./db";
import { createFetcher, fetchText, parseFeedMeta } from "./fetcher";
import { exportOpml, feedIdForUrl, importOpml, importOpmlFileAsync } from "./opml";
import { Store } from "./store";
import type { ListData, ManageData, PageData, ReaderData, SettingsData, SidebarData, StatusData, ViewState } from "./types";
import { itemRow, oobReaderReset, oobSidebar, oobStatus, readerContent } from "./views/partials";
import {
  addFeedModal,
  addFolderModal,
  manageFeedConfirmDelete,
  manageFeedEdit,
  manageFolderConfirmDelete,
  manageView,
  page as renderPage,
  probeError,
  probeResults,
  settingsView,
} from "./views/pages";
import { itemList, sidebar, status } from "./views/partials";

const cfg = loadConfig();
const debug = cfg.debug;
const log = (...args: unknown[]) => console.log(...args);
const debugLog = (...args: unknown[]) => {
  if (debug) console.debug(...args);
};

const db = openDb(cfg.databasePath);
const store = new Store(db);

let viewState: ViewState = { kind: "view", id: "unread" };
let sort = "newest";
let query = "";
let lastSync = new Date();

if (cfg.feedsFile) {
  try {
    const n = await importOpmlFileAsync(store, cfg.feedsFile);
    log(`imported feeds from file path=${cfg.feedsFile} feeds=${n}`);
  } catch (err) {
    console.error("failed to import feeds file", err);
    process.exit(1);
  }
}

if (cfg.seed) {
  store.seed();
  log("seeded default feeds");
}

const fetcher = createFetcher(store, cfg.refreshIntervalMs, (t) => {
  lastSync = t;
}, debug);
fetcher.start();

function sidebarData(): SidebarData {
  return { folders: store.folders(), feeds: store.feeds(), counts: store.counts(), view: viewState };
}

function settingsData(): SettingsData {
  return {
    databaseDriver: "sqlite",
    databaseInfo: cfg.databasePath,
    refreshInterval: cfg.refreshLabel,
    markReadOn: cfg.markReadOn,
    retention: cfg.retention,
    density: cfg.density,
  };
}

function manageData(): ManageData {
  return { feeds: store.feeds(), folders: store.folders() };
}

function viewTitle(): string {
  switch (viewState.kind) {
    case "feed": {
      const f = store.feedById(viewState.id);
      if (f) return f.title;
      break;
    }
    case "folder": {
      for (const f of store.folders()) if (f.id === viewState.id) return f.label;
      break;
    }
    case "view":
      switch (viewState.id) {
        case "all": return "all items";
        case "unread": return "unread";
        case "read": return "read";
        case "starred": return "starred";
        case "today": return "today";
        case "yesterday": return "yesterday";
        case "last-week": return "last week";
        case "last-month": return "last month";
        case "settings": return "settings";
        case "manage": return "manage feeds";
      }
      break;
  }
  return "index";
}

function viewCrumb(): string {
  switch (viewState.kind) {
    case "feed": {
      const f = store.feedById(viewState.id);
      if (f) return `[ feed / ${f.folder} ]`;
      break;
    }
    case "folder":
      return `[ folder / ${viewState.id} ]`;
    case "view":
      return `[ index / ${viewState.id} ]`;
  }
  return "";
}

function listData(): ListData {
  const feeds = store.feeds();
  const items = store.listItems({ viewKind: viewState.kind, viewId: viewState.id, query, sort });
  return { items, feeds, view: viewState, sort, title: viewTitle(), crumb: viewCrumb() };
}

function readerData(itemId: string | null): ReaderData {
  const item = itemId ? store.itemById(itemId) : null;
  const feed = item ? store.feedById(item.feedId) : null;
  const rd: ReaderData = { item, feed, prevId: "", nextId: "" };
  if (item) {
    const items = store.listItems({ viewKind: viewState.kind, viewId: viewState.id, query, sort });
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === item.id) {
        if (i > 0) rd.prevId = items[i - 1].id;
        if (i < items.length - 1) rd.nextId = items[i + 1].id;
        break;
      }
    }
  }
  return rd;
}

function lastSyncStr(): string {
  const ago = Date.now() - lastSync.getTime();
  if (ago < 60_000) return `last sync ${Math.floor(ago / 1000)}s ago`;
  return `last sync ${Math.floor(ago / 60000)}m ago`;
}

function statusData(): StatusData {
  const counts = store.counts();
  const items = store.listItems({ viewKind: viewState.kind, viewId: viewState.id, query, sort });
  return {
    viewTitle: viewTitle(),
    filteredLen: items.length,
    totalLen: counts.all,
    unreadCount: counts.unread,
    feedCount: store.feedCount(),
    lastSync: lastSyncStr(),
  };
}

function fullPageHtml(activeItemId: string | null): string {
  const ld = listData();
  return renderPage({
    sidebar: sidebarData(),
    list: ld,
    reader: readerData(activeItemId),
    status: statusData(),
    manage: manageData(),
    settings: settingsData(),
  });
}

function renderList(): string {
  return itemList(listData());
}

const isHtmx = (req: Request) => req.headers.get("HX-Request") === "true";
const html = (body: string, statusCode = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status: statusCode, headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });

async function resolveFolder(form: FormData): Promise<string> {
  const folder = String(form.get("folder") ?? "");
  if (folder === "__new__") {
    const name = String(form.get("new_folder") ?? "").trim();
    if (name !== "") {
      const id = name.toLowerCase().replaceAll(" ", "-");
      store.upsertFolder({ id, label: name }, store.folderCount());
      return id;
    }
  }
  return folder;
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  if (path.startsWith("/static/")) {
    const rel = path.slice("/static/".length);
    if (rel.includes("..")) return new Response("not found", { status: 404 });
    const file = Bun.file(`static/${rel}`);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    const type = rel.endsWith(".css") ? "text/css" : rel.endsWith(".js") ? "text/javascript" : rel.endsWith(".ico") ? "image/x-icon" : rel.endsWith(".png") ? "image/png" : "application/octet-stream";
    return new Response(file, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" } });
  }

  if (method === "GET" && (path === "/" || path.startsWith("/v/"))) {
    const id = path.startsWith("/v/") ? decodeURIComponent(path.slice(3)) : "";
    if (id !== "") viewState = { kind: "view", id };
    if (isHtmx(req)) return html(renderList());
    return html(fullPageHtml(null));
  }

  let m: RegExpExecArray | null;

  if (method === "GET" && (m = /^\/items\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    const item = store.itemById(id);
    if (!item) return new Response("not found", { status: 404 });
    store.markRead(id, true);
    item.read = true;
    const rd = readerData(id);
    if (isHtmx(req)) {
      const feed = rd.feed;
      const body =
        readerContent({
          id: item.id,
          title: item.title,
          tag: item.tag,
          date: item.date,
          minutes: item.minutes,
          folder: item.folder,
          authors: item.authors,
          abstract: item.abstract,
          body: item.body,
          link: item.link,
          feedTitle: feed?.title ?? null,
          feedUrl: feed?.url ?? null,
          starred: item.starred,
          read: true,
          prevId: rd.prevId,
          nextId: rd.nextId,
        }) + oobSidebar(sidebarData()) + oobStatus(statusData());
      return html(body);
    }
    return html(fullPageHtml(id));
  }

  if (method === "GET" && path === "/feeds/new") {
    return html(addFeedModal(store.folders()));
  }

  if (method === "GET" && (m = /^\/feeds\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    if (id === "new") return html(addFeedModal(store.folders()));
    viewState = { kind: "feed", id };
    query = "";
    if (isHtmx(req)) return html(renderList() + oobSidebar(sidebarData()) + oobStatus(statusData()) + oobReaderReset());
    return html(fullPageHtml(null));
  }

  if (method === "GET" && path === "/folders/new") return html(addFolderModal());

  if (method === "POST" && path === "/folders") {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    if (name === "") return new Response("name required", { status: 400 });
    const id = name.toLowerCase().replaceAll(" ", "-");
    store.upsertFolder({ id, label: name }, store.folderCount());
    return html(sidebar(sidebarData()));
  }

  if (method === "GET" && (m = /^\/folders\/([^/]+)\/confirm-delete$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    const folders = store.folders();
    const folder = folders.find((f) => f.id === id);
    if (!folder) return new Response("not found", { status: 404 });
    const feedCount = store.feeds().filter((f) => f.folder === id).length;
    return html(manageFolderConfirmDelete(folder, feedCount));
  }

  if (method === "DELETE" && (m = /^\/folders\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    try {
      store.deleteFolder(id);
    } catch (err) {
      console.error("delete folder", err);
      return new Response("failed to delete folder", { status: 500 });
    }
    if (viewState.kind === "folder" && viewState.id === id) viewState = { kind: "view", id: "unread" };
    viewState = { kind: "view", id: "manage" };
    return html(manageView(manageData()) + oobSidebar(sidebarData()) + oobStatus(statusData()));
  }

  if (method === "GET" && (m = /^\/folders\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    viewState = { kind: "folder", id };
    query = "";
    if (isHtmx(req)) return html(renderList() + oobSidebar(sidebarData()) + oobStatus(statusData()) + oobReaderReset());
    return html(fullPageHtml(null));
  }

  if (method === "GET" && (m = /^\/views\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    viewState = { kind: "view", id };
    query = "";
    return html(renderList() + oobSidebar(sidebarData()) + oobStatus(statusData()) + oobReaderReset());
  }

  if (method === "GET" && path === "/partials/list") {
    const s = url.searchParams.get("sort");
    if (s) sort = s;
    return html(renderList());
  }

  if (method === "GET" && path === "/partials/sidebar") return html(sidebar(sidebarData()));
  if (method === "GET" && path === "/partials/status") return html(status(statusData()));

  if (method === "GET" && path === "/search") {
    query = url.searchParams.get("q") ?? "";
    return html(renderList());
  }

  if (method === "GET" && path === "/settings") {
    viewState = { kind: "view", id: "settings" };
    const body = settingsView(settingsData());
    if (isHtmx(req)) return html(body + oobSidebar(sidebarData()) + oobStatus(statusData()));
    return html(fullPageHtml(null));
  }

  if (method === "GET" && path === "/manage") {
    viewState = { kind: "view", id: "manage" };
    const body = manageView(manageData());
    if (isHtmx(req)) return html(body + oobSidebar(sidebarData()) + oobStatus(statusData()));
    return html(fullPageHtml(null));
  }

  if (method === "POST" && (m = /^\/items\/([^/]+)\/star$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    store.toggleStar(id);
    const item = store.itemById(id);
    if (!item) return new Response("not found", { status: 404 });
    const target = req.headers.get("HX-Target");
    let body: string;
    if (target === "reader") {
      const rd = readerData(id);
      body = readerContent({
        id: item.id,
        title: item.title,
        tag: item.tag,
        date: item.date,
        minutes: item.minutes,
        folder: item.folder,
        authors: item.authors,
        abstract: item.abstract,
        body: item.body,
        link: item.link,
        feedTitle: rd.feed?.title ?? null,
        feedUrl: rd.feed?.url ?? null,
        starred: item.starred,
        read: item.read,
        prevId: rd.prevId,
        nextId: rd.nextId,
      });
    } else {
      let feedTitle: string | null = null;
      for (const f of store.feeds()) if (f.id === item.feedId) { feedTitle = f.title; break; }
      const idx = store.listItems({ viewKind: viewState.kind, viewId: viewState.id, query, sort }).findIndex((it) => it.id === id);
      body = itemRow(Math.max(0, idx), item.title, feedTitle, item.folder, item.tag, item.authors, item.abstract, item.id, item.read, item.starred, item.date, item.minutes);
    }
    return html(body + oobSidebar(sidebarData()) + oobStatus(statusData()));
  }

  if (method === "POST" && (m = /^\/items\/([^/]+)\/toggle-read$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    store.toggleRead(id);
    const item = store.itemById(id);
    if (!item) return new Response("not found", { status: 404 });
    const rd = readerData(id);
    const body = readerContent({
      id: item.id,
      title: item.title,
      tag: item.tag,
      date: item.date,
      minutes: item.minutes,
      folder: item.folder,
      authors: item.authors,
      abstract: item.abstract,
      body: item.body,
      link: item.link,
      feedTitle: rd.feed?.title ?? null,
      feedUrl: rd.feed?.url ?? null,
      starred: item.starred,
      read: item.read,
      prevId: rd.prevId,
      nextId: rd.nextId,
    });
    return html(body + oobSidebar(sidebarData()) + oobStatus(statusData()));
  }

  if (method === "POST" && path === "/feeds/probe") {
    const form = await req.formData();
    const feedUrl = String(form.get("url") ?? "").trim();
    if (!feedUrl) return html(probeError("", store.folders()));
    const xml = await fetchText(feedUrl, 15_000).catch(() => null);
    if (xml === null) return html(probeError(feedUrl, store.folders()));
    try {
      const meta = parseFeedMeta(xml, feedUrl);
      return html(probeResults(feedUrl, store.folders(), meta));
    } catch {
      return html(probeError(feedUrl, store.folders()));
    }
  }

  if (method === "POST" && path === "/feeds/subscribe") {
    const form = await req.formData();
    const feedUrl = String(form.get("feed_url") ?? "");
    const folder = await resolveFolder(form);
    if (feedUrl !== "" && folder !== "") {
      let title = String(form.get("title") ?? "");
      let siteUrl = "";
      if (!title || title === feedUrl) {
        const xml = await fetchText(feedUrl, 15_000).catch(() => null);
        if (xml !== null) {
          try {
            const meta = parseFeedMeta(xml, feedUrl);
            if (!title || title === feedUrl) title = meta.title;
            siteUrl = meta.siteUrl;
          } catch {
          }
        }
      }
      if (!title) title = feedUrl;
      store.addFeed({ id: feedIdForUrl(feedUrl), title, url: feedUrl, folder, siteUrl });
    }
    return html(sidebar(sidebarData()));
  }

  if (method === "GET" && (m = /^\/feeds\/([^/]+)\/edit$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    const feed = store.feedById(id);
    if (!feed) return new Response("not found", { status: 404 });
    return html(manageFeedEdit(feed, store.folders(), feed.folder));
  }

  if (method === "GET" && (m = /^\/feeds\/([^/]+)\/confirm-delete$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    const feed = store.feedById(id);
    if (!feed) return new Response("not found", { status: 404 });
    return html(manageFeedConfirmDelete(feed));
  }

  if (method === "PUT" && (m = /^\/feeds\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    const feed = store.feedById(id);
    if (!feed) return new Response("not found", { status: 404 });
    const form = await req.formData();
    const title = String(form.get("title") ?? "");
    const feedUrl = String(form.get("url") ?? "");
    if (title !== "") feed.title = title;
    if (feedUrl !== "") feed.url = feedUrl;
    const folder = await resolveFolder(form);
    if (folder !== "") feed.folder = folder;
    store.upsertFeed(feed);
    viewState = { kind: "view", id: "manage" };
    return html(manageView(manageData()) + oobSidebar(sidebarData()) + oobStatus(statusData()));
  }

  if (method === "DELETE" && (m = /^\/feeds\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(m[1]);
    try {
      store.deleteFeed(id);
    } catch (err) {
      console.error("delete feed", err);
      return new Response("failed to delete feed", { status: 500 });
    }
    viewState = { kind: "view", id: "manage" };
    return html(manageView(manageData()) + oobSidebar(sidebarData()) + oobStatus(statusData()));
  }

  if (method === "GET" && path === "/export/opml") {
    const body = exportOpml(store);
    return new Response(body, {
      headers: { "Content-Type": "application/xml", "Content-Disposition": `attachment; filename="feeds.opml"` },
    });
  }

  if (method === "POST" && path === "/import/opml") {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      console.error("import opml: no file");
      return new Response("no file uploaded", { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) return new Response("file too large", { status: 400 });
    const text = await file.text();
    let imported = 0;
    try {
      imported = importOpml(store, text);
    } catch (err) {
      console.error("import opml: parse error", err);
      return new Response("invalid OPML file", { status: 400 });
    }
    log(`imported opml feeds=${imported}`);
    if (isHtmx(req)) return html(`imported ${imported} feeds`, 200, { "HX-Redirect": "/settings" });
    return new Response(null, { status: 303, headers: { Location: "/settings" } });
  }

  return new Response("not found", { status: 404 });
}

const displayHost = cfg.host === "" ? "localhost" : cfg.host;
console.error(`
  ▐▐▐  kontrolplane/feed

  listening:   http://${displayHost}:${cfg.port}
  db:         sqlite ${cfg.databasePath}
  refresh:    ${cfg.refreshLabel}

`);

export default {
  port: cfg.port,
  hostname: cfg.host === "" ? "0.0.0.0" : cfg.host,
  async fetch(req: Request): Promise<Response> {
    const start = Date.now();
    try {
      return await handle(req);
    } catch (err) {
      console.error("request", req.method, new URL(req.url).pathname, 500, `${Date.now() - start}ms`, err);
      return new Response("internal server error", { status: 500 });
    }
  },
};
