# ──────────────────────────────────────────────────────────────
#  HanSYS Video Studio — Production Dockerfile
#  Multi-stage: base → deps → builder → runner
# ──────────────────────────────────────────────────────────────

# ── Stage 1: base ────────────────────────────────────────────
# Slim Debian with Node.js 22 LTS – used by both build and run stages.
# Debian (not Alpine) because Chromium/Remotion needs glibc.
FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app

# ── Stage 2: deps ────────────────────────────────────────────
# Install ALL dependencies (including devDependencies for build).
FROM base AS deps

# Copy only the files pnpm needs for dependency resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json        apps/web/package.json
COPY apps/worker/package.json     apps/worker/package.json
COPY packages/database/package.json      packages/database/package.json
COPY packages/project-schema/package.json packages/project-schema/package.json
COPY packages/shared/package.json        packages/shared/package.json
COPY packages/storage/package.json       packages/storage/package.json
COPY packages/template-registry/package.json packages/template-registry/package.json
COPY packages/ui/package.json            packages/ui/package.json
COPY packages/video/package.json         packages/video/package.json

RUN pnpm install --frozen-lockfile

# ── Stage 3: builder ────────────────────────────────────────
# Build Next.js standalone, generate Prisma client, prepare video package.
FROM deps AS builder

# Copy remaining source
COPY . .

# Generate Prisma client
RUN pnpm --filter @hansys/database prisma:generate

# Build all packages via Turborepo (Next.js standalone output, etc.)
RUN pnpm turbo run build

# ── Stage 4: runner ──────────────────────────────────────────
# Minimal production image.
FROM node:22-slim AS runner

LABEL org.opencontainers.image.title="HanSYS Video Studio"
LABEL org.opencontainers.image.description="Local-first scene-based video creation and rendering tool"
LABEL org.opencontainers.image.source="https://github.com/NguyenHan166/remotion-tool-create-video"

# ── System dependencies ─────────────────────────────────────
# tini        – PID 1 init for proper signal forwarding
# ffmpeg      – media encoding and metadata extraction
# fonts-*     – Vietnamese and CJK text rendering
# Chromium deps – headless browser for Remotion renderer
RUN apt-get update && apt-get install -y --no-install-recommends \
      tini \
      ffmpeg \
      fonts-noto-cjk \
      fonts-noto-core \
      # Chromium shared library dependencies required by Remotion
      libnss3 \
      libatk1.0-0t64 \
      libatk-bridge2.0-0t64 \
      libcups2t64 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libgbm1 \
      libasound2t64 \
      libpango-1.0-0 \
      libcairo2 \
      libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# ── pnpm ─────────────────────────────────────────────────────
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# ── Non-root user ────────────────────────────────────────────
RUN groupadd --gid 1001 hansys \
    && useradd --uid 1001 --gid hansys --shell /bin/sh --create-home hansys

# ── Writable data directory ──────────────────────────────────
RUN mkdir -p /data/assets /data/renders /data/thumbnails /data/bundles /data/temp /data/logs \
    && chown -R hansys:hansys /data

WORKDIR /app

# ── Copy built artifacts from builder ────────────────────────
# Root workspace files
COPY --from=builder --chown=hansys:hansys /app/package.json          ./package.json
COPY --from=builder --chown=hansys:hansys /app/pnpm-lock.yaml        ./pnpm-lock.yaml
COPY --from=builder --chown=hansys:hansys /app/pnpm-workspace.yaml   ./pnpm-workspace.yaml
COPY --from=builder --chown=hansys:hansys /app/turbo.json            ./turbo.json

# Next.js standalone output (includes server.js and required node_modules)
COPY --from=builder --chown=hansys:hansys /app/apps/web/.next/standalone ./
COPY --from=builder --chown=hansys:hansys /app/apps/web/.next/static    ./apps/web/.next/static
COPY --from=builder --chown=hansys:hansys /app/apps/web/public          ./apps/web/public

# Worker source and its dependencies (tsx runs TypeScript directly)
COPY --from=builder --chown=hansys:hansys /app/apps/worker              ./apps/worker

# Internal packages (source + generated Prisma client)
COPY --from=builder --chown=hansys:hansys /app/packages                 ./packages

# node_modules (workspace hoisted + package-level)
COPY --from=builder --chown=hansys:hansys /app/node_modules             ./node_modules

# ── Environment defaults ─────────────────────────────────────
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV NEXT_TELEMETRY_DISABLED=1

# ── Switch to non-root ───────────────────────────────────────
USER hansys

EXPOSE 3000

# ── Entrypoint ───────────────────────────────────────────────
# tini ensures proper signal forwarding and zombie reaping.
# The actual command (web start vs worker start) is provided via
# docker-compose command override or docker run arguments.
ENTRYPOINT ["tini", "--"]

# Default: start the web server
CMD ["node", "apps/web/server.js"]
