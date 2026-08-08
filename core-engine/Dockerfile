# Single Dockerfile for both apps — pass --build-arg APP=api|worker.
# They share one source tree and one dependency install; only the entrypoint
# differs. See core-engine/CLAUDE.md.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# --- dependencies (cached on lockfile changes only) ---------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- build --------------------------------------------------------------------
FROM base AS build
ARG APP=api
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec nest build ${APP}

# --- production dependencies --------------------------------------------------
FROM base AS proddeps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# --- runtime ------------------------------------------------------------------
FROM base AS runtime
ARG APP=api
ENV NODE_ENV=production
# ARG is not available at runtime, so bake the entrypoint into an ENV.
ENV APP_ENTRY=dist/apps/${APP}/src/main.js

COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
CMD ["sh", "-c", "node $APP_ENTRY"]
