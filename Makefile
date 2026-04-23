.PHONY: build run dev clean templ tidy

# ---- variables ----
BINARY   := kontrolplane-feed
CMD      := ./cmd/server
TEMPL    := $(shell which templ 2>/dev/null || echo "$(HOME)/go/bin/templ")

# ---- build ----
build: templ
	go build -o $(BINARY) $(CMD)

run: build
	./$(BINARY)

dev: build
	SEED=true DEBUG=true ./$(BINARY)

# ---- codegen ----
templ:
	$(TEMPL) generate

# ---- deps ----
tidy:
	go mod tidy

deps:
	go install github.com/a-h/templ/cmd/templ@latest
	go mod tidy

# ---- clean ----
clean:
	rm -f $(BINARY) feed.db
