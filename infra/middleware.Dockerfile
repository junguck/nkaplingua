FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.legacy.json ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway
RUN pnpm install --frozen-lockfile --filter @nkap/gateway... && pnpm --filter @nkap/gateway build
WORKDIR /app/apps/gateway
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
