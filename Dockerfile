FROM oven/bun:1 AS build

WORKDIR /src
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY static ./static
RUN bun run build

FROM alpine:3.21

RUN apk add --no-cache ca-certificates
COPY --from=cloudflare/cloudflared:2026.8.3 /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY --from=build /src/dist/kontrolplane-feed /usr/local/bin/
COPY --from=build /src/static /app/static
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app

ENTRYPOINT ["docker-entrypoint.sh"]
