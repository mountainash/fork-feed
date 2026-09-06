FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build

ARG TARGETOS
ARG TARGETARCH

RUN go install github.com/a-h/templ/cmd/templ@v0.3.1001

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN templ generate
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o /bin/kontrolplane-feed ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates
COPY --from=cloudflare/cloudflared:2026.8.3 /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY --from=build /bin/kontrolplane-feed /usr/local/bin/
COPY --from=build /src/static /app/static
COPY --from=build /src/templates /app/templates
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app

ENTRYPOINT ["docker-entrypoint.sh"]
