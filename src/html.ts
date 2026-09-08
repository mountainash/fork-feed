import { esc } from "./opml";
import type { Feed, Folder, Item } from "./types";

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "1d";
  if (diff < 7) return `${diff}d`;
  return iso.slice(5, 10);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function truncate(s: string, max: number): string {
  if (s.length > max) return s.slice(0, max) + "…";
  return s;
}

export function truncateUrl(u: string): string {
  u = u.replace(/^https?:\/\//, "");
  if (u.length > 40) return u.slice(0, 35) + "…";
  return u;
}

export function feedForItem(item: Item, feeds: Feed[]): Feed | null {
  for (const f of feeds) if (f.id === item.feedId) return f;
  return null;
}
export { esc };
