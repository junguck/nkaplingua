# 4 · Note technique — NkapLingua v1.1.0

**Architecture · modalités d'intégration · dépendances · limites connues**
*SAFINUM Innovate Challenge 2026 — livrable du 13 novembre 2026*

---

## 1. En une phrase

NkapLingua est une **extension de navigateur (Manifest V3)** qui lit une interface financière **telle
qu'elle s'affiche**, en extrait des unités de sens, les traduit en langue camerounaise en **verrouillant
les valeurs sensibles**, et **superpose** le résultat à la page — **sans modifier le service cible** et
**sans envoyer aucune donnée**.

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│ NAVIGATEUR (Chrome / Edge / Brave — MV3)                                  │
│                                                                           │
│  ┌────────────────────┐   chrome.runtime   ┌───────────────────────────┐  │
│  │ Script de contenu  │◄──────────────────►│ Service worker            │  │
│  │ content.js         │                    │ background.js             │  │
│  │ · repère les unités│                    │ · menus contextuels       │  │
│  │ · MutationObserver │                    │ · notifications, alarms   │  │
│  │ · notes, fiche,    │                    │ · IA optionnelle (masquée)│  │
│  │   guide, bouclier  │                    │ · glossaire embarqué      │  │
│  └─────────┬──────────┘                    └───────────────────────────┘  │
│            │ import                                                        │
│  ┌─────────▼──────────┐   ┌──────────────────┐   ┌──────────────────────┐ │
│  │ lib/engine.js      │   │ glossary/        │   │ lib/ivr-engine.js    │ │
│  │ moteur pur :       │◄──│ bundle.js        │   │ parcours vocal,      │ │
│  │ verrouillage,      │   │ (129 concepts,   │   │ menus, notifications │ │
│  │ reconnaissance,    │   │  12 langues)     │   │ (répondeur)          │ │
│  │ classification,    │   └──────────────────┘   └──────────────────────┘ │
│  │ intégrité, arnaque │                                                     │
│  └────────────────────┘                                                     │
│                                                                             │
│  Pages d'extension : popup/ · options/ (Studio + Laboratoire + IA) ·         │
│  repondeur/ · studio/ (enregistrement et double validation)                 │
└───────────────────────────────────────────────────────────────────────────┘
```

**Séparation stricte** : les moteurs (`lib/engine.js`, `lib/ivr-engine.js`, `lib/fr.js`) sont **purs** —
aucun DOM, aucun `chrome.*` — donc testables en Node et réutilisables tels quels dans une application
mobile (feuille de route).

### 2.1 Chaîne de traitement d'une unité de sens

1. **Collecte** — `TreeWalker` sur les nœuds texte, regroupement des éléments *inline* en une « unité
   de sens » ; les zones `script/style/code/input/canvas/svg` et l'interface de l'extension sont exclues.
   `MutationObserver` pour les interfaces monopages et les montants recalculés en direct.
2. **Verrouillage** — extraction et remplacement des entités sensibles : `AMOUNT`, `PHONE`, `NAME`,
   `REF`, `PERCENT`, `DATE`, `NUM`, `IBAN/ACCOUNT`. Elles deviennent des jetons `⟦0⟧`, `⟦1⟧`…
3. **Reconnaissance** — correspondance avec les 129 concepts (576 formulations françaises et anglaises),
   par phrase puis par mot-clé ; sinon « contenu inédit » glosé.
4. **Classification** — `fraud`, `pin`, `error`, `warning`, `confirm`, `transfer`, `fees`, `success`,
   `balance`, `condition`, `info` + drapeaux négation / condition / arnaque (8 familles de signaux).
5. **Restauration contrôlée** — les jetons sont réinjectés ; `integrity` compare le nombre et la valeur
   des chiffres ; **un gabarit qui perd un chiffre est rejeté** et l'original est conservé.
6. **Rendu** — note en *shadow DOM* (aucun style du site ne fuit), fiche claire, guide, alerte, bulle de
   sélection ; sous-titre pour les boutons et les champs.

### 2.2 Composants et responsabilités

| Fichier | Rôle |
|---|---|
| `manifest.json` | MV3, `<all_urls>`, `all_frames`, permissions `storage, contextMenus, activeTab, notifications, alarms, tts, offscreen` |
| `content/content.js` | collecte DOM, rendu des notes, fiche claire, guide, bouclier, bulle, lecture |
| `lib/engine.js` | moteur de superposition (UMD `NkapEngine`) : verrouillage, reconnaissance, classification, intégrité, billets CEMAC, montants en lettres |
| `lib/ivr-engine.js` | moteur du répondeur : nœuds, menus ≤ 3 choix, saisies, effets (notification, rappel, écriture du solde) |
| `lib/prompts.js` | résolution d'une invite : texte affiché, texte dit, audio natif éventuel ; **politique de repli** |
| `lib/audio-store.js` | enregistrements des locuteurs (IndexedDB) + règle des **deux validateurs distincts** |
| `lib/speak.js` | lecture : enregistrement natif prioritaire, sinon synthèse **française** uniquement |
| `lib/store.js` | réglages (`chrome.storage.local/sync`, repli `localStorage`) |
| `background.js` | menus, notifications, alarmes, IA optionnelle (texte masqué) |
| `popup/` · `options/` · `repondeur/` · `studio/` | fenêtre, Studio + Laboratoire + IA, répondeur vocal, Studio voix |

## 3. Modalités d'intégration

### 3.1 Côté utilisateur (aucune compétence technique)

1. `chrome://extensions` → *Mode développeur* → **Charger l'extension non empaquetée** → dossier
   `extension/`.
2. Épingler l'icône **N**. Choisir la langue dans la fenêtre. Naviguer normalement.

Rien d'autre : pas de compte, pas de configuration réseau, pas de redémarrage.

### 3.2 Côté service financier (optionnel, et sans dépendance)

**Aucune intégration n'est nécessaire** : c'est tout l'intérêt. Si une institution veut une
reconnaissance parfaite, il lui suffit d'annoter ses pages :

```html
<p data-nkap-concept="ph.insufficient">Fonds insuffisants</p>
```

L'extension lit cet attribut en priorité. Aucune bibliothèque à installer, aucun appel réseau, aucun
impact sur le cœur transactionnel : **l'intégration est déclarative et réversible**.

### 3.3 Côté linguiste / association

Ouvrir le **Studio linguistique** (options), corriger, enregistrer la voix, valider à deux. Les
corrections sont stockées localement (`ovr:<langue>`) et peuvent être exportées puis fusionnées ; le
glossaire livré est reconstruit par `node tools/build-glossary.mjs`, qui **refuse** un gabarit dont les
emplacements diffèrent ou qui contient un chiffre en dur.

### 3.4 Réutilisation hors navigateur

`lib/engine.js` et `lib/ivr-engine.js` tournent en Node sans adaptation (`npm test` les exerce). Une
application Android pourrait les embarquer derrière un *Accessibility Service*.

## 4. Dépendances

| Dépendance | Usage | Nature |
|---|---|---|
| **Aucune** à l'exécution | — | zéro bibliothèque tierce, zéro CDN, zéro appel réseau |
| API WebExtensions (MV3) | stockage, menus, raccourcis, notifications, alarmes | plateforme navigateur |
| Web Speech API (`speechSynthesis`) | lecture à voix haute | plateforme ; **voix fournies par le système** |
| `MediaRecorder` | enregistrement des locuteurs | plateforme |
| **Police Onest** (SIL OFL 1.1) | typographie couvrant ɓ ɗ ŋ ƴ ɛ ɔ ǝ ʉ | composant tiers **embarqué** (`extension/fonts/`) |
| IA (option) | glose de contenus inédits | **désactivée par défaut**, clé fournie par l'utilisateur, texte **masqué** |
| Playwright + Node 22 | tests de bout en bout (développement uniquement) | dev |

## 5. Sécurité et vie privée

- **Aucune collecte, aucune télémétrie, aucun compte.** Tout tourne dans le navigateur.
- **Aucun envoi de montant, de nom ou de numéro** : si l'IA est activée, seuls des jetons `⟦0⟧` partent ;
  la réponse est rejetée si un jeton manque ou si un chiffre apparaît.
- **Intégrité** : comparaison des chiffres avant/après ; rejet du gabarit fautif ; le montant affiché est
  toujours celui de la page.
- **Isolation** : rendu en *shadow DOM*; aucun style injecté dans la page hôte ; aucun écouteur qui
  modifie le comportement du site.
- **Anti-arnaque** : les conseils de sécurité (« ne partagez jamais votre code PIN ») ne sont pas
  confondus avec des arnaques (testé).

## 6. Tests et preuves

```
npm test                       19/19  moteur : verrouillage (7 types), 6 formats de montants,
                                     phrases FR/EN × 5 langues, intégrité, rejet de gabarit corrompu,
                                     classification, arnaques vs conseils, billets CEMAC, total
node tests/ui-check.mjs        40/40  Chrome réel + extension chargée : fenêtre, répondeur
                                     (appel, clavier, solde, envoi débité, historique, notification,
                                     réinitialisation), Studio (recherche, filtre, vote),
                                     Laboratoire (5 étapes), Studio voix, superposition de notes
site réel                      HTTP 200 · 9 notes posées · fiche claire en fulfulde
safinum.cm/hackathon-test      250 000 FCFA affiché à l'identique · 0 erreur console
```

## 7. Limites connues

| Limite | Détail |
|---|---|
| **Voix** | Il n'existe **aucune synthèse vocale fulfulde/ewondo/duala** dans les navigateurs ni dans les systèmes. La voix native ne vient que des **enregistrements validés** du Studio ; sinon la lecture se fait en **français** (et, en mode démonstration seulement, une translittération approximative est lue par une voix française, toujours étiquetée « brouillon »). Les **montants** sont toujours lus correctement en français. |
| **Qualité linguistique** | Hors fulfulde attesté (44 entrées) et duala attesté (6), les traductions sont des **propositions de l'équipe** ; elles exigent la validation par deux locuteurs. Les tons ne sont pas notés. |
| **Couverture** | Ewondo, duala, basaa, ghomálá', gbaya sont des kits de démarrage : repli français facile visible. |
| **Heuristiques DOM** | La fiche claire associe libellé et valeur par proximité ; une interface très atypique (canvas, texte en image) ne sera pas lue. |
| **Noms de personnes** | Détectés par indices (« à », « bénéficiaire ») et majuscules ; un nom en minuscules sans indice n'est pas verrouillé comme NOM (mais n'est pas traduit non plus). |
| **Applications natives** | L'extension couvre le **web**. Les applications Android/iOS exigent un *Accessibility Service* (moteur réutilisable) — feuille de route. |
| **Navigateurs** | Chromium en pratique (Chrome, Edge, Brave, Opera, Vivaldi). Le manifeste porte la clé `browser_specific_settings` pour Firefox, mais `background.service_worker` et l'API `offscreen` sont spécifiques à Chromium. Chrome Android/iOS ne supporte pas les extensions. |
| **Périmètre** | Aucun mouvement d'argent réel : le répondeur est une **simulation** (aucun vrai code secret, aucun vrai compte). |

## 8. Feuille de route

- **Android** : même moteur dans un *Accessibility Service* + bulle flottante.
- **USSD / SMS** : passerelle qui reçoit les SMS de confirmation et renvoie une note vocale.
- **Voix** : corpus audio des 129 concepts avec l'Université de Yaoundé I et les données ALCAM, puis
  synthèse légère par langue.
- **Réseau de validateurs** : tableau de bord partagé, badges, priorisation des entrées critiques.
- **Nouvelles langues** : Bulu, Eton, Fe'efe'e, Medumba, Mungaka, Shupamem.

> La version longue de cette note (14 sections, protocole de validation détaillé, grille d'évaluation)
> est disponible dans le dépôt : `docs/NOTE_TECHNIQUE.md`.
