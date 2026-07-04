# lede

A self-hosted resume-tailoring tool. You keep a library of career **entries**
(experience, projects, education, skills, …); paste a job description; the model
**selects, orders, and re-frames** the relevant entries into a tailored resume —
judging from the facts you recorded, never inventing beyond them. One instance
per person, bring-your-own model key.

## Tech stack

- **Server:** Fastify 4 on Node ≥ 20 (TypeScript, ESM), run via `tsx`.
- **Storage:** single-file SQLite (`better-sqlite3`, WAL) + Drizzle (migrations on boot).
- **Model:** provider-agnostic via the Vercel AI SDK (`ai` + `@ai-sdk/anthropic|openai|google`,
  plus any OpenAI-compatible `baseURL`). Default `claude-opus-4-8`; picked per instance in Settings.
- **Client:** React 18 + Vite, shadcn/ui + Tailwind, TanStack Query, IBM Plex (self-hosted).
- **Auth / secrets:** single-password session gate (`@fastify/secure-session`); the
  provider key is stored **encrypted** (AES-256-GCM) under an operator-provided master key.

> The server always runs under **Node, never Bun** — `better-sqlite3` ships a
> Node-ABI native binary Bun can't load. Bun is fine as the package manager and
> for `check`/`build`/`test`.

## Development

The repo ships a dev container (`.devcontainer/`) with Bun, Node 22, the Docker
CLI, and the Claude Code CLI preinstalled. Open the folder in VS Code / Cursor and
**Reopen in Container** (the `postCreateCommand` runs `bun install`), or start it
directly:

```bash
docker compose -f .devcontainer/docker-compose.dev.yml up -d --build
docker compose -f .devcontainer/docker-compose.dev.yml exec dev bash
```

Inside the container, run the two dev processes (in separate shells):

```bash
bun run dev:api   # Fastify API on :8787
bun run dev:web   # Vite dev server on :6173, proxies /api → :8787
```

Open the Vite URL your editor forwards, and check the API with:

```bash
curl http://localhost:8787/api/health   # → {"ok":true}
```

## Scripts

| Command            | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `bun run dev:api`  | Fastify API in watch mode (`tsx watch`, port 8787)   |
| `bun run dev:web`  | Vite dev server on :6173 (proxies `/api` → :8787)    |
| `bun run build`    | Build the SPA to `dist/`                             |
| `bun run start`    | Run the server once (`tsx`) — serves the built SPA   |
| `bun run check`    | Type-check both tsconfigs (`tsc --noEmit`)           |
| `bun run test`     | Run the test suite (`vitest run`) — keyless          |
| `bun run lint`     | Lint + format check ([Biome](https://biomejs.dev))   |
| `bun run lint:fix` | Apply safe lint fixes + format                       |
| `bun run format`   | Format only                                          |

The full test suite and a complete demo run **without any model API key** — the
model call sits behind a swappable engine, and CI replays recorded decisions.
A key is needed only for live tailoring (BYOK) and the opt-in model-quality eval
(`scripts/eval.ts`).

Biome is enforced at commit time: `bun install` runs `prepare`, which points
`core.hooksPath` at `.githooks/`, and the `pre-commit` hook blocks any commit
whose staged files have lint or format issues. Run `bun run lint:fix` to clear them.

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

> **Keep `LEDE_MASTER_KEY` safe and backed up.** It encrypts your stored provider
> key; lose it or change it and the stored key can no longer be decrypted (there
> is no rotation path today) — you'll need to re-enter the provider key.

Stop the stack with `docker compose down`; add `-v` to also drop the data
volume.
