---
name: verify
description: Launch an isolated Lede instance and drive it with Playwright to observe a change at runtime.
---

# Verifying Lede changes at runtime

## Launch an isolated instance (don't touch the dev servers)

Ports 8787 (dev API) and 6173 (vite) are usually occupied by the user's own
dev servers with their real data — never reuse them. Boot a production-style
server on a free port with scratch state instead:

```bash
bun run build   # stale dist/ is a known failure source — always rebuild first
DATA_DIR=<scratch-dir> \
  LEDE_MASTER_KEY=$(head -c32 /dev/urandom | base64) \
  LEDE_SESSION_SECRET=any-string-at-least-32-characters-long \
  LEDE_AUTH_DISABLED=true \
  LEDE_TAILOR_ENGINE=fixture \
  PORT=8790 bun run start
```

`LEDE_AUTH_DISABLED=true` skips the login arc; `LEDE_TAILOR_ENGINE=fixture`
makes tailoring keyless.

## Seed data

```bash
curl -X POST localhost:8790/api/applications -H 'Content-Type: application/json' \
  -d '{"jobDescription":"...","company":"Acme","role":"Engineer"}'
```

Tailoring a fresh instance 422s — the fixture engine still needs Library
entries to select from (genState lands on `failed`, which is itself a
drivable state).

## Drive it

The MCP browser profile may be locked by another session. Fallback: a plain
node script using the repo's own Playwright — ESM resolution needs the
absolute import since the script lives in the scratchpad:

```js
import { chromium } from "/workspace/node_modules/playwright/index.mjs";
```

Useful handles: `data-testid="rail-pane"` (`data-collapsed` attr),
`rail-collapse-toggle`, `editor-pane`, `preview-pane`. Rail collapse persists
via `localStorage["lede.workspace.railCollapsed"]` — seed with
`page.addInitScript` to test cold-load state. Width transitions are 200ms;
wait ~350ms after toggling before measuring boundingBoxes.
