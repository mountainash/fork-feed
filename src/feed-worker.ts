import { DEFAULT_FEED_JOB_OPTIONS, type FeedJobOptions, processFeed } from "./feed-job";
import type { Feed, Item } from "./types";

export interface FeedWorkRequest {
  type: "process-feed";
  feed: Feed;
  today: string;
  options?: Partial<FeedJobOptions>;
  debug?: boolean;
  knownItemIds?: string[];
}

export interface FeedWorkLog {
  type: "log";
  message: string;
}

export interface FeedWorkResult {
  type: "result";
  ok: boolean;
  items?: Item[];
  articleErrors?: number;
  error?: string;
}

export type FeedWorkResponse = FeedWorkLog | FeedWorkResult;

declare function postMessage(msg: FeedWorkResponse): void;

self.onmessage = async (event: MessageEvent<FeedWorkRequest>) => {
  const req = event.data;
  if (req?.type !== "process-feed") {
    postMessage({ type: "result", ok: false, error: "unknown request" });
    return;
  }
  const log = req.debug ? (message: string) => postMessage({ type: "log", message }) : undefined;
  try {
    const opts: FeedJobOptions = { ...DEFAULT_FEED_JOB_OPTIONS, ...(req.options ?? {}) };
    const known = req.knownItemIds ? new Set(req.knownItemIds) : undefined;
    const { items, errors } = await processFeed(req.feed, req.today, opts, log, known);
    postMessage({ type: "result", ok: true, items, articleErrors: errors });
  } catch (err) {
    postMessage({ type: "result", ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
