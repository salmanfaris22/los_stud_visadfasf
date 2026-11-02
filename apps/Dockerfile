# Builds one Next.js app from the monorepo: --build-arg APP=admin|student
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP
COPY . .
RUN pnpm install --frozen-lockfile=false
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @lms/${APP} build

FROM node:22-alpine AS run
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/${APP}/.next/standalone ./
COPY --from=build /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
ENV APP_DIR=apps/${APP}
EXPOSE 3000
CMD ["sh", "-c", "node ${APP_DIR}/server.js"]
