# syntax=docker/dockerfile:1
# API: pnpm solo del grafo de @tgs/api, Chromium cacheado con el lockfile.
# Un cambio de código no vuelve a bajar node_modules ni el browser.

FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
ENV CI=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

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

RUN pnpm install --frozen-lockfile --filter @tgs/api...

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
  && rm -rf /var/lib/apt/lists/* \
  && pnpm --filter @tgs/pdf exec playwright install chromium

COPY . .
RUN pnpm --filter @tgs/database generate \
  && pnpm --filter @tgs/database build \
  && pnpm --filter @tgs/contracts build \
  && pnpm --filter @tgs/config build \
  && pnpm --filter @tgs/storage build \
  && pnpm --filter @tgs/providers build \
  && pnpm --filter @tgs/pricing build \
  && pnpm --filter @tgs/validation build \
  && pnpm --filter @tgs/pdf build \
  && pnpm --filter @tgs/ai build \
  && pnpm --filter @tgs/api build

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
COPY --from=build /ms-playwright /ms-playwright
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PDF_LOCAL_DIR=/data/pdfs
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/pdfs /data/uploads
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=8 CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["sh", "-c", "pnpm --filter @tgs/database migrate:start && pnpm --filter @tgs/database seed && node apps/api/dist/main.js"]
