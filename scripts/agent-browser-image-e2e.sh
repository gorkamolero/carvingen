#!/usr/bin/env bash
set -euo pipefail

ROOT_URL="${AGENT_BROWSER_BASE_URL:-http://127.0.0.1:3001}"
SESSION="${AGENT_BROWSER_SESSION_NAME:-carvingen-e2e}"
PROMPT_TEXT="${1:-A carved walnut raven totem on a cream studio background}"
SCREENSHOT_PATH="${AGENT_BROWSER_SCREENSHOT_PATH:-/tmp/carvingen-agent-browser-e2e.png}"

agent-browser --session "${SESSION}" open "${ROOT_URL}" >/dev/null

cat <<'EOF' | agent-browser --session "${SESSION}" eval --stdin >/dev/null
(() => {
  const canvas = document.querySelector('[data-testid="canvas-flow"]');
  if (!canvas) {
    throw new Error("Canvas not found.");
  }

  const transfer = new DataTransfer();
  transfer.setData("application/carvingen-node", JSON.stringify({ nodeType: "prompt" }));
  const event = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX: 360,
    clientY: 240,
    dataTransfer: transfer,
  });
  canvas.dispatchEvent(event);
  return true;
})()
EOF

agent-browser --session "${SESSION}" wait --fn "document.querySelectorAll('[data-testid=\"prompt-node\"]').length > 0" >/dev/null
agent-browser --session "${SESSION}" fill "[data-testid='prompt-textarea']" "${PROMPT_TEXT}" >/dev/null
agent-browser --session "${SESSION}" click "[data-testid='run-button']" >/dev/null
agent-browser --session "${SESSION}" wait --fn "Boolean(document.querySelector('img[alt=\"Latest output\"]')?.getAttribute('src'))" >/dev/null
agent-browser --session "${SESSION}" screenshot "${SCREENSHOT_PATH}" >/dev/null

cat <<'EOF' | agent-browser --session "${SESSION}" eval --stdin
(() => {
  const img = document.querySelector('img[alt="Latest output"]');
  if (!img) {
    return { ok: false, reason: "Latest output image not found." };
  }

  const rect = img.getBoundingClientRect();
  return {
    ok: true,
    src: img.getAttribute("src"),
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
})()
EOF
