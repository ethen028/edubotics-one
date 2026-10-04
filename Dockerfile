# Edubotics One: one image with the app, its database migrations and the seed script.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The build needs a database URL and secret to be set, not reachable.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" SESSION_SECRET="build-time-placeholder-not-used-at-runtime" npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "docker/start.sh"]
