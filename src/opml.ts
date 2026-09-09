import type { Store } from "./store";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function attr(s: string): string | null {
  if (s === "") return null;
  const m = /^="([^"]*)"|^='([^']*)'|^=([^\s>]+)/.exec(s);
  if (!m) return "";
  return m[1] ?? m[2] ?? m[3] ?? "";
}

export function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    const name = m[1].toLowerCase();
    if (name === "outline") continue;
    if (m[2] === undefined) {
      out[name] = "";
    } else {
      const v = attr(m[2].trim());
      if (v !== null) out[name] = v;
    }
  }
  return out;
}

export interface OpmlOutline {
  text: string;
  title: string;
  xmlUrl: string;
  htmlUrl: string;
  children: OpmlOutline[];
}

export function parseOpmlOutlines(xml: string): OpmlOutline[] {
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body\s*>/i.exec(xml);
  const body = bodyMatch ? bodyMatch[1] : xml;
  const roots: OpmlOutline[] = [];
  const stack: OpmlOutline[][] = [roots];
  const nodeStack: OpmlOutline[] = [];
  const re = /<(\/?)outline\b([^>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const closing = m[1] === "/";
    const attrs = parseAttrs(m[2] ?? "");
    const selfClosing = m[3] === "/";
    if (closing) {
      if (stack.length > 1) stack.pop();
      nodeStack.pop();
      continue;
    }
    const node: OpmlOutline = {
      text: attrs.text ?? "",
      title: attrs.title ?? "",
      xmlUrl: attrs.xmlurl ?? "",
      htmlUrl: attrs.htmlurl ?? "",
      children: [],
    };
    stack[stack.length - 1].push(node);
    if (!selfClosing) {
      stack.push(node.children);
      nodeStack.push(node);
    }
  }
  return roots;
}

export function feedIdForUrl(feedUrl: string): string {
  let id = feedUrl.replace(/^https?:\/\//, "").replace(/\//g, "-");
  if (id.length > 32) id = id.slice(0, 32);
  return id;
}

function importOutline(store: Store, o: OpmlOutline, folderId: string): number {
  if (!o.xmlUrl) return 0;
  const title = o.title || o.text || o.xmlUrl;
  store.addFeed({ id: feedIdForUrl(o.xmlUrl), title, url: o.xmlUrl, folder: folderId, siteUrl: o.htmlUrl });
  return 1;
}

export function importOpml(store: Store, xml: string): number {
  const outlines = parseOpmlOutlines(xml);
  let imported = 0;
  let folderCount = store.folderCount();
  for (const o of outlines) {
    if (o.xmlUrl) {
      store.upsertFolder({ id: "default", label: "default" }, folderCount);
      imported += importOutline(store, o, "default");
    } else {
      const folderId = o.text ? o.text.toLowerCase().replaceAll(" ", "-") : "default";
      const label = o.text || "default";
      store.upsertFolder({ id: folderId, label }, folderCount);
      folderCount++;
      for (const child of o.children) imported += importOutline(store, child, folderId);
    }
  }
  return imported;
}

export async function importOpmlFileAsync(store: Store, path: string): Promise<number> {
  const text = await Bun.file(path).text();
  return importOpml(store, text);
}

export function exportOpml(store: Store): string {
  const folders = store.folders();
  const feeds = store.feeds();
  const now = new Date().toUTCString();
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>kontrolplane/feed</title>\n    <dateCreated>${esc(now)}</dateCreated>\n  </head>\n  <body>\n`;
  for (const folder of folders) {
    const group = feeds.filter((f) => f.folder === folder.id);
    if (group.length === 0) continue;
    out += `    <outline text="${esc(folder.label)}" title="${esc(folder.label)}">\n`;
    for (const feed of group) {
      out += `      <outline text="${esc(feed.title)}" title="${esc(feed.title)}" type="rss" xmlUrl="${esc(feed.url)}" htmlUrl="${esc(feed.siteUrl)}"/>\n`;
    }
    out += `    </outline>\n`;
  }
  out += `  </body>\n</opml>\n`;
  return out;
}
