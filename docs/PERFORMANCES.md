# NkapLingua : performances mesurées

Une réalisation **Shun&Co.** Toutes les mesures sont rejouables ; résultats bruts dans `apps/gateway/bench/results/`. Machine : Linux 4 vCPU, Node 22.23, pile Docker Compose (Mongo 7, Redis 7), novembre 2026.

| Mesure | Résultat | Script |
| --- | --- | --- |
| Traduction d'un écran de 40 clés (dictionnaires et couche studio) | 24 µs | `bench/lookup.mjs` |
| Appel bancaire après 6 s de lecture, aller-retour réseau de 50 ms | 52 ms (un seul aller-retour) | `bench/keepalive-lab.ts 50` |
| Idem, aller-retour réseau de 150 ms | 152 ms (un seul aller-retour) | `bench/keepalive-lab.ts 150` |
| Validation publiée puis phrase servie, sur le réseau Docker | 1,8 ms en médiane, 3,7 ms au 95e centile | `bench/publish.ts` |
| Chargement au démarrage (308 phrases validées, connexions comprises) | 240 ms | journal du gateway |
| Capacité d'un écran USSD contenant ɛ, ɔ ou ŋ | 182 septets | `packages/core/test/fold.test.ts` |
| Taille d'un clip vocal court (mp3 16 kHz mono) | 6,4 Ko | parcours de bout en bout |

## Tests

- 160 tests TypeScript (vitest) : contrat, deux tours, homonymes, correction, solde insuffisant, changement de langue, douze langues, sécurité, couche studio, pliage GSM-7.
- 4 tests Python (pytest) : synthèse, cache, refus des gabarits, transcodage.
- 11 tests de contrat sur la pile Docker : URL secrète, transfert en deux tours, frais, fulfulde, SMS, IVR, écrans, limite de débit.
- Parcours navigateur (Playwright, Chromium) sur la pile Docker : contribution texte et voix, validation, transcodage mp3, mise à jour à chaud, mp3 servi.
- Résilience : redémarrage du gateway (rechargement depuis Mongo) et Mongo coupé (repli sur Redis).
