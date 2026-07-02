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

## Production

The root `Dockerfile` builds a minimal single-stage image:

```bash
docker build -t lede .
docker run -p 3000:3000 lede
```
