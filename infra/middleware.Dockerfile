FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/middleware ./apps/middleware
RUN pnpm install --frozen-lockfile --filter @nkap/middleware...
USER node
EXPOSE 8080
CMD ["node", "apps/middleware/src/main.ts"]
