# NkapLingua : performances mesurées

Une réalisation **Shun&Co.** Toutes les mesures sont rejouables ; résultats bruts dans `apps/middleware/bench/results/`. Machine : conteneur Linux 4 vCPU, Node 22.23, Redis 7, novembre 2026.

| Mesure | Résultat | Script |
| --- | --- | --- |
| Lecture des traductions d'un écran de 40 clés | 1,9 µs | `bench/lookup.ts` |
| Appel bancaire après 6 s de lecture, aller-retour réseau de 50 ms | 52 ms (un seul aller-retour) | `bench/keepalive-lab.ts 50` |
| Idem, aller-retour réseau de 150 ms | 152 ms (un seul aller-retour) | `bench/keepalive-lab.ts 150` |
| Validation dans le studio puis phrase servie | 1,2 ms en médiane, 2,7 ms au 95e centile | `bench/publish.ts` |
| Chargement du catalogue au démarrage (229 traductions) | 21 ms | journal de démarrage |
| Capacité d'un écran USSD contenant ɛ, ɔ ou ŋ | 182 septets | `packages/core/test/fold.test.ts` |
| Taille d'un clip vocal court (mp3 16 kHz mono) | 6,4 Ko | parcours de bout en bout |

## Tests

- 33 tests TypeScript (vitest) : contrat, deux tours, homonymes, correction, solde insuffisant, changement de langue, sécurité, écrans.
- 4 tests Python (pytest) : synthèse, cache, refus des gabarits, transcodage.
- Parcours navigateur (Playwright, Chromium) : contribution, refus de l'auteur en relecture, validation, mise à jour à chaud, mp3 servi.
