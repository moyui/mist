# Multi-stage build for Mist backend
# Stage 1: Builder - Compile TypeScript
FROM node:24-alpine AS builder
WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org
ARG PNPM_VERSION=11.7.0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy dependency files
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm config set registry ${NPM_REGISTRY} && \
    pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build:docker

# Stage 2: Production - Run with Node.js
FROM node:24-alpine

# Install curl for health checks and create non-root runtime user.
RUN apk add --no-cache \
    curl && \
    addgroup -S app && \
    adduser -S app -G app

WORKDIR /app

# Copy runtime dependencies and build output from builder stage.
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
# OTel SDK preload: must run before the webpack bundle loads http/express/pino
# (RITM skips already-cached modules), so every node entrypoint uses
# `node -r ./otel-preload.js ...`. See otel-preload.js header comment.
COPY --from=builder --chown=app:app /app/otel-preload.js ./otel-preload.js
COPY --from=builder --chown=app:app /app/test/fixtures/realtime ./test/fixtures/realtime
COPY --from=builder --chown=app:app /app/tools/run-migrations.mjs ./tools/run-migrations.mjs
COPY --from=builder --chown=app:app /app/deploy/database ./deploy/database

# Expose ports
# 8001: Main mist app
# 8008: Chan test entry
# 8010/9010: internal-only Signal HTTP/RPC listeners (Compose does not publish)
EXPOSE 8001 8008 8010 9010

# Health check - verify main app is responding
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8001/app/hello || exit 1

# Copy and prepare startup script.
COPY --chown=app:app docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER app
ENTRYPOINT ["./docker-entrypoint.sh"]
# otel-preload.js must be loaded before any business module (see header).
CMD ["node", "-r", "./otel-preload.js", "dist/apps/mist/main.js"]
