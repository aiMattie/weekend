# Production image: next build + next start. SQLite lives in /app/data (mount a volume there).
FROM node:22-alpine AS base
WORKDIR /app
# better-sqlite3 ships prebuilt binaries for alpine (musl); the toolchain is only the fallback when no prebuild matches
RUN apk add --no-cache libc6-compat python3 make g++

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATABASE_URL=file:data/app.db
COPY --from=build /app ./
RUN mkdir -p data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
# the app migrates the database on first use; create the admin account once with: docker exec -it weekend npm run setup
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
