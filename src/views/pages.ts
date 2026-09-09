import { truncateUrl } from "../html";
import { esc } from "../opml";
import type { ManageData, PageData, SettingsData } from "../types";
import { itemList, readerContent, readerEmpty, sidebar, status } from "./partials";

function folderPicker(folders: { id: string; label: string; }[], selected: string): string {
  const opts = folders.map((f) => `<option value="${esc(f.id)}"${f.id === selected ? " selected" : ""}>${esc(f.label)}</option>`).join("");
  return `<div class="folder-picker"><select name="folder" onchange="var np=this.closest('.folder-picker').querySelector('.folder-picker-new');if(this.value==='__new__'){np.style.display='block';np.querySelector('input').focus();}else{np.style.display='none';np.querySelector('input').value='';}">${opts}<option value="__new__">+ new folder…</option></select><div class="folder-picker-new" style="display:none"><input type="text" name="new_folder" placeholder="folder name"/></div></div>`;
}

export function layout(inner: string): string {
  return `<!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>kontrolplane/feed</title>
    <meta name="theme-color" content="#FFF1CC">
    <meta name="theme-color" content="#0E1117" media="(prefers-color-scheme: dark)">
    <link rel="apple-touch-icon" sizes="180x180" href="/static/assets/apple-touch-icon.png" />
    <link rel="manifest" href="/static/manifest.json">
    <link rel="stylesheet" href="/static/css/styles.css">
    <link rel="icon" href="/static/assets/favicon.ico" type="image/x-icon">
    <script>(function(){var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');})();function setTheme(t){localStorage.setItem('theme',t);if(t==='dark'){document.documentElement.setAttribute('data-theme','dark')}else{document.documentElement.removeAttribute('data-theme')}document.querySelectorAll('#theme-opts button').forEach(function(b){b.classList.remove('on')});var el=document.getElementById('theme-'+t);if(el)el.classList.add('on');}function togglePane(pane){var app=document.querySelector('.app');var cls=pane+'-collapsed';app.classList.toggle(cls);localStorage.setItem(pane+'-collapsed',app.classList.contains(cls)?'1':'0');}</script></head><body><div class="app"><header class="topbar"><a class="brand" href="/" onclick="document.querySelector('.app').classList.remove('sidebar-collapsed','list-collapsed','mobile-sidebar-open','mobile-reader-open');localStorage.removeItem('sidebar-collapsed');localStorage.removeItem('list-collapsed');"><img src="/static/assets/logo.png" alt="" class="brand-logo"/><span class="brand-name">kontrolplane/feed</span></a><div class="search"><span class="prompt">/</span><input type="search" name="q" placeholder="search items, authors, abstracts…" hx-get="/search" hx-trigger="keyup changed delay:200ms, search" hx-target="#main" hx-swap="outerHTML" hx-indicator="#sync-indicator"/><kbd>/</kbd></div><div class="tools"><button class="btn btn-add-folder" hx-get="/folders/new" hx-target="#modal" hx-swap="innerHTML">＋ folder</button><button class="btn" hx-get="/feeds/new" hx-target="#modal" hx-swap="innerHTML">＋ feed</button><button class="btn" hx-get="/partials/list" hx-target="#main" hx-swap="outerHTML" hx-indicator="#sync-indicator"><span class="dot"></span>sync · now</button><span id="sync-indicator" class="htmx-indicator">sync…</span></div></header>${inner}</div><div id="modal"></div><script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" crossorigin="anonymous"></script><script src="/static/js/hotkeys.js?v=6"></script><script>(function(){var app=document.querySelector('.app');['sidebar','list'].forEach(function(p){if(localStorage.getItem(p+'-collapsed')==='1')app.classList.add(p+'-collapsed');});})();</script></body></html>`;
}

export function settingsView(data: SettingsData): string {
  const on = (a: string, b: string) => (a === b ? " on" : "");
  return `<main class="settings-page" id="main"><section class="reader"><div class="reader-inner"><div class="rmeta"><span>[ settings ]</span><span class="sep">·</span><span>live</span><span class="sep">·</span><span>${esc(data.databaseDriver)}</span></div><h1>settings.</h1><div class="byline">no account. no sync. your reading data lives in your ${esc(data.databaseDriver)} database.</div><div class="settings-grid"><div class="s-cell disabled"><div class="k">[ reading / mark-read-on ]</div><div class="v">when items become read</div><div class="opts"><button class="${on(data.markReadOn, "scroll").trim()}">scroll</button><button class="${on(data.markReadOn, "open").trim()}">open</button><button class="${on(data.markReadOn, "manual").trim()}">manual</button></div></div><div class="s-cell disabled"><div class="k">[ refresh / cadence ]</div><div class="v">how often to fetch</div><div class="opts"><button class="${on(data.refreshInterval, "5m0s").trim()}">5m</button><button class="${on(data.refreshInterval, "15m0s").trim()}">15m</button><button class="${on(data.refreshInterval, "1h0m0s").trim()}">1h</button></div></div><div class="s-cell disabled"><div class="k">[ retention / history ]</div><div class="v">keep read items for</div><div class="opts"><button class="${on(data.retention, "7d").trim()}">7d</button><button class="${on(data.retention, "30d").trim()}">30d</button><button class="${on(data.retention, "90d").trim()}">90d</button><button class="${on(data.retention, "forever").trim()}">forever</button></div></div><div class="s-cell disabled"><div class="k">[ display / density ]</div><div class="v">list row height</div><div class="opts"><button class="${on(data.density, "tight").trim()}">tight</button><button class="${on(data.density, "default").trim()}">default</button><button class="${on(data.density, "loose").trim()}">loose</button></div></div><div class="s-cell"><div class="k">[ display / theme ]</div><div class="v">colour scheme</div><div class="opts" id="theme-opts"><button onclick="setTheme('light')" id="theme-light">light</button><button onclick="setTheme('dark')" id="theme-dark">dark</button></div><script>(function() {var t = localStorage.getItem('theme') || 'light';var el = document.getElementById('theme-' + t);if (el) el.classList.add('on');})();</script></div></div>
    <p style="margin-top:1rem;opacity:.55">set settings with .env variables on the server to change.</p>
    <h2 style="font-family:var(--grot);font-size:22px;font-weight:600;letter-spacing:-0.02em;margin-top:48px;margin-bottom:14px">server</h2><div class="server-info"><div class="srow"><span class="k">binary</span><span>kontrolplane-feed · bun</span></div><div class="srow"><span class="k">version</span><span>v${esc(data.version)}</span></div><div class="srow"><span class="k">server</span><span>bun.serve</span></div><div class="srow"><span class="k">views</span><span>typescript html · htmx</span></div><div class="srow"><span class="k">db</span><span>${esc(data.databaseDriver)} · ${esc(data.databaseInfo)}</span></div><div class="srow"><span class="k">refresh</span><span>${esc(data.refreshInterval)}</span></div></div><h2 style="font-family:var(--grot);font-size:22px;font-weight:600;letter-spacing:-0.02em;margin-top:48px;margin-bottom:14px">keyboard</h2><div style="display:grid;grid-template-columns:100px 1fr;row-gap:10px;column-gap:18px;font-family:var(--mono);font-size:12px;padding-top:16px;border-top:1px solid var(--rule-strong)"><div><span class="inline-kbd">j / k</span></div><div style="opacity:0.85">next / previous item</div><div><span class="inline-kbd">o or ↵</span></div><div style="opacity:0.85">open item in reader</div><div><span class="inline-kbd">s</span></div><div style="opacity:0.85">toggle star</div><div><span class="inline-kbd">m</span></div><div style="opacity:0.85">toggle read / unread</div><div><span class="inline-kbd">/</span></div><div style="opacity:0.85">focus search</div><div><span class="inline-kbd">n</span></div><div style="opacity:0.85">add new feed</div></div><h2 style="font-family:var(--grot);font-size:22px;font-weight:600;letter-spacing:-0.02em;margin-top:48px;margin-bottom:14px">import / export</h2><div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--rule-strong)"><label class="settings-btn">import opml<input type="file" name="file" accept=".opml,.xml" style="display:none" hx-post="/import/opml" hx-encoding="multipart/form-data" hx-trigger="change" hx-swap="none"/></label><a class="settings-btn" href="/export/opml" download="feeds.opml">export opml</a></div></div></section></main><section id="reader" hx-swap-oob="outerHTML" style="display:none"></section>`;
}

function manageFeedCard(feed: { id: string; title: string; url: string; }, folderLabel: string): string {
  return `<div class="manage-card" id="manage-feed-${esc(feed.id)}"><div class="manage-card-body"><div class="manage-card-title">${esc(feed.title)}</div><div class="manage-card-url">${esc(truncateUrl(feed.url))}</div></div><div class="manage-card-footer"><button class="manage-btn" hx-get="/feeds/${esc(feed.id)}/edit" hx-target="closest .manage-card" hx-swap="outerHTML">edit</button><button class="manage-btn danger" hx-get="/feeds/${esc(feed.id)}/confirm-delete" hx-target="closest .manage-card" hx-swap="outerHTML">unsubscribe</button></div></div>`;
}

function manageFolderSection(folder: { id: string; label: string; }, feeds: { id: string; title: string; url: string; folder: string; }[]): string {
  const cards = feeds
    .filter((f) => f.folder === folder.id)
    .map((feed) => manageFeedCard(feed, folder.label))
    .join("");
  const delBtn =
    folder.id !== "default"
      ? `<button class="manage-folder-del" hx-get="/folders/${esc(folder.id)}/confirm-delete" hx-target="closest .manage-folder" hx-swap="outerHTML">remove</button>`
      : "";
  const renameBtn = `<button class="manage-folder-rename" hx-get="/folders/${esc(folder.id)}/edit" hx-target="closest .manage-folder" hx-swap="outerHTML">rename</button>`;
  return `<div class="manage-folder" id="manage-folder-${esc(folder.id)}"><div class="manage-folder-head"><span>[ ${esc(folder.label)} ]</span><span class="manage-folder-actions">${renameBtn}${delBtn}</span></div><div class="manage-grid">${cards}</div></div>`;
}

export function manageFoldersHtml(data: ManageData): string {
  return data.folders.map((folder) => manageFolderSection(folder, data.feeds)).join("");
}

export function manageView(data: ManageData): string {
  const folders = manageFoldersHtml(data);
  return `<main class="manage-page" id="main"><section class="reader"><div class="reader-inner"><div class="rmeta"><span>[ system / manage ]</span><span class="sep">·</span><span>${data.feeds.length} feeds</span></div><h1>manage feeds.</h1><div class="byline">add, rename, or remove your subscriptions.</div><div class="manage-actions"><button class="manage-add" hx-get="/feeds/new" hx-target="#modal" hx-swap="innerHTML">＋ add feed</button><button class="manage-add" hx-get="/folders/new" hx-target="#modal" hx-swap="innerHTML">＋ add folder</button></div>${folders}</div></section></main><section id="reader" hx-swap-oob="outerHTML" style="display:none"></section>`;
}

export function manageFeedConfirmDelete(feed: { id: string; title: string; }): string {
  return `<div class="manage-card confirming" id="manage-feed-${esc(feed.id)}"><div class="manage-card-body"><div class="manage-card-warn">unsubscribe?</div><div class="manage-card-warn-sub">remove <strong>${esc(feed.title)}</strong> and all its items. this cannot be undone.</div></div><div class="manage-card-footer"><button class="manage-btn" hx-get="/manage" hx-target="#main" hx-swap="outerHTML">cancel</button><button class="manage-btn danger-fill" hx-delete="/feeds/${esc(feed.id)}" hx-target="#main" hx-swap="outerHTML">unsubscribe →</button></div></div>`;
}

export function manageFeedEdit(feed: { id: string; title: string; url: string; }, folders: { id: string; label: string; }[], selected: string): string {
  return `<div class="manage-card editing" id="manage-feed-${esc(feed.id)}"><form hx-put="/feeds/${esc(feed.id)}" hx-target="#main" hx-swap="outerHTML"><div class="manage-card-body"><label>name</label><input type="text" name="title" value="${esc(feed.title)}"/><label>url</label><input type="url" name="url" value="${esc(feed.url)}"/><label>folder</label>${folderPicker(folders, selected)}</div><div class="manage-card-footer"><button type="button" class="manage-btn" hx-get="/manage" hx-target="#main" hx-swap="outerHTML">cancel</button><button type="submit" class="manage-btn primary">save</button></div></form></div>`;
}

export function manageFolderConfirmDelete(folder: { id: string; label: string; }, feedCount: number): string {
  return `<div class="manage-folder confirming" id="manage-folder-${esc(folder.id)}"><div class="manage-card" style="border-color:var(--err)"><div class="manage-card-body"><div class="manage-card-warn">remove folder?</div><div class="manage-card-warn-sub">delete <strong>${esc(folder.label)}</strong> and all its feeds (${feedCount} feeds and their items). this cannot be undone.</div></div><div class="manage-card-footer"><button class="manage-btn" hx-get="/manage" hx-target="#main" hx-swap="outerHTML">cancel</button><button class="manage-btn danger-fill" hx-delete="/folders/${esc(folder.id)}" hx-target="#main" hx-swap="outerHTML">remove folder →</button></div></div></div>`;
}

export function manageFolderEdit(folder: { id: string; label: string; }, feeds: { id: string; title: string; url: string; }[]): string {
  const cards = feeds.map((feed) => manageFeedCard(feed, folder.label)).join("");
  return `<div class="manage-folder editing" id="manage-folder-${esc(folder.id)}"><div class="manage-folder-head"><span>[ ${esc(folder.label)} ]</span><span class="manage-folder-actions"></span></div><div class="manage-card editing"><form hx-put="/folders/${esc(folder.id)}" hx-target="#main" hx-swap="outerHTML"><div class="manage-card-body"><label>folder name</label><input type="text" name="name" value="${esc(folder.label)}" required autofocus/></div><div class="manage-card-footer"><button type="button" class="manage-btn" hx-get="/manage" hx-target="#main" hx-swap="outerHTML">cancel</button><button type="submit" class="manage-btn primary">save</button></div></form></div><div class="manage-grid">${cards}</div></div>`;
}

export function oobManage(data: ManageData): string {
  return manageView(data).replace('id="main"', 'id="main" hx-swap-oob="outerHTML"');
}

export function addFeedModal(folders: { id: string; label: string; }[], selected = ""): string {
  void selected;
  return `<div class="scrim" onclick="document.getElementById('modal').innerHTML=''"><div class="modal" onclick="event.stopPropagation()"><div class="modal-head"><span>[ subscribe / add feed ]</span><span class="close" onclick="document.getElementById('modal').innerHTML=''">✕</span></div><div class="modal-body"><h2>add a source.</h2><div class="sub">paste a site url or a direct rss / atom link.</div><form hx-post="/feeds/probe" hx-target="#probe-results" hx-swap="innerHTML"><label>source url</label><input type="url" name="url" placeholder="https://example.com  or  https://example.com/feed.xml" required/><div id="probe-results"><div class="btns"><button type="button" class="ghost" onclick="document.getElementById('modal').innerHTML=''">cancel</button><button type="submit" class="primary">probe →</button></div></div></form></div></div></div>`;
}

export function probeResults(url: string, folders: { id: string; label: string; }[], found?: { title: string; siteUrl: string; description: string; }): string {
  const title = found?.title && found.title !== url ? found.title : "main feed";
  const detail = found?.description ? `${esc(url)} · ${esc(found.description.slice(0, 80))}` : `${esc(url)} · [ rss/atom ]`;
  const nameValue = found && found.title !== url ? found.title : url;
  return `<label style="margin-top:20px">discovered feeds</label><div class="discovered"><div class="drow"><input type="checkbox" name="feed_url" value="${esc(url)}" checked/><div><div style="font-weight:600">${esc(title)}</div><div class="dim">${detail}</div></div><div class="dim">ok</div></div></div><label>name</label><input type="text" name="title" value="${esc(nameValue)}" placeholder="feed name"/><label>place in folder</label>${folderPicker(folders, "")}<div class="btns" style="margin-top:22px;padding-top:18px;border-top:1px solid var(--rule)"><button type="button" class="ghost" onclick="document.getElementById('modal').innerHTML=''">cancel</button><button type="button" class="primary" hx-post="/feeds/subscribe" hx-include="closest form" hx-target="#sidebar" hx-swap="outerHTML" hx-on::after-request="document.getElementById('modal').innerHTML=''">subscribe →</button></div>`;
}

export function probeError(url: string, folders: { id: string; label: string; }[]): string {
  return `<label style="margin-top:20px">discovered feeds</label><div class="discovered"><div class="drow"><input type="checkbox" name="feed_url" value="${esc(url)}" checked/><div><div style="font-weight:600">main feed</div><div class="dim">${esc(url)} · [ could not fetch — will retry on subscribe ]</div></div><div class="dim">?</div></div></div><label>name</label><input type="text" name="title" value="${esc(url)}" placeholder="feed name"/><label>place in folder</label>${folderPicker(folders, "")}<div class="btns" style="margin-top:22px;padding-top:18px;border-top:1px solid var(--rule)"><button type="button" class="ghost" onclick="document.getElementById('modal').innerHTML=''">cancel</button><button type="button" class="primary" hx-post="/feeds/subscribe" hx-include="closest form" hx-target="#sidebar" hx-swap="outerHTML" hx-on::after-request="document.getElementById('modal').innerHTML=''">subscribe →</button></div>`;
}

export function addFolderModal(): string {
  return `<div class="scrim" onclick="document.getElementById('modal').innerHTML=''"><div class="modal" onclick="event.stopPropagation()"><div class="modal-head"><span>[ new / folder ]</span><span class="close" onclick="document.getElementById('modal').innerHTML=''">✕</span></div><div class="modal-body"><h2>create a folder.</h2><div class="sub">organise your feeds into groups.</div><form hx-post="/folders" hx-target="#sidebar" hx-swap="outerHTML" hx-on::after-request="document.getElementById('modal').innerHTML=''"><label>folder name</label><input type="text" name="name" placeholder="e.g. tech, news, blogs" required autofocus/><div class="btns"><button type="button" class="ghost" onclick="document.getElementById('modal').innerHTML=''">cancel</button><button type="submit" class="primary">create →</button></div></form></div></div></div>`;
}

export function page(data: PageData): string {
  const isSettings = data.list.view.kind === "view" && data.list.view.id === "settings";
  const isManage = data.list.view.kind === "view" && data.list.view.id === "manage";
  let main: string;
  if (isSettings) main = settingsView(data.settings);
  else if (isManage) main = manageView(data.manage);
  else {
    const reader =
      data.reader.item !== null
        ? readerContent({
          id: data.reader.item.id,
          title: data.reader.item.title,
          tag: data.reader.item.tag,
          date: data.reader.item.date,
          minutes: data.reader.item.minutes,
          folder: data.reader.item.folder,
          authors: data.reader.item.authors,
          abstract: data.reader.item.abstract,
          body: data.reader.item.body,
          link: data.reader.item.link,
          feedTitle: data.reader.feed?.title ?? null,
          feedUrl: data.reader.feed?.url ?? null,
          starred: data.reader.item.starred,
          read: data.reader.item.read,
          prevId: data.reader.prevId,
          nextId: data.reader.nextId,
        })
        : `<section class="reader" id="reader">${readerEmpty()}</section>`;
    main = itemList(data.list) + reader;
  }
  return layout(sidebar(data.sidebar) + main + status(data.status));
}
