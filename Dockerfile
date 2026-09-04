FROM node:24-bookworm-slim AS base
RUN npm install --global npm@11.14.1

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
RUN apt-get update \
  && apt-get install -y --no-install-recommends ngspice ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
RUN npm ci --omit=dev
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["npm", "run", "start"]
