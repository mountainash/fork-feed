import { buildItem, DEFAULT_FEED_JOB_OPTIONS, type FeedJobOptions, fetchTextCapped, itemId as jobItemId, processFeed } from "./feed-job";
import {
  decodeEntities,
  entryDate,
  extractMainHtml,
  guessTag,
  parseEntry,
  parseFeedMeta,
  readingMinutes,
  splitEntries,
  stripHtml,
} from "./feed-parse";
import type { FeedWorkRequest, FeedWorkResponse } from "./feed-worker";
import type { Store } from "./store";
import type { Feed, Item } from "./types";

export {
  decodeEntities,
  entryDate,
  extractMainHtml,
  guessTag,
  parseEntry,
  parseFeedMeta,
  readingMinutes,
  splitEntries,
  stripHtml,
};

const FETCH_TIMEOUT_MS = 30_000;

export function itemId(feedId: string, guid: string): string {
  return jobItemId(feedId, guid);
}

export async function fetchText(url: string, timeoutMs: number, log?: (msg: string) => void): Promise<string | null> {
  const res = await fetchTextCapped(url, timeoutMs, DEFAULT_FEED_JOB_OPTIONS.maxFeedBytes, log);
  return res ? res.text : null;
}

export async function fetchFeedItems(feed: Feed, today: string, fetchArticle: (url: string) => Promise<string>): Promise<Item[]> {
  const xml = await fetchText(feed.url, FETCH_TIMEOUT_MS);
  if (xml === null) throw new Error(`http error fetching ${feed.url}`);
  const out: Item[] = [];
  for (const raw of splitEntries(xml)) {
    let e;
    try {
      e = parseEntry(raw);
    } catch {
      continue;
    }
    const item = buildItem(feed, e, today);
    if (item.link) {
      try {
        const extracted = await fetchArticle(item.link);
        if (extracted) {
          item.body = extracted;
          item.minutes = readingMinutes(stripHtml(extracted));
        }
      } catch {
      }
    }
    out.push(item);
  }
  return out;
}

export interface FetcherTuning {
  maxWorkers: number;
  feedGapMs: number;
  job: Partial<FeedJobOptions>;
  workerTimeoutMs?: number;
}

export function resolveJobOptions(tuning?: FetcherTuning): FeedJobOptions {
  return { ...DEFAULT_FEED_JOB_OPTIONS, ...(tuning?.job ?? {}) };
}

export function workerTimeoutFor(opts: FeedJobOptions): number {
  return opts.feedTimeoutMs + opts.maxArticlesPerFeed * (opts.articleTimeoutMs + Math.max(0, opts.articleGapMs)) + 30_000;
}

async function runFeedInWorker(
  feed: Feed,
  today: string,
  jobOpts: FeedJobOptions,
  workerTimeoutMs: number,
  debug: boolean,
  debugLog: (...args: unknown[]) => void,
): Promise<{ items: Item[]; errors: number; }> {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./feed-worker.ts", import.meta.url).href);
  } catch {
    return processFeed(feed, today, jobOpts, debug ? (msg) => debugLog(msg) : undefined);
  }
  const req: FeedWorkRequest = { type: "process-feed", feed, today, options: jobOpts, debug };
  try {
    return await new Promise<{ items: Item[]; errors: number; }>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          worker.terminate();
        } catch {
        }
        reject(new Error(`worker timeout for ${feed.url}`));
      }, workerTimeoutMs);
      worker.onmessage = (event: MessageEvent<FeedWorkResponse>) => {
        const data = event.data;
        if (data?.type === "log") {
          debugLog(data.message);
          return;
        }
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch {
        }
        if (data?.ok) resolve({ items: data.items ?? [], errors: data.articleErrors ?? 0 });
        else reject(new Error(data?.error ?? `worker error for ${feed.url}`));
      };
      worker.onerror = (event: ErrorEvent) => {
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch {
        }
        debugLog(`worker failure for ${feed.url}: ${event.message} (${event.filename}:${event.lineno})`);
        reject(event.error instanceof Error ? event.error : new Error(`worker error for ${feed.url}`));
      };
      worker.postMessage(req);
    });
  } catch (err) {
    try {
      worker.terminate();
    } catch {
    }
    throw err;
  }
}

export function createFetcher(store: Store, intervalMs: number, onSync: (t: Date) => void, debug: boolean, tuning?: FetcherTuning) {
  const log = (...args: unknown[]) => console.log(...args);
  const debugLog = (...args: unknown[]) => {
    if (debug) console.debug(...args);
  };
  const maxWorkers = Math.min(8, Math.max(1, Math.floor(tuning?.maxWorkers ?? 2)));
  const feedGapMs = Math.max(0, tuning?.feedGapMs ?? 500);
  const jobOpts = resolveJobOptions(tuning);
  const workerTimeoutMs = tuning?.workerTimeoutMs ?? workerTimeoutFor(jobOpts);

  let running = false;

  async function fetchAll() {
    if (running) {
      log("fetch cycle already running, skipping");
      return;
    }
    running = true;
    const start = Date.now();
    try {
      log("starting feed fetch cycle");
      let feeds: Feed[];
      try {
        feeds = store.feeds();
      } catch (err) {
        log("error listing feeds", err);
        return;
      }
      log(`fetching feeds count=${feeds.length} workers=${Math.min(maxWorkers, feeds.length)}`);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      let fetched = 0;
      let errors = 0;
      let dispatched = 0;
      let next = 0;

      async function loop() {
        for (; ;) {
          const i = next++;
          if (i >= feeds.length) return;
          const feed = feeds[i];
          if (dispatched++ > 0 && feedGapMs > 0) await Bun.sleep(feedGapMs);
          try {
            const { items, errors: articleErrors } = await runFeedInWorker(feed, todayStr, jobOpts, workerTimeoutMs, debug, debugLog);
            if (articleErrors > 0) debugLog(`article errors feed=${feed.title} errors=${articleErrors}`);
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
      }

      const lanes = Math.min(maxWorkers, feeds.length);
      await Promise.all(Array.from({ length: lanes }, () => loop()));
      log(`finished feed fetch cycle fetched=${fetched} errors=${errors} duration=${Date.now() - start}ms`);
      onSync(new Date());
    } finally {
      running = false;
    }
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
