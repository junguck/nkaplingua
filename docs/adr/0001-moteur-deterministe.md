# ADR 0001 — Moteur de compréhension déterministe, LLM optionnel

**Statut** : accepté (J0) · **Décideurs** : Shane + pair

## Contexte
Le jury tire des scénarios au hasard (§7) et compare les résultats entre canaux (§8). Le réseau du salon
est incertain. Les données sont financières.

## Décision
Classifieur à indices pondérés + extraction d'entités par règles, dans un paquet TypeScript pur.
Un LLM pourra traiter les énoncés non reconnus, derrière la même interface, sur texte masqué.

## Conséquences
+ Reproductible, < 5 ms, hors ligne, explicable (indices listés dans la trace), embarquable sur mobile.
− Couverture limitée au lexique : chaque nouvelle formulation s'ajoute à la main (avec un locuteur).
− Ne généralise pas aux paraphrases lointaines → mesurer sur un corpus d'énoncés réels dès J1.
