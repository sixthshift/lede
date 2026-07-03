# lede

A Bun + TypeScript HTTP server, developed inside an isolated dev container.

## Tech stack

- **Runtime:** [Bun](https://bun.sh) 1.x
- **Language:** TypeScript 5.6
- **Server:** `Bun.serve()` (no framework)

## Development

The dev environment is a Debian container with Bun, Node 22, the Docker CLI, Go +
[`mcp-language-server`](https://github.com/isaacphi/mcp-language-server), and the
Claude Code CLI preinstalled. It mounts your workspace, SSH keys, and gitconfig,
and keeps `node_modules` in a container-private volume so host/container native
binaries don't collide.

### Option A — VS Code / Cursor Dev Containers

Open the folder and **Reopen in Container**. The `postCreateCommand` runs
`bun install` automatically. Then, in the container terminal:

```bash
bun run dev
```

### Option B — Docker Compose directly

```bash
# Build and start the dev container in the background
docker compose -f .devcontainer/docker-compose.dev.yml up -d --build

# Drop into a shell
docker compose -f .devcontainer/docker-compose.dev.yml exec dev bash

# Inside the container (first time only)
bun install

# Run the server (watch mode)
bun run dev
```

The server listens on container port `3000`, published to **http://localhost:3737**
on the host. Health check:

```bash
curl http://localhost:3737/health
```

To stop and tear down:

```bash
docker compose -f .devcontainer/docker-compose.dev.yml down
```

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `bun run dev`   | Start the server with `--watch`      |
| `bun run start` | Start the server once                |
| `bun run check` | Type-check with `tsc --noEmit`       |

## Configuration

Copy `.env.example` to `.env` and adjust as needed. `.env` is git-ignored and
optionally loaded by the dev container.

## Production / self-hosting

The root `Dockerfile` is a multi-stage build: a Bun stage builds the SPA
(`bun run build` → `dist/`), and a slim **Node** stage runs the server via
`tsx` (the server always runs under Node, never Bun — `better-sqlite3`'s
native binary is Node-ABI only). Data (the SQLite DB) lives in `DATA_DIR`
(default `/app/data`), backed by a named volume so it survives rebuilds.

### First run

1. Generate the two required secrets — the server refuses to boot without them:

   ```bash
   export LEDE_MASTER_KEY=$(openssl rand -base64 32)
   export LEDE_SESSION_SECRET=$(openssl rand -base64 48)
   ```

2. Build and start:

   ```bash
   docker compose up --build
   ```

3. Open **http://localhost:8787**, set your login password on first visit,
   then go to **Settings** and add your provider API key (BYOK — stored
   encrypted at rest under `LEDE_MASTER_KEY`).

4. Tailor away.

To persist the secrets across shells, put them in a `.env` file next to
`docker-compose.yml` (compose loads it automatically) instead of `export`ing
them each time. Optional env vars: `PORT` (host port, default `8787`) and
`LEDE_AUTH_DISABLED=true` (skips the login gate — local/dev use only).

Stop the stack with `docker compose down`; add `-v` to also drop the data
volume.
