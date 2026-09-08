<p align="center">
  <h1 align="center">
    <a href="https://kontrolplane.dev">
      <img width="1500" alt="kontrolplane header" src="./assets/kontrolplane-header.svg">
    </a>
  </h1>
</p>

`kontrolplane/feed` is a self-hosted RSS reader built with Bun (TypeScript), HTMX, and SQLite. A single-file executable serves a server-rendered three-pane UI over plain HTTP. A background worker fetches your feeds on a configurable interval, extracts full article content, and stores everything in SQLite via Bun's native `bun:sqlite` driver. The browser talks directly to route handlers that return HTML fragments - there is no client-side state. HTMX swaps panes without full page reloads. Your reading data stays in a local database file, nowhere else.

Supports full-text search, keyboard-first navigation, timeline filtering (today, yesterday, last week, last month), feed management with inline editing, OPML import/export, dark mode, and deployments to fly.io.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/cd1c129a-bf15-402e-864b-1712022a9f31">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/ae1012c3-2d11-4cec-b32a-986951935da4">
  <img alt="Description of your image" src="https://github.com/user-attachments/assets/ae1012c3-2d11-4cec-b32a-986951935da4">
</picture>

## ⌨️ Keyboard Shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `j` / `k` | next / previous item | `s` | toggle star |
| `o` / `enter` | open item in reader | `m` | toggle read / unread |
| `/` | focus search | `n` | add new feed |
| `1` | toggle sidebar | `2` | toggle item list |

## 🔄 Import / Export

kontrolplane/feed supports `opml` for migrating feeds between readers.

- `import`: go to settings and click "import opml" to upload a `.opml` or `.xml` file. Feeds are grouped into folders as defined in the file, existing feeds are updated, new ones are added.
- `export`: click "export opml" in settings to download a `feeds.opml` file containing all your subscriptions grouped by folder, compatible with any reader that supports OPML 2.0.

## ⚙️ Configuration

All configuration is via environment variables.

| Variable | Description | Default |
| --- | --- | --- |
| `HOST` | HTTP listen address (use `127.0.0.1` behind a local proxy) | all interfaces |
| `PORT` | HTTP listen port | `8080` |
| `MARK_READ_ON` | When items become read: `scroll`, `open`, `manual` | `open` |
| `RETENTION` | Keep read items for: `7d`, `30d`, `90d`, `forever` | `30d` |
| `DENSITY` | List row density: `tight`, `default`, `loose` | `default` |
| `REFRESH_INTERVAL` | How often to fetch feeds | `15m` |
| `DATABASE_PATH` | SQLite file path | `feed.db` |
| `FEEDS_FILE` | Path to an OPML file to import on startup | `` |
| `DEVELOPMENT_DEBUG` | Enable debug logging | `false` |
| `DEVELOPMENT_SEED` | Seed default feeds on startup | `false` |

## 🗂 Project Layout

```plaintext
src/
  server.ts        # Bun.serve entrypoint, all routes, view state
  config.ts        # env parsing (Bun.env)
  db.ts            # bun:sqlite open + schema/migrations
  store.ts         # SQLite queries (folders, feeds, items, counts)
  opml.ts          # OPML import/export (no dependencies)
  fetcher.ts       # background RSS/Atom fetch + article extraction
  types.ts         # shared Feed/Folder/Item/Counts/view types
  html.ts          # escaping + date/format helpers
  views/
    pages.ts       # layout, full page, settings, manage, modals
    partials.ts    # sidebar, item list, reader, status, OOB fragments
static/
  css/styles.css   # single stylesheet (light + dark via data-theme)
  js/hotkeys.js    # keyboard navigation
```

Routes are plain `Bun.serve` handlers returning HTML strings with `HX-Request` / `hx-swap-oob` semantics. The database layer uses only `bun:sqlite` (WAL mode, `busy_timeout=5000`) and creates the schema on startup — no migrations tool, no Postgres.

## ☁️ Hosting

### 🐋 Docker Compose

A compose file is included for quick self-hosting.

```bash
docker compose up -d
```

This starts the app on port `8080` with a persistent volume for the database. All configuration can be adjusted by editing the `environment` block in `docker-compose.yaml`. To start fresh with a clean database:

```bash
docker compose down -v
docker compose up -d --build
```

### 🎈 fly.io

A `fly.toml` is included for deploying `feed` as a single app on [fly.io](https://fly.io/). It mounts a Fly volume at `/data` so the SQLite database survives restarts and new deploys.

1. Install [`flyctl`](https://fly.io/docs/flyctl/install/) and sign in: `fly auth login`
2. Fork this repository, then clone your fork
3. Create the app (this reads `fly.toml`, but doesn't deploy yet): `fly launch --no-deploy`
   - Choose a unique app name, or edit `app` in `fly.toml` to match one you already created
   - Pick a region close to you, or update `primary_region` in `fly.toml`
4. Create the data volume in the same region as the app: `fly volumes create feed_store --size 1 --region <primary_region>`
5. Deploy: `fly deploy`
6. Open the app: `fly open`

To keep your fork's deployment up to date automatically, add a `FLY_API_TOKEN` secret to your fork's repository settings (`Settings > Secrets and variables > Actions`). Generate a deploy token with `fly tokens create deploy`. The `.github/workflows/fly-deploy.yaml` workflow redeploys the app whenever you push to the `fly` branch.

Any of the [configuration](#configuration) environment variables can be set as Fly secrets, e.g. `fly secrets set RETENTION=90d`.

### 🌐 Cloudflare Tunnel Access

The included Fly deployment runs [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) alongside the app. It has no Fly HTTP service and binds the app to `127.0.0.1`, so the Cloudflare Tunnel is the only ingress.

1. In the Cloudflare dashboard, create a remotely managed tunnel and add a public hostname whose service is `http://localhost:8080`.
2. Store the tunnel token as a Fly secret: `fly secrets set TUNNEL_TOKEN='<token>'`. Do not put this token in `fly.toml` or source control.
3. Configure a [Cloudflare Access application and policy](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) for that hostname, then deploy with `fly deploy --no-public-ips`.

`REQUIRE_TUNNEL=true` makes the container exit if the token is missing. Before deploying, confirm `fly ips list` has no public addresses; the tunnel makes outbound connections to Cloudflare and does not require a Fly public IP.

## 📦 Prerequisites

- [bun](https://bun.sh/) 1.0+

## 🛠 Development

```bash
bun install
bun run dev
```

Open [http://localhost:8080](http://localhost:8080). To seed a couple of default feeds on first run: `DEVELOPMENT_SEED=true bun run dev`.

## 🏗 Build

Compile to a single-file executable with the Bun bundler:

```bash
bun run build
# -> ./dist/kontrolplane-feed
```

Or directly:

```bash
./scripts/build.sh ./dist/kontrolplane-feed
```

Deploy the binary with a `static/` directory next to it (CSS/JS/assets are served from disk):

```bash
cp -r static dist/static
PORT=8080 DATABASE_PATH=/data/feed.db ./dist/kontrolplane-feed
```

Cross-compile for a Linux server from macOS:

```bash
bun run build:linux-x64-musl
```

## 📝 License

MIT

<p align="center">
  <a href="https://kontrolplane.dev">
    <img width="1500" alt="kontrolplane footer" src="./assets/kontrolplane-footer.svg">
  </a>
</p>
