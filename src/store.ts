import type { Database } from "bun:sqlite";
import type { Counts, Feed, Folder, Item, ListFilter } from "./types";

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftedStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return todayStr(d);
}

export class Store {
  constructor (private db: Database) { }

  upsertFolder(f: Folder, pos: number): void {
    this.db.run(
      `INSERT INTO folders (id, label, pos) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label, pos=excluded.pos`,
      [f.id, f.label, pos],
    );
  }

  upsertFeed(f: Feed): void {
    this.db.run(
      `INSERT INTO feeds (id, title, url, folder, site_url) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, url=excluded.url, folder=excluded.folder, site_url=excluded.site_url`,
      [f.id, f.title, f.url, f.folder, f.siteUrl],
    );
  }

  addFeed(f: Feed): void {
    this.upsertFeed(f);
  }

  upsertItem(it: Item): void {
    this.db.run(
      `INSERT INTO items (id, feed_id, folder, title, authors, date, read, starred, tag, abstract, body, link, minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, authors=excluded.authors, date=excluded.date,
         tag=excluded.tag, abstract=excluded.abstract, body=excluded.body,
         link=excluded.link, minutes=excluded.minutes`,
      [
        it.id,
        it.feedId,
        it.folder,
        it.title,
        it.authors,
        it.date,
        it.read ? 1 : 0,
        it.starred ? 1 : 0,
        it.tag,
        it.abstract,
        it.body,
        it.link,
        it.minutes,
      ],
    );
  }

  folders(): Folder[] {
    return this.db.query<{ id: string; label: string; }, []>(`SELECT id, label FROM folders ORDER BY pos`).all() as Folder[];
  }

  feeds(): Feed[] {
    const rows = this.db
      .query<{ id: string; title: string; url: string; folder: string; site_url: string; }, []>(
        `SELECT id, title, url, folder, site_url FROM feeds ORDER BY title`,
      )
      .all();
    return rows.map((r) => ({ id: r.id, title: r.title, url: r.url, folder: r.folder, siteUrl: r.site_url }));
  }

  feedById(id: string): Feed | null {
    const r = this.db
      .query<{ id: string; title: string; url: string; folder: string; site_url: string; }, [string]>(
        `SELECT id, title, url, folder, site_url FROM feeds WHERE id=?`,
      )
      .get(id);
    if (!r) return null;
    return { id: r.id, title: r.title, url: r.url, folder: r.folder, siteUrl: r.site_url };
  }

  itemById(id: string): Item | null {
    const r = this.db
      .query<
        {
          id: string;
          feed_id: string;
          folder: string;
          title: string;
          authors: string;
          date: string;
          read: number;
          starred: number;
          tag: string;
          abstract: string;
          body: string;
          link: string;
          minutes: number;
        },
        [string]
      >(
        `SELECT id, feed_id, folder, title, authors, date, read, starred, tag, abstract, body, link, minutes FROM items WHERE id=?`,
      )
      .get(id);
    if (!r) return null;
    return {
      id: r.id,
      feedId: r.feed_id,
      folder: r.folder,
      title: r.title,
      authors: r.authors,
      date: r.date,
      read: r.read === 1,
      starred: r.starred === 1,
      tag: r.tag,
      abstract: r.abstract,
      body: r.body,
      link: r.link,
      minutes: r.minutes,
    };
  }

  listItems(f: ListFilter): Item[] {
    const where: string[] = [];
    const args: (string | number)[] = [];

    switch (f.viewKind) {
      case "feed":
        where.push("i.feed_id = ?");
        args.push(f.viewId);
        break;
      case "folder":
        where.push("i.folder = ?");
        args.push(f.viewId);
        break;
      case "view":
        switch (f.viewId) {
          case "unread":
            where.push("i.read = 0");
            break;
          case "read":
            where.push("i.read = 1");
            break;
          case "starred":
            where.push("i.starred = 1");
            break;
          case "today":
            where.push("i.date = ?");
            args.push(todayStr());
            break;
          case "yesterday": {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            where.push("i.date >= ? AND i.date < ?");
            args.push(todayStr(yesterday), todayStr());
            break;
          }
          case "last-week":
            where.push("i.date >= ?");
            args.push(shiftedStr(7));
            break;
          case "last-month":
            where.push("i.date >= ?");
            args.push(shiftedStr(30));
            break;
        }
        break;
    }

    if (f.query !== "") {
      const q = `%${f.query.toLowerCase()}%`;
      where.push("(LOWER(i.title) LIKE ? OR LOWER(i.authors) LIKE ? OR LOWER(i.abstract) LIKE ?)");
      args.push(q, q, q);
    }

    let query =
      "SELECT i.id, i.feed_id, i.folder, i.title, i.authors, i.date, i.read, i.starred, i.tag, i.abstract, i.body, i.link, i.minutes FROM items i";
    if (where.length > 0) query += ` WHERE ${where.join(" AND ")}`;

    switch (f.sort) {
      case "oldest":
        query += " ORDER BY i.date ASC, i.id ASC";
        break;
      case "unread":
        query += " ORDER BY i.read ASC, i.date DESC, i.id DESC";
        break;
      default:
        query += " ORDER BY i.date DESC, i.id DESC";
    }

    const rows = this.db
      .query<
        {
          id: string;
          feed_id: string;
          folder: string;
          title: string;
          authors: string;
          date: string;
          read: number;
          starred: number;
          tag: string;
          abstract: string;
          body: string;
          link: string;
          minutes: number;
        },
        (string | number)[]
      >(query)
      .all(...args);
    return rows.map((r) => ({
      id: r.id,
      feedId: r.feed_id,
      folder: r.folder,
      title: r.title,
      authors: r.authors,
      date: r.date,
      read: r.read === 1,
      starred: r.starred === 1,
      tag: r.tag,
      abstract: r.abstract,
      body: r.body,
      link: r.link,
      minutes: r.minutes,
    }));
  }

  markRead(id: string, read: boolean): void {
    this.db.run(`UPDATE items SET read=? WHERE id=?`, [read ? 1 : 0, id]);
  }

  toggleStar(id: string): void {
    this.db.run(`UPDATE items SET starred = 1 - starred WHERE id=?`, [id]);
  }

  toggleRead(id: string): void {
    this.db.run(`UPDATE items SET read = 1 - read WHERE id=?`, [id]);
  }

  counts(): Counts {
    const one = (q: string, ...args: (string | number)[]): number => {
      const r = this.db.query<{ n: number; }, (string | number)[]>(q).get(...args);
      return r?.n ?? 0;
    };
    const today = todayStr();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const c: Counts = {
      all: one("SELECT COUNT(*) AS n FROM items"),
      unread: one("SELECT COUNT(*) AS n FROM items WHERE read=0"),
      read: one("SELECT COUNT(*) AS n FROM items WHERE read=1"),
      starred: one("SELECT COUNT(*) AS n FROM items WHERE starred=1"),
      today: one("SELECT COUNT(*) AS n FROM items WHERE date = ?", today),
      yesterday: one("SELECT COUNT(*) AS n FROM items WHERE date >= ? AND date < ?", todayStr(yesterday), today),
      lastWeek: one("SELECT COUNT(*) AS n FROM items WHERE date >= ?", shiftedStr(7)),
      lastMonth: one("SELECT COUNT(*) AS n FROM items WHERE date >= ?", shiftedStr(30)),
      perFeed: {},
    };
    const rows = this.db
      .query<{ feed_id: string; n: number; }, []>(`SELECT feed_id, COUNT(*) AS n FROM items WHERE read=0 GROUP BY feed_id`)
      .all();
    for (const r of rows) c.perFeed[r.feed_id] = r.n;
    return c;
  }

  itemExists(id: string): boolean {
    const r = this.db.query<{ n: number; }, [string]>(`SELECT 1 AS n FROM items WHERE id=? LIMIT 1`).get(id);
    return (r?.n ?? 0) === 1;
  }

  existingItemIds(feedId: string): string[] {
    return this.db
      .query<{ id: string; }, [string]>(`SELECT id FROM items WHERE feed_id=?`)
      .all(feedId)
      .map((r) => r.id);
  }

  deleteFeed(id: string): void {
    this.db.run(`DELETE FROM items WHERE feed_id=?`, [id]);
    this.db.run(`DELETE FROM feeds WHERE id=?`, [id]);
  }

  deleteFolder(id: string): void {
    this.db.run(`DELETE FROM items WHERE folder=?`, [id]);
    this.db.run(`DELETE FROM feeds WHERE folder=?`, [id]);
    this.db.run(`DELETE FROM folders WHERE id=?`, [id]);
  }

  renameFolder(id: string, label: string): void {
    this.db.run(`UPDATE folders SET label=? WHERE id=?`, [label, id]);
  }

  feedCount(): number {
    return this.db.query<{ n: number; }, []>(`SELECT COUNT(*) AS n FROM feeds`).get()?.n ?? 0;
  }

  folderCount(): number {
    return this.db.query<{ n: number; }, []>(`SELECT COUNT(*) AS n FROM folders`).get()?.n ?? 0;
  }

  seed(): void {
    this.upsertFolder({ id: "default", label: "default" }, 0);
    this.upsertFeed({ id: "hacker-news", title: "hacker news", url: "https://news.ycombinator.com/rss", folder: "default", siteUrl: "" });
    this.upsertFeed({ id: "cncf", title: "cloud native computing foundation", url: "http://cncf.io/feed", folder: "default", siteUrl: "" });
  }
}
