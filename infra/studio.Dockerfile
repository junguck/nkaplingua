# Studio linguistique NkapLingua (Next.js).
FROM node:22-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY infra/certs/ /tmp/certs/
RUN if ls /tmp/certs/*.crt >/dev/null 2>&1; then cat /tmp/certs/*.crt > /etc/ssl/extra-ca.pem; fi
RUN export NODE_EXTRA_CA_CERTS=$( [ -f /etc/ssl/extra-ca.pem ] && echo /etc/ssl/extra-ca.pem ); npm install -g pnpm@10.28.0 --no-audit --no-fund

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core ./packages/core
COPY apps/studio ./apps/studio
RUN export NODE_EXTRA_CA_CERTS=$( [ -f /etc/ssl/extra-ca.pem ] && echo /etc/ssl/extra-ca.pem ); \
    pnpm install --frozen-lockfile --filter @nkap/studio... \
 && pnpm --filter @nkap/studio build

WORKDIR /app/apps/studio
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
