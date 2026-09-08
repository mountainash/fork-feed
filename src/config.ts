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
  };
}
