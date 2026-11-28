# NkapLingua

> Tout le monde devrait pouvoir parler le langage de l'argent.

Une réalisation **Shun&Co.** pour le SAFINUM Innovate Challenge 2026.

Couche linguistique entre la passerelle SAFINUM et la banque, pour les langues du Cameroun, sur six canaux (USSD, SMS, IVR, mobile, web, GAB), avec un studio où les locuteurs proposent et valident les traductions à quatre yeux.

| Dossier | Contenu |
| --- | --- |
| `packages/core` | contrat SAFINUM (zod), GSM-7 en septets, pliage des tons, disposition Mongo/Redis partagée |
| `apps/middleware` | Fastify : catalogue L1 en mémoire, pool bancaire chaud, conversation en deux tours, sécurité |
| `apps/studio` | Next.js 15 + shadcn : contribution texte ou voix, relecture, publication à chaud |
| `apps/tts` | PyTorch MMS-VITS + ffmpeg : synthèse des phrases fixes, transcodage mp3 pour l'IVR |
| `apps/gateway` | code antérieur conservé pour référence (hors workspace) |
| `docs/` | [architecture (Mermaid)](docs/ARCHITECTURE.md), [studio web](docs/STUDIO.md), [performances](docs/PERFORMANCES.md), [modèle économique](docs/BUSINESS-MODEL.md), [dossier PDF](docs/latex/nkaplingua.pdf) |

## Démarrer en local

```bash
pnpm install
docker run -d --name nkap-mongo -p 27017:27017 mongo:7
docker run -d --name nkap-redis -p 6379:6379 redis:7-alpine

node apps/middleware/src/tools/seed.ts                       # références, fr/en, lexique, comptes démo
node apps/middleware/src/tools/fake-bank.ts 8788 &           # banque simulée (sans clé)
SAFINUM_TEAM_KEY=sbx_local_demo_key SAFINUM_BANK_URL=http://127.0.0.1:8788/api/v1 \
BANK_ALLOWED_ORIGINS=http://127.0.0.1:8788 node apps/middleware/src/main.ts

STUDIO_SECRET=$(openssl rand -base64 48) pnpm --filter @nkap/studio dev    # http://localhost:3000
# comptes : amina (contributrice), joseph (relecteur), admin ; mot de passe : SEED_PASSWORD ou nkap-demo-2026
```

Node 22.18+ exécute le TypeScript directement (suppression des types) : aucune étape de build pour le middleware.

## Brancher la vraie sandbox

```bash
export SAFINUM_TEAM_KEY=sbx_...            # clé d'équipe, jamais commitée
export HOOK_SECRET=$(openssl rand -hex 24)
node apps/middleware/src/main.ts
cloudflared tunnel --url http://localhost:8080
curl -X POST https://safinum.cm/api/v1/sandbox/endpoint -H "X-Team-Key: $SAFINUM_TEAM_KEY" \
  -H "Content-Type: application/json" -d "{\"channel\":\"ussd\",\"url\":\"https://<tunnel>/hook/$HOOK_SECRET\"}"
# idem pour sms, ivr, mobile, web, atm
```

## Vérifier

```bash
pnpm test                                   # 33 tests TypeScript
cd apps/tts && python -m pytest -q          # 4 tests Python
node apps/middleware/bench/lookup.ts        # lecture du catalogue
node apps/middleware/bench/keepalive-lab.ts 150
```
