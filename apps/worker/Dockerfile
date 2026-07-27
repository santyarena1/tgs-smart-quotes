FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @tgs/database generate \
  && pnpm --filter @tgs/contracts build \
  && pnpm --filter @tgs/config build \
  && pnpm --filter @tgs/worker build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["node", "apps/worker/dist/index.js"]
