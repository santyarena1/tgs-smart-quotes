# syntax=docker/dockerfile:1
# Web: solo el grafo de @tgs/web (Next + contracts). Sin Playwright ni el resto del monorepo.

FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
ENV CI=true
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=$API_PROXY_TARGET

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/pdf/package.json packages/pdf/package.json
COPY packages/pricing/package.json packages/pricing/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/testing/package.json packages/testing/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json

RUN pnpm install --frozen-lockfile --filter @tgs/web...

COPY . .
RUN pnpm --filter @tgs/contracts build \
  && pnpm --filter @tgs/web build

FROM node:22-bookworm-slim
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app /app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=8 CMD wget -qO- http://127.0.0.1:3000 || exit 1
CMD ["pnpm", "--filter", "@tgs/web", "start"]
