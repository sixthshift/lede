# ---- build: bun installs deps and builds the SPA (dist/) — build tool only ----
# better-sqlite3 has no prebuilt binary under Bun, so its install falls back to
# compiling from source (node-gyp); python3/make/g++ make that succeed. The
# resulting native binary is irrelevant here — this stage only produces dist/,
# and node_modules never leaves it (the runtime stage installs its own via npm
# under Node, per the frozen decision below).
FROM oven/bun:1-debian AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- runtime: NODE runs the server via tsx (locked amendment [v2-017] —
# better-sqlite3 ships a Node-ABI prebuilt that ERR_DLOPEN_FAILEDs under Bun's
# V8, so the runtime must be Node, never oven/bun). Prod deps are installed
# here with npm, under this same Node image, so the better-sqlite3 postinstall
# fetches/builds the prebuilt binary against this exact Node ABI — copying
# node_modules built by the bun build stage above would risk an ABI mismatch.
# tsx itself is a devDependency (see package.json), so it's added on top of
# the --omit=dev install rather than shipping the full dev toolchain (vite,
# vitest, tailwind, ...) into the image.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm install --no-save tsx
COPY tsconfig.json ./
COPY drizzle/ ./drizzle/
COPY src/server/ ./src/server/
COPY src/shared/ ./src/shared/
COPY --from=build /app/dist/ ./dist/

ENV DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8787
CMD ["npx", "tsx", "src/server/index.ts"]
