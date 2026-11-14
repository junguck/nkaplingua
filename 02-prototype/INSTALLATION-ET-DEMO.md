# 2 · Prototype fonctionnel — installation et démonstration reproductible

**Archive** : `nkaplingua-extension-v1.1.0.zip` (dans ce dossier)
**Contenu** : `extension/` (l'extension complète), `demo/` (interface financière simulée),
`tests/` (tests unitaires et de bout en bout), `tools/`, `docs/`, `README.md`, `package.json`.

---

## A. Installer l'extension (2 minutes, aucun compte, aucune connexion)

1. Décompresser l'archive.
2. Ouvrir **`chrome://extensions`** (ou `edge://extensions`, `brave://extensions`).
3. Activer le **Mode développeur** (en haut à droite).
4. Cliquer **Charger l'extension non empaquetée** et choisir le dossier **`extension/`**.
5. Épingler l'icône **N** dans la barre d'outils.

> Chromium requis (Chrome, Edge, Brave, Opera, Vivaldi). Les extensions ne sont pas supportées par
> Chrome Android/iOS.

## B. Vérifier en 60 secondes sur le site de test du hackathon

1. Aller sur **`https://safinum.cm/hackathon-test`**.
2. Une pastille **N · Fulfulde** apparaît en bas à gauche ; les phrases financières reçoivent une note
   colorée en fulfulde.
3. Cliquer l'icône de **fiche claire** dans la pastille : le solde apparaît en fulfulde avec le
   décompte en billets, et **le montant est identique à celui de la page** (`250 000 FCFA`).
4. Cliquer l'icône **pause** : toutes les notes disparaissent ; recliquer pour revenir.
5. Double-cliquer une note : l'original français s'affiche.

**Attendu** : aucune erreur, aucun montant modifié.

## C. Parcours complet sur la démo locale (5 minutes)

```bash
cd demo && python3 -m http.server 8765
# puis ouvrir http://localhost:8765
```

1. **Accueil** — solde traduit, montant intact.
2. **Consulter les frais** — glose des frais, fiche claire automatique.
3. **Envoyer de l'argent** — sous-titres sur les champs, guide pas à pas.
4. **Continuer** — récapitulatif : montant, bénéficiaire, numéro, total ; contrôle
   `montant + frais = total`.
5. Dans la **console du jury**, cocher « total faux » → la fiche claire passe en **rouge** et signale
   l'écart.
6. Cliquer **SMS d'arnaque** → alerte 🚨 « MUSIIBA : ɗum ina nanndi e jamfa ! » (ceci ressemble à une
   arnaque).
7. **Injecter** un message inédit → glose structurée, condition/interdiction détectées, montant
   verrouillé.
8. Changer de langue et de mode dans la fenêtre **N** (bilingue / immersif / survol).

## D. Répondeur vocal (3 minutes)

1. Icône **N** → **Répondeur vocal** (ou clic droit → *ouvrir le répondeur*).
2. **Appeler** → menu d'accueil ; taper `1` (français facile), `1` (argent), `3` (solde) : le solde est
   annoncé.
3. `#` (retour), `1` (envoyer), `1` (envoyer de l'argent), taper `690000001`, `#`, taper `1000`, `#`,
   puis `1` pour confirmer : **le solde passe de 50 000 à 49 000 FCFA** et l'opération apparaît dans
   l'historique.
4. **Tester une notification** : la notification arrive même si l'onglet du répondeur est fermé
   (autoriser les notifications pour Chrome au niveau du système).
5. **Réinitialiser la démo** : retour à 50 000 FCFA.

## E. Studio linguistique et Laboratoire (3 minutes)

- Icône **N** → **Studio linguistique** :
  - filtre « critiques » (20 entrées), recherche (« solde » → 5 résultats) ;
  - saisir un nom de validateur, cliquer **Valider** : la ligne affiche « 1 validation : *votre nom* » ;
  - un **second** nom est nécessaire pour passer l'entrée en « validé » (règle des deux locuteurs).
- Onglet **Laboratoire** : coller « Ne partagez jamais votre code PIN avec personne. » → les 5 étapes
  s'affichent (verrouillage, reconnaissance, classification, intégrité, résultat).
- Coller un faux gain avec code PIN → **Arnaque : OUI**, avec les motifs.
- Onglet **Répondeur** → **Studio voix** : enregistrer une phrase (micro), puis la faire valider par un
  autre nom.

## F. Relancer les tests (preuve reproductible)

```bash
npm test                  # 19/19 tests du moteur
npm i -D playwright       # si absent
node tests/ui-check.mjs   # 40/40 vérifications dans Chrome réel (extension chargée)
```

Résultats attendus à la livraison :

```
npm test                → # pass 19   # fail 0
node tests/ui-check.mjs → RÉSULTAT : 40/40 vérifications OK · 0 problème(s) console/réseau
```

> `tests/ui-check.mjs` lance Chromium via Playwright avec `--load-extension` : l'extension est
> réellement chargée, pas simulée.

## G. Dépannage

| Symptôme | Cause / solution |
|---|---|
| Aucune note, aucune pastille | Le site est dans la liste des sites désactivés, ou l'extension est en pause (`Alt+Shift+N`) |
| Pas de son | Aucune voix française installée : Windows → *Heure et langue → Voix → Ajouter* ; macOS → *Accessibilité → Contenu énoncé* |
| Notification invisible | Autoriser Google Chrome dans les notifications du système, désactiver « Ne pas déranger » |
| Le raccourci du répondeur manque | `chrome://extensions/shortcuts` (Chrome limite à 4 raccourcis) |
| `--load-extension` ignoré | Utiliser Chromium/Chrome for Testing ou un profil neuf en mode développeur |
