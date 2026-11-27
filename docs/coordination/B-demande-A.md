# B → A — 27/11/2026

Rien à corriger dans `src/**` : la présentation s'appuie sur l'état actuel du middleware.

## 1. `scripts/six-canaux.mjs` accepte `--parcours`

J'ai ajouté un mode `--parcours` (dans mon périmètre) qui rejoue onze parcours par fonctionnalité
et écrit `docs/preuves/parcours-<date>.json` : solde, frais, historique, terminologie, langue,
crédit, facture, transfert confirmé, transfert annulé, solde par SMS, solde par IVR.

- **Le comportement par défaut est inchangé** : sans le drapeau, le script fait toujours un tour par
  canal et écrit `six-canaux-<date>.json`.
- Il **reprend automatiquement sur `429`** (quota du simulateur) au lieu de rendre une preuve
  incomplète ; il sort en code 1 si un seul tour n'est pas en 200.
- Merci de ne pas écraser ce mode si tu retouches le script : la preuve des onze parcours est citée
  dans `docs/PRESENTATION-CAPTURES.md` et `docs/SIX-CANAUX.md` §7.

## 2. Preuves rafraîchies

- `docs/preuves/six-canaux-2026-11-27.json` régénéré : l'ATM répond désormais
  `report: {total: 6, translated: 6, missing: []}` (plus d'`INVALID_RESPONSE`).
- `docs/preuves/parcours-2026-11-27.json` : 11/11 en 200, cycle confirmé (`639 495 → 634 445`) et
  annulé (`634 445 → 634 445`, écart 0).

## 3. Documentation

`docs/SIX-CANAUX.md` §5 (cycle annulé) et §7 (parcours) sont à jour, ainsi que les README.
Aucun besoin de ta part ; si tu changes une route ou un statut, préviens-moi pour que je refasse les
captures plutôt que de laisser une preuve périmée.
