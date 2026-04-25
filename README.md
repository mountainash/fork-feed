# kontrolplane/feed

A self-hosted RSS reader built with Go, HTMX, and templ. No JavaScript frameworks, no build step, no accounts - just your feeds in a fast, keyboard-driven interface.

## prerequisites

- Go 1.22+
- [templ](https://templ.guide/) (`go install github.com/a-h/templ/cmd/templ@latest`)

## development

```bash
make deps
make dev
```

Open [http://localhost:8080](http://localhost:8080). The app seeds a couple of default feeds on first run.

## configuration

All configuration is via environment variables.

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP listen port | `8080` |
| `REFRESH_INTERVAL` | How often to fetch feeds | `15m` |
| `DATABASE_DRIVER` | `sqlite` or `postgres` | `sqlite` |
| `DATABASE_PATH` | SQLite file path | `feed.db` |
| `DATABASE_HOST` | PostgreSQL host | `postgres` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | PostgreSQL database | `kontrolplane` |
| `DATABASE_USER` | PostgreSQL user | `postgres` |
| `DATABASE_PASSWORD` | PostgreSQL password | `password` |
| `DATABASE_SSL_MODE` | PostgreSQL SSL mode | `disable` |
| `DEBUG` | Enable debug logging | `false` |
| `SEED` | Seed default feeds on startup | `false` |

## keyboard shortcuts

| Key | Action |
|---|---|
| `j` / `k` | Next / previous item |
| `o` or `Enter` | Open item in reader |
| `s` | Toggle star |
| `m` | Toggle read / unread |
| `/` | Focus search |
| `n` | Add new feed |
| `1` | Toggle sidebar |
| `2` | Toggle item list |

## import / export

kontrolplane/feed supports `opml` for migrating feeds between readers.

- `import`: go to settings and click "import opml" to upload a `.opml` or `.xml` file. Feeds are grouped into folders as defined in the file, existing feeds are updated, new ones are added.
- `export`: click "export opml" in settings to download a `feeds.opml` file containing all your subscriptions grouped by folder, compatible with any reader that supports OPML 2.0.

## deployment

A Helm chart is included in [`github.com/kontrolplane/helm-charts`](kontrolplane/helm-charts).

## license

MIT
