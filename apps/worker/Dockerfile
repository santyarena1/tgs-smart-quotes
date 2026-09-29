# syntax=docker/dockerfile:1
# Worker: solo su grafo de paquetes. Sin Next, sin Chromium, sin extensión.

FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
ENV CI=true

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

RUN pnpm install --frozen-lockfile --filter @tgs/worker...

COPY . .
RUN pnpm --filter @tgs/database generate \
  && pnpm --filter @tgs/database build \
  && pnpm --filter @tgs/contracts build \
  && pnpm --filter @tgs/config build \
  && pnpm --filter @tgs/storage build \
  && pnpm --filter @tgs/providers build \
  && pnpm --filter @tgs/worker build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["node", "apps/worker/dist/index.js"]
