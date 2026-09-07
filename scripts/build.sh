#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-./dist/kontrolplane-feed}"

mkdir -p "$(dirname "$OUT")"

echo "building single-file executable -> $OUT"
bun build --compile --minify ./src/server.ts --outfile "$OUT"

echo "bundling static assets alongside binary"
STATIC_OUT="$(dirname "$OUT")/static-dist-info.txt"
cat > "$STATIC_OUT" <<EOF
The compiled binary embeds src/*.ts.
Keep a ./static directory (css/js/assets) next to the binary at runtime:
  cp -r static <deploy-dir>/static
EOF

chmod +x "$OUT"
ls -lh "$OUT"
echo "done: $OUT"
echo "run: PORT=8080 DATABASE_PATH=/data/feed.db $OUT"
