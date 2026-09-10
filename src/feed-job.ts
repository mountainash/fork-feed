import { createHash } from "node:crypto";
import {
  decodeEntities,
  entryDate,
  extractMainHtml,
  guessTag,
  parseEntry,
  readingMinutes,
  splitEntries,
  stripHtml,
} from "./feed-parse";
import type { Feed, Item } from "./types";

export interface FeedJobOptions {
  feedTimeoutMs: number;
  articleTimeoutMs: number;
  maxFeedBytes: number;
  maxArticleBytes: number;
  maxArticlesPerFeed: number;
  articleGapMs: number;
  feedBytesWarnAt: number;
}

export const DEFAULT_FEED_JOB_OPTIONS: FeedJobOptions = {
  feedTimeoutMs: 15_000,
  articleTimeoutMs: 10_000,
  maxFeedBytes: 5 * 1024 * 1024,
  maxArticleBytes: 2 * 1024 * 1024,
  maxArticlesPerFeed: 20,
  articleGapMs: 300,
  feedBytesWarnAt: 1_000_000,
};

export function itemId(feedId: string, guid: string): string {
  return createHash("sha256").update(`${feedId}:${guid}`).digest("hex").slice(0, 16);
}

function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = "***";
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return raw.slice(0, 80);
  }
}

export async function fetchTextCapped(
  url: string,
  timeoutMs: number,
  maxBytes: number,
  log?: (msg: string) => void,
): Promise<{ text: string; bytes: number; truncated: boolean; } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) {
      log?.(`non-200 for ${redactUrl(url)}: ${res.status}`);
      return null;
    }
    log?.(`fetch ok ${res.status} ${redactUrl(url)}`);
    const len = res.headers.get("content-length");
    if (len !== null) {
      const n = Number(len);
      if (Number.isFinite(n) && n > maxBytes) {
        log?.(`refusing ${redactUrl(url)}: content-length ${n} exceeds cap ${maxBytes}`);
        try {
          await res.body?.cancel();
        } catch {
        }
        return null;
      }
    }
    if (!res.body) {
      const text = await res.text();
      const bytes = Buffer.byteLength(text);
      if (bytes > maxBytes) {
        log?.(`truncating ${redactUrl(url)}: ${bytes} bytes exceeds cap ${maxBytes}`);
        return { text: text.slice(0, maxBytes), bytes, truncated: true };
      }
      return { text, bytes, truncated: false };
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          truncated = true;
          try {
            await reader.cancel();
          } catch {
          }
          break;
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks);
    return { text: buf.toString("utf8"), bytes, truncated };
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      log?.(`timeout after ${timeoutMs}ms for ${redactUrl(url)}`);
    } else if (err instanceof Error && err.name === "AbortError") {
      log?.(`aborted after ${timeoutMs}ms for ${redactUrl(url)}`);
    } else {
      log?.(`fetch failed for ${redactUrl(url)}: ${err}`);
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function buildItem(feed: Feed, e: ReturnType<typeof parseEntry>, today: string): Item {
  const guid = e.guid || e.link || e.title;
  const id = itemId(feed.id, guid);
  const date = entryDate(e.published, today);
  const authors = e.authorNames.join(" · ");
  let abstract = stripHtml(decodeEntities(e.description || e.content));
  if (abstract.length > 300) abstract = `${abstract.slice(0, 300)}…`;
  const tag = guessTag(e.categories, e.content);
  const body = e.content || e.description;
  const minutes = readingMinutes(stripHtml(decodeEntities(body)) || abstract);
  return {
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
  };
}

export interface ProcessFeedResult {
  items: Item[];
  errors: number;
}

export async function processFeed(feed: Feed, today: string, opts: FeedJobOptions, log?: (msg: string) => void): Promise<ProcessFeedResult> {
  const fetched = await fetchTextCapped(feed.url, opts.feedTimeoutMs, opts.maxFeedBytes, log);
  if (fetched === null) throw new Error(`http error fetching ${redactUrl(feed.url)}`);
  if (fetched.bytes >= opts.feedBytesWarnAt) {
    log?.(`large feed ${redactUrl(feed.url)}: ${fetched.bytes} bytes${fetched.truncated ? " (truncated)" : ""}`);
  }
  const out: Item[] = [];
  let errors = 0;
  const raws = splitEntries(fetched.text);
  const gap = Math.max(0, opts.articleGapMs);
  for (const raw of raws) {
    let e;
    try {
      e = parseEntry(raw);
    } catch {
      errors++;
      continue;
    }
    const item = buildItem(feed, e, today);
    if (item.link && out.length < opts.maxArticlesPerFeed) {
      try {
        const article = await fetchTextCapped(item.link, opts.articleTimeoutMs, opts.maxArticleBytes, log);
        if (article?.text) {
          try {
            const extracted = extractMainHtml(article.text);
            if (extracted) {
              item.body = extracted;
              item.minutes = readingMinutes(stripHtml(extracted));
            }
          } catch {
          }
        }
      } catch {
        errors++;
      }
      if (gap > 0) await Bun.sleep(gap);
    }
    out.push(item);
  }
  return { items: out, errors };
}
