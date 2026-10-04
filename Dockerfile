# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 - build the Vue frontend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 - runtime: Express backend that also serves the built SPA
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production

# ImageMagick derives the installable PWA icons from the user's favicon at
# container start (any format ImageMagick can read, e.g. PNG or WEBP).
# tzdata lets the container honour the TZ environment variable.
RUN apk add --no-cache imagemagick tzdata

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/ ./

# Built frontend is served as static files by the backend.
COPY --from=frontend-build /build/frontend/dist /app/public

# Default configuration + assets, so `docker run` works without any mounts.
COPY config.xml /app/config.xml
COPY assets /app/assets

ENV PORT=8080 \
    HOST=0.0.0.0 \
    CONFIG_PATH=/app/config.xml \
    DATA_DIR=/app/data \
    PUBLIC_DIR=/app/public \
    CHECK_INTERVAL_HOURS=24 \
    MIRROR_ON_START=true \
    TZ=Asia/Shanghai

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8080
CMD ["node", "src/index.js"]
