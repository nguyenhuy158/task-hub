FROM node:26.7.0-bookworm-slim AS base
RUN npm install --global pnpm@11.25.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY web ./web
COPY openapi.yaml vite.config.ts ./
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4180 TASK_HUB_DB=/app/data/task-hub.sqlite
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile && mkdir /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 4180
CMD ["node", "dist/server.js"]
