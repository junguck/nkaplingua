# Mesures vérifiées

Toutes rejouables. Résultats bruts dans `apps/middleware/bench/results/`. Machine : conteneur Linux 4 vCPU, Node 22.23, Redis 7 local, 27/11/2026.

| # | Mesure | Avant | Après (v3) | Gain | Script |
| --- | --- | --- | --- | --- | --- |
| 1 | Lecture des traductions, écran de 40 clés | kit : 22,9 µs ; Redis HGET par clé : 1 865 µs | L1 mémoire : 1,9 µs | 12 fois le kit, 990 fois Redis naïf | `bench/lookup.ts` |
| 2 | Appel bancaire après 6 s de lecture, RTT 50 ms | 107 ms | 52 ms | 55 ms par appel | `bench/keepalive-lab.ts 50` |
| 3 | Idem, RTT 150 ms | 307 ms | 152 ms | 155 ms par appel | `bench/keepalive-lab.ts 150` |
| 4 | Validation studio vers phrase servie | redémarrage | p50 1,2 ms, p95 2,7 ms | à chaud | `bench/publish.ts` |
| 5 | Chargement du catalogue au démarrage (229 traductions) | | 21 ms | | journal de `main.ts` |
| 6 | Capacité d'un écran USSD avec ɛ, ɔ, ŋ | 70 caractères (UCS-2) | 182 septets | 2,6 fois | test `fold.test.ts` |
| 7 | Vol de la clé par `bank_api.base_url` forgé | kit : clé reçue par l'attaquant | v3 : rien reçu | faille fermée | `bench/exfil-demo.ts` |

## Ce qui n'est PAS un gain (transparence)

- **Surcoût par tour.** En local, sans réseau, la v3 met 1,49 ms (p50) contre 1,17 ms pour le kit : +0,3 ms de validation zod, session Redis et limite de débit. C'est le prix de la sécurité et du multi-instance, soit 0,01 % du budget USSD de 3 s. (`bench/turn.ts`)
- **Keep-alive depuis notre conteneur.** Contre la vraie sandbox, le proxy du conteneur termine le TLS et mutualise ses connexions : kit, pool chaud et connexion neuve donnent tous environ 245 ms (`bench/network.ts`). Le gain n'apparaît que sur un hébergement sans proxy TLS, d'où le labo à latence injectée (lignes 2 et 3).
- **Lignes 2 et 3, borne basse.** Le relais du labo ne retarde pas la poignée TCP. En réel, une connexion froide coûte aussi ce RTT : le gain réel est d'environ 2 RTT par appel.

## Tests

- 33 tests TypeScript (vitest) : contrat, deux tours, homonymes, correction, solde insuffisant, bascule de langue, sécurité, écrans.
- 4 tests Python (pytest) : synthèse, cache, refus des gabarits, transcodage.
- Parcours navigateur (Playwright, Chromium) : contribution, refus de l'auteur en relecture, validation, mise à jour à chaud, mp3 servi.
