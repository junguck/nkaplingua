# NkapLingua

> Tout le monde devrait pouvoir parler le langage de l'argent.

Une réalisation **Shun&Co.** pour le SAFINUM Innovate Challenge 2026.

Couche linguistique entre la passerelle SAFINUM et la banque, pour les langues du Cameroun, sur six canaux (USSD, SMS, serveur vocal, mobile, web, GAB), avec un studio où les locuteurs proposent et valident les traductions à quatre yeux.

| Dossier | Contenu |
| --- | --- |
| `apps/gateway` | middleware SAFINUM : conversation, appels bancaires, traductions du studio à chaud, sécurité |
| `apps/studio` | studio linguistique (Next.js + shadcn) : contribution texte ou voix, relecture, publication |
| `apps/tts` | service voix (PyTorch MMS-VITS, ffmpeg) : synthèse des phrases fixes, conversion mp3 |
| `packages/core` | `@nkap/lingua-core` : pliage GSM-7, disposition Mongo/Redis partagée, schémas |
| `packages/nkap-*` | paquets du gateway (`@nkap/core`, `@nkap/contracts`, `@nkap/safinum`) |
| `infra/` | `docker-compose.yml`, Dockerfiles, `.env.example` |
| `docs/` | [architecture](docs/ARCHITECTURE.md), [studio web](docs/STUDIO.md), [performances](docs/PERFORMANCES.md), [modèle économique](docs/BUSINESS-MODEL.md), [document technique PDF](docs/latex/nkaplingua.pdf) |

## Lancer le produit (Docker)

```bash
cp infra/.env.example infra/.env     # SAFINUM_TEAM_KEY, HOOK_SECRET, STUDIO_SECRET, SEED_PASSWORD
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

- Gateway : `http://localhost:8080` ; URL à déclarer à la sandbox : `https://<tunnel>/hook/<HOOK_SECRET>`.
- Studio : `http://localhost:3000` (comptes `amina`, `joseph`, `admin`, mot de passe `SEED_PASSWORD`).
- MongoDB et Redis sont branchés automatiquement (`mongodb://mongo:27017`, `redis://redis:6379`).
- Sans clé SAFINUM, avec la banque simulée : ajouter `--profile demo` et, dans `infra/.env`,
  `SAFINUM_BANK_URL=http://demo-bank:8788/api/v1`, `BANK_ALLOWED_HOSTS=demo-bank`, `SAFINUM_TEAM_KEY=sbx_demo_local`.
- Service voix sans PyTorch (conversion mp3 seule) : `TTS_TORCH=0`.

## Brancher la sandbox SAFINUM

```bash
cloudflared tunnel --url http://localhost:8080
curl -X POST https://safinum.cm/api/v1/sandbox/endpoint -H "X-Team-Key: $SAFINUM_TEAM_KEY" \
  -H "Content-Type: application/json" -d "{\"channel\":\"ussd\",\"url\":\"https://<tunnel>/hook/$HOOK_SECRET\"}"
# idem pour sms, ivr, mobile, web, atm
```

## Développer

```bash
pnpm install
pnpm --filter @nkap/gateway build && node apps/gateway/dist/server.js   # lit apps/gateway/.env
pnpm --filter @nkap/studio dev
pnpm test                                    # 160 tests TypeScript
cd apps/tts && python -m pytest -q           # 4 tests Python
```
