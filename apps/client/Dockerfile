FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/client/package.json apps/client/package.json

RUN pnpm install --frozen-lockfile

COPY apps/client ./apps/client

WORKDIR /app/apps/client
RUN pnpm exec vite build

EXPOSE 4173

CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "4173"]
