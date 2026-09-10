import { esc, formatDate, pad2, truncate } from "../html";
import type { Feed, ListData, SidebarData, StatusData } from "../types";

export function sidebarView(num: string, label: string, id: string, count: number, kind: string, viewId: string): string {
  const active = kind === "view" && viewId === id ? " active" : "";
  return /* html */`
    <a class="nav-item${active}" hx-get="/views/${esc(id)}" hx-target="#main" hx-swap="outerHTML" hx-push-url="/v/${esc(id)}">
      <span class="g">${esc(num)}</span>
      <span>${esc(label)}</span>
      <span class="c">${count}</span>
    </a>`;
}

function folderUnread(folderId: string, feeds: Feed[], counts: SidebarData["counts"]): number {
  let total = 0;
  for (const f of feeds) if (f.folder === folderId) total += counts.perFeed[f.id] ?? 0;
  return total;
}

function sidebarFeed(feed: Feed, counts: SidebarData["counts"], kind: string, viewId: string): string {
  const unread = counts.perFeed[feed.id] ?? 0;
  const active = kind === "feed" && viewId === feed.id ? " active" : "";
  const unreadCls = unread > 0 ? " unread" : "";
  const badge = unread > 0 ? `<span class="c">${unread}</span>` : `<span class="c">-</span>`;
  return /* html */`
    <a class="feed-item${active}${unreadCls}" hx-get="/feeds/${esc(feed.id)}" hx-target="#main" hx-swap="outerHTML" hx-push-url="/feeds/${esc(feed.id)}">
      <span class="t">${esc(feed.title)}</span>
      ${badge}
    </a>`;
}

function sidebarFolder(folder: SidebarData["folders"][number], idx: number, feeds: Feed[], counts: SidebarData["counts"], kind: string, viewId: string): string {
  const active = kind === "folder" && viewId === folder.id ? " active" : "";
  const feedHtml = feeds.filter((f) => f.folder === folder.id).map((f) => sidebarFeed(f, counts, kind, viewId)).join("");
  return /* html */`
    <div class="folder${active}">
      <a class="nav-item${active}" hx-get="/folders/${esc(folder.id)}" hx-target="#main" hx-swap="outerHTML" hx-push-url="/folders/${esc(folder.id)}">
        <span class="g">${pad2(idx + 1)}</span>
        <span>${esc(folder.label)}</span>
        <span class="c">${folderUnread(folder.id, feeds, counts)}</span>
      </a>
      <div class="feeds">
        ${feedHtml}
      </div>
    </div>`;
}

export function sidebarInner(data: SidebarData): string {
  const v = data.view;
  const folders = data.folders.map((f, i) => sidebarFolder(f, i, data.feeds, data.counts, v.kind, v.id)).join("");
  const manageActive = v.kind === "view" && v.id === "manage" ? " active" : "";
  const settingsActive = v.kind === "view" && v.id === "settings" ? " active" : "";
  return /* html */`
    <section>
      <h5>
        <span>[ views ]</span>
      </h5>
      ${sidebarView("01", "all items", "all", data.counts.all, v.kind, v.id)}${sidebarView("02", "unread", "unread", data.counts.unread, v.kind, v.id)}${sidebarView("03", "read", "read", data.counts.read, v.kind, v.id)}${sidebarView("04", "starred", "starred", data.counts.starred, v.kind, v.id)}
    </section>
    <section>
      <h5>
        <span>[ timeline ]</span>
        </h5>
        ${sidebarView("01", "today", "today", data.counts.today, v.kind, v.id)}${sidebarView("02", "yesterday", "yesterday", data.counts.yesterday, v.kind, v.id)}${sidebarView("03", "last week", "last-week", data.counts.lastWeek, v.kind, v.id)}${sidebarView("04", "last month", "last-month", data.counts.lastMonth, v.kind, v.id)}
    </section>
    <section>
      <h5>
        <span>[ folders ]</span>
        <a class="add" hx-get="/folders/new" hx-target="#modal" hx-swap="innerHTML" title="add folder">＋</a>
      </h5>
      ${folders}
    </section>
    <section>
      <h5>
        <span>[ system ]</span>
      </h5>
      <a class="nav-item${manageActive}" hx-get="/manage" hx-target="#main" hx-swap="outerHTML" hx-push-url="/manage">
        <span class="g">✦</span>
        <span>manage feeds</span>
        <span class="c">${data.feeds.length}</span>
      </a>
      <a class="nav-item${settingsActive}" hx-get="/settings" hx-target="#main" hx-swap="outerHTML" hx-push-url="/settings">
        <span class="g">✦</span>
        <span>settings</span>
      </a>
    </section>`;
}

export function sidebar(data: SidebarData): string {
  return /* html */`<aside class="sidebar" id="sidebar">${sidebarInner(data)}</aside>`;
}

export function oobSidebar(data: SidebarData): string {
  return /* html */`<aside class="sidebar" id="sidebar" hx-swap-oob="outerHTML">${sidebarInner(data)}</aside>`;
}

export function oobReaderReset(): string {
  return /* html */`<section class="reader" id="reader" hx-swap-oob="outerHTML">${readerEmpty()}</section>`;
}

export function statusInner(data: StatusData): string {
  return /* html */`
    <div class="seg">
      <span class="k">[ view ]</span>
      <span>${esc(data.viewTitle)}</span>
    </div>
    <div class="seg">
      <span class="k">[ items ]</span>
      <span>${data.filteredLen} / ${data.totalLen}</span>
    </div>
    <div class="seg">
      <span class="k">[ unread ]</span>
      <span>${data.unreadCount}</span>
    </div>
    <div class="right">
      <span class="hints">
        <span>
          <kbd>j</kbd>
          <kbd>k</kbd>
          navigate
        </span>
        <span>
          <kbd>o</kbd>
          open
        </span>
        <span>
          <kbd>s</kbd>
          star
        </span>
        <span>
          <kbd>/</kbd>
          search
        </span>
        <span>
          <kbd>1</kbd>
          sidebar
        </span>
        <span>
          <kbd>2</kbd>
          list</span>
        <span>·</span>
      </span>
      <a class="manage-link" href="/manage" hx-get="/manage" hx-target="#main" hx-swap="outerHTML" hx-push-url="/manage">${data.feedCount} feeds · ${esc(data.lastSync)}</a>
    </div>`;
}

export function status(data: StatusData): string {
  return /* html */`<footer class="status" id="status" hx-get="/partials/status" hx-trigger="every 900s" hx-swap="outerHTML">${statusInner(data)}</footer>`;
}

export function oobStatus(data: StatusData): string {
  return /* html */`<footer class="status" id="status" hx-swap-oob="outerHTML" hx-get="/partials/status" hx-trigger="every 900s">${statusInner(data)}</footer>`;
}

export function itemRow(idx: number, title: string, feedTitle: string | null, folder: string, tag: string, authors: string, abstract: string, id: string, read: boolean, starred: boolean, date: string, minutes: number): string {
  const feedLine = feedTitle !== null ? /* html */`<span class="feed-path">${esc(feedTitle)} <span class="sep">/</span> ${esc(folder)}</span>` : "";
  return /* html */`
    <a class="item${read ? "" : " unread"}" id="item-${esc(id)}" hx-get="/items/${esc(id)}" hx-target="#reader" hx-swap="outerHTML">
      <div class="n">${pad2(idx + 1)}</div>
      <div class="main">
        <div class="feed-line">
          ${feedLine}
          <span class="sep">·</span>
          <span class="tag">${esc(tag)}</span>
        </div>
        <h3>${esc(title)}</h3>
        <div class="authors">${esc(authors)}</div>
        <div class="abs">${esc(abstract)}</div>
      </div>
      <div class="right">
        <button type="button" class="star${starred ? " on" : ""}" hx-post="/items/${esc(id)}/star" hx-target="#item-${esc(id)}" hx-swap="outerHTML" title="star" onClick="event.stopPropagation(); event.preventDefault();">★</button>
        <div>${esc(formatDate(date))}</div>
        <div>${minutes}m</div>
      </div>
    </a>`;
}

export function itemList(data: ListData): string {
  const rows = data.items
    .map((it, idx) => {
      let feedTitle: string | null = null;
      for (const f of data.feeds) if (f.id === it.feedId) { feedTitle = f.title; break; }
      return itemRow(idx, it.title, feedTitle, it.folder, it.tag, it.authors, it.abstract, it.id, it.read, it.starred, it.date, it.minutes);
    })
    .join("");
  const body = data.items.length === 0
    ? /* html */`<div style="padding:40px 20px;opacity:0.5;font-size:12px">nothing here. try another view.</div>`
    : rows;
  const newestOn = data.sort === "newest" ? " on" : "";
  const oldestOn = data.sort === "oldest" ? " on" : "";
  const unreadOn = data.sort === "unread" ? " on" : "";
  return /* html */`
    <main class="list" id="main" hx-get="/partials/list" hx-trigger="every 900s" hx-swap="outerHTML">
      <div class="list-head">
        <div class="crumb">
          <span>${esc(data.crumb)}</span>
          <span>·</span>
          <span>${data.items.length} items</span>
        </div>
        <h1>${esc(data.title)}</h1>
        <div class="meta">
          <button type="button" class="${newestOn.trim()}" hx-get="/partials/list?sort=newest" hx-target="#main" hx-swap="outerHTML">newest</button>
          <button type="button" class="${oldestOn.trim()}" hx-get="/partials/list?sort=oldest" hx-target="#main" hx-swap="outerHTML">oldest</button>
          <button type="button" class="${unreadOn.trim()}" hx-get="/partials/list?sort=unread" hx-target="#main" hx-swap="outerHTML">unread first</button>
        </div>
      </div>
      <div class="list-body" id="list-body">
        ${body}
      </div>
    </main>`;
}

export function readerNav(prevId: string, nextId: string): string {
  const prev = prevId !== "" ? /* html */`<a class="reader-nav-btn" hx-get="/items/${esc(prevId)}" hx-target="#reader" hx-swap="outerHTML">← previous</a>` : /* html */`<span class="reader-nav-btn disabled">← previous</span>`;
  const next = nextId !== "" ? /* html */`<a class="reader-nav-btn" hx-get="/items/${esc(nextId)}" hx-target="#reader" hx-swap="outerHTML">next →</a>` : /* html */`<span class="reader-nav-btn disabled">next →</span>`;
  return /* html */`<nav class="reader-nav">${prev}${next}</nav>`;
}

export function readerEmpty(): string {
  return /* html */`
    <div class="btns">
      <button type="button" class="reader-back" aria-label="back to item list">
        ← back to list
      </button>
    </div>
    <div class="empty">
      <div class="stagger">
        <i></i>
        <i></i>
        <i></i>
      </div>
      <div class="big">pick an item.</div>
      <div style="font-size:11px;letter-spacing:0.08em;opacity:0.7;margin-top:10px">
        <span class="inline-kbd">j</span>
        /
        <span class="inline-kbd">k</span>
        navigate ·
        <span class="inline-kbd">o</span>
        open ·
        <span class="inline-kbd">s</span>
        star
      </div>
    </div>`;
}

export function readerContent(opts: { id: string; title: string; tag: string; date: string; minutes: number; folder: string; authors: string; abstract: string; body: string; link: string; feedTitle: string | null; feedUrl: string | null; starred: boolean; read: boolean; prevId: string; nextId: string; }): string {
  const o = opts;
  const feedName = o.feedTitle !== null ? `<span>${esc(truncate(o.feedTitle, 20))}</span>` : "";
  const openUrl = o.link !== "" ? o.link : o.feedUrl ?? "";
  const openBtn = openUrl !== "" ? /* html */`<a href="${esc(openUrl)}" target="_blank" rel="noopener"><button>↗ open original</button></a>` : "";
  const body = o.body !== "" ? o.body : /* html */`<p>the motivation is straightforward. real workloads drift. benchmarks don't. what we measured on a single well-behaved node in 2021 does not describe what the same code does in 2026 when it is scheduled next to seventeen noisy neighbours, none of whom share our assumptions about the page cache.</p><h2>method</h2><p>we ran the experiment three ways. the first used the stock configuration as shipped - the one most operators will actually deploy. the second was tuned by hand over several weeks by an engineer who has been working on this subsystem since before it had a name. the third was what the autotuner produced on a cold start.</p><p>the numbers tell a quieter story than we expected. the hand-tuned configuration wins, as it should. the autotuner comes within 8% on median latency and loses by a wider margin on the long tail. the stock configuration is the surprise: it is not catastrophic. in three of seven regimes it is within noise of hand-tuning.</p><h2>results</h2><blockquote>this is uncomfortable. most of the reason teams reach for hand tuning is a story about how much is being left on the table. that story is less true than it used to be. it is still true enough to matter for hot paths and tight budgets, but the shape of the curve has changed.</blockquote><p>we are publishing the full traces, the configs, and the notebook. if you find a different answer on your hardware we would like to hear about it - especially if you are running something that does not look like the median deployment. the interesting cases live in the corners.</p>`;
  return /* html */`
    <section class="reader" id="reader">
      <div class="reader-inner">
        <button type="button" class="reader-back" aria-label="back to item list">← back to list</button>
        <div class="actions">
          <div class="rh">
            <button type="button" class="${o.starred ? " on" : ""}" hx-post="/items/${esc(o.id)}/star" hx-target="#reader" hx-swap="outerHTML">${o.starred ? "★ starred" : "☆ star"}</button>
            <button type="button" class="${o.read ? "" : " on"}" hx-post="/items/${esc(o.id)}/toggle-read" hx-target="#reader" hx-swap="outerHTML">${o.read ? "○ mark unread" : "● mark read"}</button>
            ${openBtn}
          </div>
        </div>
        <div class="rmeta">
          <span>[ ${esc(o.tag)} ]</span>
          <span class="sep">·</span>
          ${feedName}
          <span class="sep">·</span>
          <span>${esc(o.date)}</span>
          <span class="sep">·</span>
          <span>${o.minutes} min</span>
          <span class="sep">·</span>
          <span>${esc(o.folder)}</span>
        </div>
        <h1>${esc(o.title)}</h1>
        <div class="byline">
          <span>${esc(o.authors)}</span>
          ${o.feedTitle !== null ? `<span class="dim"> &nbsp;/&nbsp; published ${esc(o.date)} &nbsp;/&nbsp; fetched via ${esc(truncate((o.feedUrl ?? "").replace(/^https?:\/\//, ""), 40))}</span>` : ""}
        </div>
        <div class="abs-block">${esc(o.abstract)}</div>
        <div class="body">
          ${body}
        </div>
        ${readerNav(o.prevId, o.nextId)}
      </div>
    </section>`;
}
