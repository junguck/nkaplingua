# Kit officiel SAFINUM — copie de référence

Ce dossier est le **kit de démarrage Node.js** distribué avec la sandbox SAFINUM
(« Innovate Challenge 2026 »), téléchargé depuis la documentation et conservé **tel quel**.

- Aucune dépendance, Node.js 18+ : `node server.js` (port 8080).
- Il n'est **pas** compilé, testé ni démarré par le monorepo, et il n'écoute jamais en production.
- Il sert de référence pour le contrat (forme des payloads, `X-Trace-Id`, deux tours séparés,
  GSM-7, `max_chars`) et de point de comparaison pour notre middleware.

Le middleware réellement évalué est `apps/gateway/src/`, décrit dans
[`docs/GUIDE-SAFINUM.md`](../../../../docs/GUIDE-SAFINUM.md) §6, qui donne la correspondance
fichier par fichier (`server.js` → `src/server.ts`, `language.js` → `src/language.ts` + `src/i18n.ts`,
`translations/en.json` → `src/ui-dictionaries.ts`, etc.).

Les seuls écarts volontaires :

1. les dictionnaires `translations/dua.json`, `ewo.json`… ne sont pas créés ici : nous ne déclarons
   que les langues réellement servies (`fr`, `en`, `fub`), avec repli français déclaré ;
2. les canaux `ivr` et `atm` n'existent pas dans le kit : ils sont locaux, hors contrat
   (`apps/gateway/src/ivr.ts`, `apps/gateway/src/atm.ts`).

Ne pas modifier ces fichiers : toute correction se fait dans `apps/gateway/src/`.
