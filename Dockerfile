# syntax=docker/dockerfile:1
# Production image. See docs/platform/DEPLOY.md.
FROM node:22.23.1-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles with node-gyp when there is no prebuilt binary.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# `next build` opens the database (it imports src/db): a throwaway one, never the real one.
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_PATH=/tmp/build/companion.db
# The deploy scripts are compiled to plain JS: the run stage has no pnpm or tsx.
RUN pnpm build \
    && pnpm exec esbuild scripts/db-migrate.mts scripts/backup.mts --bundle --platform=node --format=esm --external:better-sqlite3 --outdir=scripts-dist --out-extension:.js=.mjs \
    && pnpm prune --prod

FROM node:22.23.1-bookworm-slim AS run
WORKDIR /app
# MIGRATE_ON_START=false: migrations are a deploy step with a backup first (deploy/deploy.sh).
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATABASE_PATH=/data/companion.db MIGRATE_ON_START=false
RUN useradd --system --uid 10001 app && mkdir /data && chown app /data
COPY --from=build --chown=app /app/package.json ./
COPY --from=build --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/.next ./.next
COPY --from=build --chown=app /app/public ./public
COPY --from=build --chown=app /app/drizzle ./drizzle
COPY --from=build --chown=app /app/scripts-dist ./scripts
COPY --from=build --chown=app /app/next.config.ts ./
# next.config.ts is loaded at runtime too: every local file it imports must be copied here.
COPY --from=build --chown=app /app/src/lib/csp.ts ./src/lib/csp.ts
USER app
VOLUME /data
EXPOSE 3737
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3737/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 0.0.0.0 inside the container: only Caddy reaches it (the compose network isn't published).
CMD ["node_modules/.bin/next", "start", "--port", "3737", "--hostname", "0.0.0.0"]
