FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
ENV CI=true
# Next.js hornea el destino del proxy /api en build. Railway pasa las variables de servicio como
# build args cuando se declaran con ARG; así la web queda apuntando a la API por red interna.
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=$API_PROXY_TARGET
COPY . .
RUN pnpm install --frozen-lockfile \
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
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000 || exit 1
CMD ["pnpm", "--filter", "@tgs/web", "start"]
