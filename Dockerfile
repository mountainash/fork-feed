FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build

ARG TARGETOS
ARG TARGETARCH

RUN go install github.com/a-h/templ/cmd/templ@latest

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN templ generate
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o /bin/kontrolplane-feed ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates
COPY --from=build /bin/kontrolplane-feed /usr/local/bin/
COPY --from=build /src/static /app/static
COPY --from=build /src/templates /app/templates

WORKDIR /app
EXPOSE 8080

ENTRYPOINT ["kontrolplane-feed"]
