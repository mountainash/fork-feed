.PHONY: build run dev clean templ tidy deps

# ---- variables ----
BINARY := kontrolplane-feed
CMD    := ./cmd/server

# ---- build ----
build: templ
	go build -o $(BINARY) $(CMD)

run: build
	./$(BINARY)

dev:
	air

# ---- codegen ----
templ:
	docker run -v `pwd`:/templates -w=/templates ghcr.io/a-h/templ:latest generate

# ---- deps ----
tidy:
	go mod tidy

deps:
	go install github.com/a-h/templ/cmd/templ@latest
	go install github.com/air-verse/air@latest
	go mod tidy

# ---- clean ----
clean:
	rm -f $(BINARY) feed.db feed.db-shm feed.db-wal
	rm -rf tmp/
