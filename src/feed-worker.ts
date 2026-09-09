import { DEFAULT_FEED_JOB_OPTIONS, type FeedJobOptions, processFeed } from "./feed-job";
import type { Feed, Item } from "./types";

export interface FeedWorkRequest {
  type: "process-feed";
  feed: Feed;
  today: string;
  options?: Partial<FeedJobOptions>;
}

export interface FeedWorkResponse {
  ok: boolean;
  items?: Item[];
  articleErrors?: number;
  error?: string;
}

declare function postMessage(msg: FeedWorkResponse): void;

self.onmessage = async (event: MessageEvent<FeedWorkRequest>) => {
  const req = event.data;
  if (req?.type !== "process-feed") {
    postMessage({ ok: false, error: "unknown request" });
    return;
  }
  try {
    const opts: FeedJobOptions = { ...DEFAULT_FEED_JOB_OPTIONS, ...(req.options ?? {}) };
    const { items, errors } = await processFeed(req.feed, req.today, opts);
    postMessage({ ok: true, items, articleErrors: errors });
  } catch (err) {
    postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
