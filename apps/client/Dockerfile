FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/package.json

RUN pnpm install --filter client... --no-frozen-lockfile

COPY apps/client ./apps/client

RUN pnpm --filter client build

WORKDIR /app/apps/client

EXPOSE 4173

CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "4173"]
