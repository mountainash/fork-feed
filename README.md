# kontrolplane/feed

A self-hosted RSS reader built with Go, HTMX, and templ. A single binary serves a server-rendered three-pane UI over plain HTTP. A background worker fetches your feeds on a configurable interval, extracts full article content via readability, and stores everything in SQLite or PostgreSQL. The browser talks directly to Go route handlers that return HTML fragments - there is no client-side state. htmx swaps panes without full page reloads. Your reading data stays in a local database file or your own postgresql instance, nowhere else.

Supports full-text search, keyboard-first navigation, timeline filtering (today, yesterday, last week, last month), feed management with inline editing, OPML import/export, dark mode, and deploys to Kubernetes via the included Helm chart with optional CloudNativePG integration.

<img width="1512" height="860" alt="image" src="https://github.com/user-attachments/assets/7c134cda-f1ee-4d56-928e-2d8417291d85" />

## keyboard shortcuts

| Key | Action | Key | Action |
|---|---|---|---|
| `j` / `k` | next / previous item | `s` | toggle star |
| `o` / `enter` | open item in reader | `m` | toggle read / unread |
| `/` | focus search | `n` | add new feed |
| `1` | toggle sidebar | `2` | toggle item list |

## import / export

kontrolplane/feed supports `opml` for migrating feeds between readers.

- `import`: go to settings and click "import opml" to upload a `.opml` or `.xml` file. Feeds are grouped into folders as defined in the file, existing feeds are updated, new ones are added.
- `export`: click "export opml" in settings to download a `feeds.opml` file containing all your subscriptions grouped by folder, compatible with any reader that supports OPML 2.0.

## configuration

All configuration is via environment variables.

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP listen port | `8080` |
| `MARK_READ_ON` | When items become read: `scroll`, `open`, `manual` | `open` |
| `RETENTION` | Keep read items for: `7d`, `30d`, `90d`, `forever` | `30d` |
| `DENSITY` | List row density: `tight`, `default`, `loose` | `default` |
| `REFRESH_INTERVAL` | How often to fetch feeds | `15m` |
| `DATABASE_DRIVER` | `sqlite` or `postgres` | `sqlite` |
| `DATABASE_PATH` | SQLite file path | `feed.db` |
| `DATABASE_HOST` | PostgreSQL host | `postgres` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | PostgreSQL database | `kontrolplane` |
| `DATABASE_USER` | PostgreSQL user | `postgres` |
| `DATABASE_PASSWORD` | PostgreSQL password | `password` |
| `DATABASE_SSL_MODE` | PostgreSQL SSL mode | `disable` |
| `DEVELOPMENT_DEBUG` | Enable debug logging | `false` |
| `DEVELOPMENT_SEED` | Seed default feeds on startup | `false` |

## deployment

A Helm chart is included in [`github.com/kontrolplane/helm-charts`](kontrolplane/helm-charts).

## prerequisites

- Go 1.22+
- [templ](https://templ.guide/) (`go install github.com/a-h/templ/cmd/templ@latest`)

## development

```bash
make deps
make dev
```

Open [http://localhost:8080](http://localhost:8080). The app seeds a couple of default feeds on first run.

## license

MIT
