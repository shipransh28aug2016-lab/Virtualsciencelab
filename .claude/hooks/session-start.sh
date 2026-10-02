#!/bin/bash
# SessionStart hook — Claude Code on the web only.
#
# A fresh web container has the source and nothing else. Two things are missing,
# and both have cost a session real time:
#
#   1. node_modules, for BOTH packages. They are gitignored, so a new container
#      has none: the repo root (the 2D app, its audits, and Playwright) and
#      webgl-labs/ (the React-Three-Fiber benches, which also import
#      Playwright for their render checks).
#
#   2. A browser the render checks can drive. The container ships Chromium 141
#      (build 1194), but the project's Playwright is pinned to build 1234, so left
#      alone every render check dies with "Executable doesn't exist". CHROME_PATH
#      points them at the Chromium that is actually installed.
#
# Synchronous on purpose: the session must not start until the toolchain exists,
# or a test run can race the install. Idempotent: `npm install` on an up-to-date
# tree is a no-op, and the env file is only appended to once per variable.
set -euo pipefail

# The local desktop/CLI has its own toolchain and its own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT"

# The container already has a browser, and outbound access to Playwright's CDN
# is blocked. A postinstall that tries to fetch one would hang or fail the whole
# install, so forbid it outright.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

install_deps() {
  local dir="$1"
  echo "session-start: npm install (${dir})"
  # `install`, not `ci`: the container state is cached after this hook, so an
  # incremental install on the next session is nearly free; `ci` would delete
  # node_modules and rebuild it from scratch every time.
  (cd "$dir" && npm install --no-audit --no-fund --loglevel=error)
}

install_deps .
install_deps webgl-labs

# ── Point Playwright at the Chromium that is installed ───────────────────────
BROWSERS="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
CHROME=""
# /opt/pw-browsers/chromium is the stable symlink; the versioned directories are
# the fallback if a future image drops it. Newest first.
for candidate in "$BROWSERS/chromium" \
  $(ls -d "$BROWSERS"/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V -r || true); do
  if [ -x "$candidate" ]; then
    CHROME="$candidate"
    break
  fi
done

# Persist for the rest of the session. Appended once per variable, so re-running
# the hook (resume, clear, compact) never stacks duplicate exports.
persist() {
  if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -qs "^export $1=" "$CLAUDE_ENV_FILE"; then
    printf 'export %s=%q\n' "$1" "$2" >> "$CLAUDE_ENV_FILE"
  fi
}
persist PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD 1
if [ -n "$CHROME" ]; then
  persist CHROME_PATH "$CHROME"
  echo "session-start: CHROME_PATH=$CHROME"
else
  echo "session-start: WARNING no Chromium found under $BROWSERS; render checks will not run"
fi

# ── Fail loudly if the install did not produce a usable toolchain ────────────
for required in node_modules/playwright webgl-labs/node_modules/vite \
  webgl-labs/node_modules/three; do
  if [ ! -d "$required" ]; then
    echo "session-start: ERROR $required is missing after install" >&2
    exit 1
  fi
done

echo "session-start: ready"
