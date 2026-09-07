.PHONY: build run dev clean install

BUN := bun
OUT := ./dist/kontrolplane-feed

install:
	$(BUN) install

build:
	./scripts/build.sh $(OUT)

run: build
	$(OUT)

dev:
	$(BUN) --hot ./src/server.ts

clean:
	rm -rf dist feed.db feed.db-shm feed.db-wal tmp/
