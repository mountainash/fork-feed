export interface Config {
  host: string;
  port: number;
  refreshIntervalMs: number;
  refreshLabel: string;
  databasePath: string;
  markReadOn: string;
  retention: string;
  density: string;
  feedsFile: string;
  debug: boolean;
  seed: boolean;
  maxWorkers: number;
  feedGapMs: number;
  feedTimeoutMs: number;
  articleTimeoutMs: number;
  maxFeedBytes: number;
  maxArticleBytes: number;
  maxArticlesPerFeed: number;
  articleGapMs: number;
}

function parseDurationMs(raw: string, fallbackMs: number): number {
  const s = raw.trim();
  if (s === "") return fallbackMs;
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$/.exec(s);
  if (!m || m[0] === "") return fallbackMs;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  const ms = Number(m[4] ?? 0);
  const total = h * 3600000 + min * 60000 + sec * 1000 + ms;
  return total > 0 ? total : fallbackMs;
}

function goDurationLabel(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  return `${m}m${s}s`;
}

function boolEnv(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function numEnv(v: string | undefined, fallback: number, min: number, max: number): number {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function bytesEnv(v: string | undefined, fallback: number, min: number, max: number): number {
  if (v === undefined || v.trim() === "") return fallback;
  const s = v.trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/.exec(s);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  const unit = m[2] ?? "b";
  const mult = unit === "gb" ? 1024 ** 3 : unit === "mb" ? 1024 ** 2 : unit === "kb" ? 1024 : 1;
  return Math.min(max, Math.max(min, Math.floor(n * mult)));
}

export function loadConfig(): Config {
  const env = Bun.env;
  const refreshIntervalMs = parseDurationMs(env.REFRESH_INTERVAL ?? "1h", 60 * 60 * 1000);
  return {
    host: env.HOST ?? "",
    port: Number.parseInt(env.PORT ?? "8080", 10) || 8080,
    refreshIntervalMs,
    refreshLabel: goDurationLabel(refreshIntervalMs),
    databasePath: env.DATABASE_PATH ?? "feed.db",
    markReadOn: env.MARK_READ_ON ?? "open",
    retention: env.RETENTION ?? "30d",
    density: env.DENSITY ?? "default",
    feedsFile: env.FEEDS_FILE ?? "",
    debug: boolEnv(env.DEVELOPMENT_DEBUG, false),
    seed: boolEnv(env.DEVELOPMENT_SEED, false),
    maxWorkers: numEnv(env.FETCH_WORKERS, 2, 1, 8),
    feedGapMs: numEnv(env.FETCH_FEED_GAP_MS, 500, 0, 60_000),
    feedTimeoutMs: numEnv(env.FETCH_FEED_TIMEOUT_MS, 15_000, 1_000, 120_000),
    articleTimeoutMs: numEnv(env.FETCH_ARTICLE_TIMEOUT_MS, 10_000, 1_000, 120_000),
    maxFeedBytes: bytesEnv(env.FETCH_MAX_FEED_BYTES, 5 * 1024 * 1024, 64 * 1024, 100 * 1024 * 1024),
    maxArticleBytes: bytesEnv(env.FETCH_MAX_ARTICLE_BYTES, 2 * 1024 * 1024, 16 * 1024, 50 * 1024 * 1024),
    maxArticlesPerFeed: numEnv(env.FETCH_MAX_ARTICLES_PER_FEED, 20, 0, 500),
    articleGapMs: numEnv(env.FETCH_ARTICLE_GAP_MS, 300, 0, 30_000),
  };
}
