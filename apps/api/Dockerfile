FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @tgs/database generate \
  && pnpm --filter @tgs/database build \
  && pnpm --filter @tgs/contracts build \
  && pnpm --filter @tgs/config build \
  && pnpm --filter @tgs/storage build \
  && pnpm --filter @tgs/providers build \
  && pnpm --filter @tgs/pricing build \
  && pnpm --filter @tgs/validation build \
  && pnpm --filter @tgs/pdf build \
  && pnpm --filter @tgs/ai build \
  && pnpm --filter @tgs/api build \
  && pnpm --filter @tgs/extension build \
  && pnpm --filter @tgs/extension zip

FROM node:22-bookworm-slim
# Dependencias de sistema para Chromium (Playwright) usadas por @tgs/pdf
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
ENV NODE_ENV=production
# PDFs y uploads (logo de empresa, imágenes de reglas del chatbot) viven bajo /data.
# En Railway hay que montar un Volume en /data para que sobrevivan a los redeploys;
# sin volumen el filesystem es efímero y los archivos subidos se pierden al reiniciar.
ENV PDF_LOCAL_DIR=/data/pdfs
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/pdfs /data/uploads \
  && cd /app/packages/pdf \
  && npx playwright install chromium
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
# Migra + siembra datos base (admin, singletons de configuración) y arranca. El seed es idempotente
# (upserts): crea lo que falte sin pisar ediciones del usuario; el admin toma ADMIN_USERNAME/ADMIN_PASSWORD.
CMD ["sh", "-c", "pnpm --filter @tgs/database migrate && pnpm --filter @tgs/database seed && node apps/api/dist/main.js"]
