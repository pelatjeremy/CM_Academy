FROM node:24-trixie-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
COPY shared /app/shared
RUN npm run build

FROM node:24-trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend ./
COPY shared /app/shared
RUN node node_modules/prisma/build/index.js generate --config prisma.build.config.ts
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
RUN mkdir -p /data/private && chown -R node:node /data
USER node
ENV NODE_ENV=production SERVE_FRONTEND=true VIDEO_FFPROBE_PATH=/usr/bin/ffprobe
EXPOSE 3001
CMD ["node","server.js"]
