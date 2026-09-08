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

export function splitEntries(xml: string, maxEntries = 500): string[] {
  const entries: string[] = [];
  for (const tag of ["item", "entry"]) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      entries.push(m[1]);
      if (entries.length >= maxEntries) return entries;
    }
  }
  return entries;
}

const MAX_ENTRY_CHARS = 200_000;

export function parseEntry(e: string): ParsedEntry {
  const src = e.length > MAX_ENTRY_CHARS ? e.slice(0, MAX_ENTRY_CHARS) : e;
  const title = stripHtml(firstTag(src, ["title"]));
  let link = firstTag(src, ["link"]);
  if (link.includes("<")) {
    const href = /href\s*=\s*"([^"]+)"/i.exec(src) ?? /href\s*=\s*'([^']+)'/i.exec(src);
    link = href ? href[1] : stripHtml(link);
  }
  link = link.trim();
  const guid = firstTag(src, ["guid", "id"]);
  const description = firstTag(src, ["description", "summary"]);
  const content = firstTag(src, ["content:encoded", "content"]);
  const categories = allTags(src, "category").map((c) => stripHtml(c.replace(/<[^>]*>/g, "")));
  const authorNames = [...allTags(src, "author"), ...allTags(src, "dc:creator"), ...allTags(src, "name")].map(stripHtml).filter(Boolean);
  const published = firstTag(src, ["pubDate", "published", "updated", "dc:date"]);
  return { guid, title, link, description, content, categories, authorNames, published };
}

export interface FeedMeta {
  title: string;
  siteUrl: string;
  description: string;
}

export function parseFeedMeta(xml: string, fallbackUrl: string): FeedMeta {
  const channel = /<channel[^>]*>([\s\S]*?)<\/channel>/i.exec(xml)?.[1] ?? xml;
  const title = stripHtml(firstTag(channel, ["title"]));
  let siteUrl = firstTag(channel, ["link"]);
  if (siteUrl.includes("<")) {
    const href = /href\s*=\s*"([^"]+)"/i.exec(channel) ?? /href\s*=\s*'([^']+)'/i.exec(channel);
    siteUrl = (href?.[1] ?? stripHtml(siteUrl)).trim();
  } else {
    siteUrl = siteUrl.trim();
  }
  const description = stripHtml(firstTag(channel, ["description", "subtitle", "tagline"]));
  return { title: title || fallbackUrl, siteUrl, description };
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

export function guessTag(categories: string[], content: string): string {
  if (categories.length > 0) {
    let cat = categories[0].toLowerCase();
    if (cat.length > 20) cat = cat.slice(0, 20);
    return cat;
  }
  if (content !== "" && content.length > 2000) return "article";
  return "post";
}

export function readingMinutes(text: string): number {
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
