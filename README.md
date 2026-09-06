<p align="center">
  <h1 align="center">
    <a href="https://kontrolplane.dev">
      <img width="1500" alt="kontrolplane header" src="./assets/kontrolplane-header.svg">
    </a>
  </h1>
</p>

`kontrolplane/feed` is a self-hosted RSS reader built with Go, HTMX, and templ. A single binary serves a server-rendered three-pane UI over plain HTTP. A background worker fetches your feeds on a configurable interval, extracts full article content via readability, and stores everything in SQLite or PostgreSQL. The browser talks directly to Go route handlers that return HTML fragments - there is no client-side state. htmx swaps panes without full page reloads. Your reading data stays in a local database file or your own postgresql instance, nowhere else.

Supports full-text search, keyboard-first navigation, timeline filtering (today, yesterday, last week, last month), feed management with inline editing, OPML import/export, dark mode, and deploys to fly.io optional CloudNativePG integration.

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
| `HOST` | HTTP listen address (use `127.0.0.1` behind a local proxy) | all interfaces |
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

### fly.io

A `fly.toml` is included for deploying `kontrolplane/feed` as a single app on [fly.io](https://fly.io). It uses `auto_stop_machines`/`auto_start_machines` with `min_machines_running = 0` so the machine scales to zero when idle and starts back up on the next request, and it mounts a Fly volume at `/data` so the SQLite database survives restarts and deploys.

1. Install [`flyctl`](https://fly.io/docs/flyctl/install/) and sign in: `fly auth login`
2. Fork this repository, then clone your fork
3. Create the app (this reads `fly.toml`, but doesn't deploy yet): `fly launch --no-deploy`
   - Choose a unique app name, or edit `app` in `fly.toml` to match one you already created
   - Pick a region close to you, or update `primary_region` in `fly.toml`
4. Create the data volume in the same region as the app: `fly volumes create feed_store --size 1 --region <primary_region>`
5. Deploy: `fly deploy`
6. Open the app: `fly open`

To keep your fork's deployment up to date automatically, add a `FLY_API_TOKEN` secret to your fork's repository settings (`Settings > Secrets and variables > Actions`). Generate a deploy token with `fly tokens create deploy`. The `.github/workflows/fly-deploy.yaml` workflow redeploys the app whenever you push to `main`, including after syncing your fork with upstream changes.

Any of the [configuration](#configuration) environment variables can be set as Fly secrets, e.g. `fly secrets set RETENTION=90d`. If you'd rather run against PostgreSQL (for example with [Fly's managed Postgres](https://fly.io/docs/postgres/)), set `DATABASE_DRIVER=postgres` along with the corresponding `DATABASE_*` secrets and remove the `[mounts]` block from `fly.toml`, since the SQLite volume is no longer needed.

### Cloudflare Tunnel access

The included Fly deployment runs [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) alongside the app. It has no Fly HTTP service and binds the app to `127.0.0.1`, so the Cloudflare Tunnel is the only ingress.

1. In the Cloudflare dashboard, create a remotely managed tunnel and add a public hostname whose service is `http://localhost:8080`.
2. Store the tunnel token as a Fly secret: `fly secrets set TUNNEL_TOKEN='<token>'`. Do not put this token in `fly.toml` or source control.
3. Configure a [Cloudflare Access application and policy](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) for that hostname, then deploy with `fly deploy`.

`REQUIRE_TUNNEL=true` makes the container exit if the token is missing. Before deploying, confirm `fly ips list` has no public addresses; the tunnel makes outbound connections to Cloudflare and does not require a Fly public IP. The machine stays running while the tunnel is connected, so the previous scale-to-zero configuration no longer applies.

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
