# syntax=docker/dockerfile:1

# --- deps ------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# npm ci needs a lockfile; fall back to install so the image builds either way.
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# --- runtime ---------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

# dumb-init reaps zombies and forwards SIGTERM so graceful shutdown works.
RUN apk add --no-cache dumb-init curl

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# Run unprivileged; the node image already ships a `node` user.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
