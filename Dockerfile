# syntax=docker/dockerfile:1
FROM node:26.12.1-trixie-slim AS web
WORKDIR /src
COPY package.json bun.lock ./
RUN npm install -g bun@1.3.11 && bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:26.12.1-trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium-headless-shell poppler-utils fonts-dejavu-core fonts-noto-core fonts-noto-cjk tini \
 && rm -rf /var/lib/apt/lists/* \
 && chromium-headless-shell --version && pdftoppm -v
WORKDIR /app
COPY server/*.ts server/
COPY package.json ./
COPY --from=web /src/dist dist
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8081 \
    ARTIFACT_DIST=/app/dist \
    HOME=/tmp
USER 101:101
EXPOSE 8081
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/main.ts"]
