# Bun runs the TypeScript sources directly — there's no compile/bundle step, so a
# single stage is all we need. Install prod deps against the frozen lockfile, then
# copy the source.
FROM oven/bun:1-debian
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src/ ./src/
EXPOSE 3000
CMD ["bun", "run", "src/main.ts"]
