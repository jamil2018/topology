# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Imported at build time by the app module graph; not used to connect.
ENV DATABASE_URL=postgresql://topology:topology@127.0.0.1:5432/topology
ENV AUTH_SECRET=build-placeholder-not-for-production
ENV AUTH_URL=http://127.0.0.1:4317
ENV TOPOLOGY_ISSUE_PROVIDER=mock
RUN npm run build
RUN ./node_modules/.bin/esbuild src/db/migrate.ts \
  --bundle --platform=node --format=cjs --outfile=.next/standalone/migrate.cjs

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOST=0.0.0.0
ENV HOSTNAME=0.0.0.0
ENV PORT=4317
ENV ATTACHMENTS_DIR=/data/attachments

RUN mkdir -p /data/attachments \
  && chown -R node:node /data

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
  && chown node:node /app/docker-entrypoint.sh

USER node
EXPOSE 4317
ENTRYPOINT ["/app/docker-entrypoint.sh"]
