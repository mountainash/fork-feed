<p align="center">
  <h1 align="center">
    <a href="https://kontrolplane.dev">
      <img width="1500" alt="kontrolplane header" src="./assets/kontrolplane-header.svg">
    </a>
  </h1>
</p>

`kontrolplane/feed` is a self-hosted RSS reader built with Go, HTMX, and templ. A single binary serves a server-rendered three-pane UI over plain HTTP. A background worker fetches your feeds on a configurable interval, extracts full article content via readability, and stores everything in SQLite or PostgreSQL. The browser talks directly to Go route handlers that return HTML fragments - there is no client-side state. htmx swaps panes without full page reloads. Your reading data stays in a local database file or your own postgresql instance, nowhere else.

Supports full-text search, keyboard-first navigation, timeline filtering (today, yesterday, last week, last month), feed management with inline editing, OPML import/export, dark mode, and deploys to Kubernetes via the included Helm chart with optional CloudNativePG integration.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/cd1c129a-bf15-402e-864b-1712022a9f31">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/ae1012c3-2d11-4cec-b32a-986951935da4">
  <img alt="Description of your image" src="https://github.com/user-attachments/assets/ae1012c3-2d11-4cec-b32a-986951935da4">
</picture>

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

## hosting

### docker compose

Two compose files are included for quick self-hosting.

`option: sqlite`:

```bash
docker compose up -d
```

This starts the app on port `8080` with a persistent volume for the database. All configuration can be adjusted by editing the `environment` block in `docker-compose.yaml`.

`option: postgresql`:

```bash
docker compose -f docker-compose.postgres.yaml up -d
```

This starts the app alongside a PostgreSQL 16 instance. The app waits for Postgres to pass its healthcheck before starting. Postgres is also exposed on `localhost:5432` for direct access. To start fresh with a clean database:

```bash
docker compose -f docker-compose.postgres.yaml down -v
docker compose -f docker-compose.postgres.yaml up -d --build
```

### helm chart

A Helm chart is available at [`kontrolplane/helm-charts`](https://github.com/kontrolplane/helm-charts).

`option: sqlite`:

```bash
helm repo add kontrolplane https://kontrolplane.github.io/helm-charts
helm install feed kontrolplane/feed
```

`option: postgresql through cnpg`

```bash
helm install feed kontrolplane/feed \
  --set database.driver=postgres \
  --set cnpg.enabled=true
```

This creates a Cloud Native PostgreSQL (CNPG) `Cluster` resource alongside the app. The CNPG operator must be installed on the cluster beforehand. Credentials are wired automatically from the operator-generated secret.

`option: postgresql external`

```bash
helm install feed kontrolplane/feed \
  --set database.driver=postgres \
  --set database.postgres.host=pg.example.com \
  --set database.postgres.user=feed \
  --set database.postgres.password=secret \
  --set database.postgres.database=feed
```

Or reference an existing Kubernetes secret:

```bash
helm install feed kontrolplane/feed \
  --set database.driver=postgres \
  --set database.postgres.existingSecret=pg-credentials
```

See the full chart documentation at [`kontrolplane/helm-charts/feed`](https://github.com/kontrolplane/helm-charts/feed) for all configuration options including ingress, resources, and autoscaling.

## prerequisites

- go 1.25+
- [templ](https://templ.guide/) (`go install github.com/a-h/templ/cmd/templ@latest`)

## development

```bash
make deps
make dev
```

Open [http://localhost:8080](http://localhost:8080). The app seeds a couple of default feeds on first run.

## license

MIT

<p align="center">
  <a href="https://kontrolplane.dev">
    <img width="1500" alt="kontrolplane footer" src="./assets/kontrolplane-footer.svg">
  </a>
</p>
