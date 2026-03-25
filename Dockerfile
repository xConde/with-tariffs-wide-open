# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=appuser:appgroup /app/dist/ ./dist/

RUN mkdir -p data && chown appuser:appgroup data

ENV NODE_ENV=production
ENV LOG_FORMAT=json
ENV NODE_OPTIONS="--max-old-space-size=512"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD [ -n "$(find heartbeat.txt -mmin -2 2>/dev/null)" ] || exit 1

USER appuser

CMD ["sh", "-c", "node dist/deploy-commands.js && node dist/index.js"]
