#!/usr/bin/env bash
# pnpm dev wrapper: spins up a Cloudflare quick tunnel, writes its URL
# into .env.local as PUBLIC_URL, then starts Next.
#
# Why: fal's workers need a publicly reachable URL to fetch reference
# images from our local dev server. Without a tunnel, every Run that
# includes a reference image 422s.
set -eu

cd "$(dirname "$0")/.."

PORT="${PORT:-3001}"
ENV_FILE=".env.local"
TUNNEL_LOG="/tmp/cloudflared-carvingen.log"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not installed. brew install cloudflared" >&2
  exit 1
fi

: > "$TUNNEL_LOG"
cloudflared tunnel --url "http://localhost:${PORT}" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

cleanup() {
  if kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "▸ starting cloudflared tunnel on :${PORT}…"
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9][-a-z0-9]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -n1 || true)
  if [ -n "${URL}" ]; then break; fi
  sleep 0.5
done

if [ -z "${URL}" ]; then
  echo "✗ tunnel didn't come up in 20s. Log tail:" >&2
  tail -n 30 "$TUNNEL_LOG" >&2 || true
  exit 1
fi
echo "▸ tunnel: ${URL}"

if [ -f "$ENV_FILE" ] && grep -q '^PUBLIC_URL=' "$ENV_FILE"; then
  # macOS sed needs empty '' after -i
  sed -i '' "s|^PUBLIC_URL=.*|PUBLIC_URL=${URL}|" "$ENV_FILE"
else
  echo "PUBLIC_URL=${URL}" >> "$ENV_FILE"
fi
echo "▸ wrote PUBLIC_URL to ${ENV_FILE}"

echo "▸ starting next dev on :${PORT}"
next dev -p "${PORT}" &
NEXT_PID=$!

wait "$NEXT_PID"
