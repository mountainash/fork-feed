import { createHash } from "node:crypto";
import type { Store } from "./store";
import type { Feed, Item } from "./types";

const FETCH_TIMEOUT_MS = 30_000;

export function stripHtml(s: string): string {
  let out = "";
  let inTag = false;
  for (const ch of s) {
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) out += ch;
  }
  return out.trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function firstTag(xml: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i");
    const m = re.exec(xml);
    if (m) return decodeEntities(m[1].trim());
  }
  return "";
}

function allTags(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(decodeEntities(m[1].trim()));
  return out;
}

export interface ParsedEntry {
  guid: string;
  title: string;
  link: string;
  description: string;
  content: string;
  categories: string[];
  authorNames: string[];
  published: string;
}

export function splitEntries(xml: string): string[] {
  const entries: string[] = [];
  for (const tag of ["item", "entry"]) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) entries.push(m[1]);
  }
  return entries;
}

export function parseEntry(e: string): ParsedEntry {
  const title = stripHtml(firstTag(e, ["title"]));
  let link = firstTag(e, ["link"]);
  if (link.includes("<")) {
    const href = /href\s*=\s*"([^"]+)"/i.exec(e) ?? /href\s*=\s*'([^']+)'/i.exec(e);
    link = href ? href[1] : stripHtml(link);
  }
  link = link.trim();
  const guid = firstTag(e, ["guid", "id"]);
  const description = firstTag(e, ["description", "summary"]);
  const content = firstTag(e, ["content:encoded", "content"]);
  const categories = allTags(e, "category").map((c) => stripHtml(c.replace(/<[^>]*>/g, "")));
  const authorNames = [...allTags(e, "author"), ...allTags(e, "dc:creator"), ...allTags(e, "name")].map(stripHtml).filter(Boolean);
  const published = firstTag(e, ["pubDate", "published", "updated", "dc:date"]);
  return { guid, title, link, description, content, categories, authorNames, published };
}

export function entryDate(iso: string, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function itemId(feedId: string, guid: string): string {
  return createHash("sha256").update(`${feedId}:${guid}`).digest("hex").slice(0, 16);
}

function guessTag(categories: string[], content: string): string {
  if (categories.length > 0) {
    let cat = categories[0].toLowerCase();
    if (cat.length > 20) cat = cat.slice(0, 20);
    return cat;
  }
  if (content !== "" && content.length > 2000) return "article";
  return "post";
}

function readingMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.floor(words / 200));
}

export function extractMainHtml(html: string): string {
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (article) return article[1].trim();
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (main) return main[1].trim();
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const scope = body ? body[1] : html;
  const paras = [...scope.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)].map((m) => m[0]);
  if (paras.length >= 2) return paras.join("\n");
  return "";
}

async function fetchText(url: string, timeoutMs: number, log?: (msg: string) => void): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) {
      log?.(`non-200 for ${url}: ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    log?.(`fetch failed for ${url}: ${err}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchFeedItems(feed: Feed, today: string, fetchArticle: (url: string) => Promise<string>): Promise<Item[]> {
  const xml = await fetchText(feed.url, FETCH_TIMEOUT_MS);
  if (xml === null) throw new Error(`http error fetching ${feed.url}`);
  const out: Item[] = [];
  for (const raw of splitEntries(xml)) {
    let e: ParsedEntry;
    try {
      e = parseEntry(raw);
    } catch {
      continue;
    }
    const guid = e.guid || e.link || e.title;
    const id = itemId(feed.id, guid);
    const date = entryDate(e.published, today);
    const authors = e.authorNames.join(" · ");
    let abstract = stripHtml(decodeEntities(e.description || e.content));
    if (abstract.length > 300) abstract = abstract.slice(0, 300) + "…";
    const tag = guessTag(e.categories, e.content);
    let body = e.content || e.description;
    let minutes = readingMinutes(stripHtml(decodeEntities(body)) || abstract);
    if (e.link) {
      try {
        const extracted = await fetchArticle(e.link);
        if (extracted) {
          body = extracted;
          minutes = readingMinutes(stripHtml(body));
        }
      } catch {
      }
    }
    out.push({
      id,
      feedId: feed.id,
      folder: feed.folder,
      title: e.title,
      authors,
      date,
      read: false,
      starred: false,
      tag,
      abstract,
      body,
      link: e.link,
      minutes,
    });
  }
  return out;
}

export function createFetcher(store: Store, intervalMs: number, onSync: (t: Date) => void, debug: boolean) {
  const log = (...args: unknown[]) => console.log(...args);
  const debugLog = (...args: unknown[]) => {
    if (debug) console.debug(...args);
  };

  async function extractArticle(url: string): Promise<string> {
    const html = await fetchText(url, 15_000, (m) => debugLog(m));
    if (!html) return "";
    try {
      return extractMainHtml(html);
    } catch {
      return "";
    }
  }

  async function fetchAll() {
    const start = Date.now();
    log("starting feed fetch cycle");
    let feeds: Feed[];
    try {
      feeds = store.feeds();
    } catch (err) {
      log("error listing feeds", err);
      return;
    }
    log(`fetching feeds count=${feeds.length}`);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    let fetched = 0;
    let errors = 0;
    for (const feed of feeds) {
      try {
        const items = await fetchFeedItems(feed, todayStr, extractArticle);
        fetched++;
        for (const item of items) {
          if (!store.itemExists(item.id)) {
            try {
              store.upsertItem(item);
            } catch (err) {
              log("error saving item", feed.title, err);
            }
          }
        }
      } catch (err) {
        log("error fetching feed", feed.title, feed.url, err);
        errors++;
      }
    }
    log(`finished feed fetch cycle fetched=${fetched} errors=${errors} duration=${Date.now() - start}ms`);
    onSync(new Date());
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let initial: ReturnType<typeof setTimeout> | null = null;
  return {
    start() {
      initial = setTimeout(fetchAll, 5000);
      timer = setInterval(fetchAll, intervalMs);
    },
    stop() {
      if (initial) clearTimeout(initial);
      if (timer) clearInterval(timer);
    },
    fetchAll,
  };
}
