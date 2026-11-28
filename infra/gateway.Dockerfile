# Gateway NkapLingua : middleware SAFINUM + synchronisation du studio + outil d'amorçage.
FROM node:22-alpine
WORKDIR /app

# Certificats supplémentaires facultatifs (proxy d'entreprise au moment du build). Vide par défaut.
COPY infra/certs/ /tmp/certs/
RUN if ls /tmp/certs/*.crt >/dev/null 2>&1; then cat /tmp/certs/*.crt > /etc/ssl/extra-ca.pem; fi
RUN export NODE_EXTRA_CA_CERTS=$( [ -f /etc/ssl/extra-ca.pem ] && echo /etc/ssl/extra-ca.pem ); npm install -g pnpm@10.28.0 --no-audit --no-fund

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.legacy.json ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway
RUN export NODE_EXTRA_CA_CERTS=$( [ -f /etc/ssl/extra-ca.pem ] && echo /etc/ssl/extra-ca.pem ); \
    pnpm install --frozen-lockfile --filter @nkap/gateway... \
 && pnpm --filter @nkap/gateway build \
 && chown -R node:node /app/apps/gateway

WORKDIR /app/apps/gateway
USER node
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "dist/server.js"]
