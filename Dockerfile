FROM oven/bun:1 AS build

WORKDIR /src
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --os=linux
COPY src ./src
COPY static ./static
RUN bun run build

FROM debian:bookworm-slim

# Certificates needed by Cloudflared to call back to cloudflareaccess.com for incoming key verification
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=cloudflare/cloudflared:2026.8.3 /usr/local/bin/cloudflared /usr/local/bin/
COPY --from=build /src/dist/kontrolplane-feed /usr/local/bin/
COPY --from=build /src/static /app/static
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app

ENTRYPOINT ["docker-entrypoint.sh"]
