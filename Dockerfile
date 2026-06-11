# Trainer Arena — production images (api + web SSR) built from one context.
# Build:  docker compose -f docker-compose.prod.yml build
# NOTE: validated on linux/amd64 glibc (node:22-bookworm-slim); bcrypt and
# Prisma ship prebuilt binaries for that target.

# ---------- build ----------
FROM node:22-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm prisma generate \
  && pnpm nx build api --configuration=production \
  && pnpm nx build web --configuration=production

# ---------- api runtime ----------
# dist/apps/api contains a generated package.json/pnpm-lock.yaml with the
# exact runtime dependencies; the bundle (main.js) externalises them.
FROM node:22-bookworm-slim AS api
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/apps/api ./
COPY apps/api/prisma ./prisma
RUN pnpm install --prod --frozen-lockfile \
  && pnpm prisma generate --schema prisma/schema.prisma
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
# Apply pending migrations, then start (API + BullMQ workers in one process).
CMD ["sh", "-c", "pnpm prisma migrate deploy --schema prisma/schema.prisma && node main.js"]

# ---------- web SSR runtime ----------
# The Angular SSR bundle is self-contained (esbuild); no node_modules needed.
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY --from=build /app/dist/apps/web ./
EXPOSE 4000
CMD ["node", "server/server.mjs"]
