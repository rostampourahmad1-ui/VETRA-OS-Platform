# VETRA-INFRA-01: Production Dockerfile for VETRA OS API Server
# Multi-stage build for minimal image size and security hardening.

# Stage 1: Build
FROM node:22-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace configuration and lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json tsconfig.base.json ./

# Copy library packages (needed for build)
COPY lib/db/package.json lib/db/tsconfig.json lib/db/
COPY lib/db/src lib/db/src/
COPY lib/api-zod/package.json lib/api-zod/tsconfig.json lib/api-zod/
COPY lib/api-zod/src lib/api-zod/src/

# Copy API server package
COPY artifacts/api-server/package.json artifacts/api-server/tsconfig.json artifacts/api-server/
COPY artifacts/api-server/build.mjs artifacts/api-server/
COPY artifacts/api-server/src artifacts/api-server/src/

# Install dependencies and build only the API workspace and its copied dependencies.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

# Stage 2: Production
FROM node:22-alpine

RUN addgroup -g 1001 -S vetra && adduser -u 1001 -S vetra -G vetra

WORKDIR /app

# Copy only production dependencies
COPY --from=builder /app/node_modules/.pnpm /app/node_modules/.pnpm
COPY --from=builder /app/node_modules /app/node_modules

# Copy built artifacts
COPY --from=builder /app/artifacts/api-server/dist /app/dist
COPY --from=builder /app/artifacts/api-server/package.json /app/package.json

# Copy workspace packages for runtime resolution
COPY --from=builder /app/lib/db/package.json /app/lib/db/package.json
COPY --from=builder /app/lib/api-zod/package.json /app/lib/api-zod/package.json

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

USER vetra

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
