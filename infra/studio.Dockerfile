FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/studio ./apps/studio
RUN pnpm install --frozen-lockfile --filter @nkap/studio... && pnpm --filter @nkap/studio build
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@nkap/studio", "start", "-p", "3000"]
