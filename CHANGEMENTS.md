# Journal des changements

Toutes les modifications livrées sont consignées ici. Le projet suit le
versionnement sémantique (`MAJEURE.MINEURE.CORRECTIF`).

## 1.2.0 — 2026-09-10

- Ajout d’un lien direct stable pour chaque écran à l’aide des fragments
  `#dashboard`, `#students`, `#fees`, `#collections`, `#staff`, `#expenses`,
  `#exams`, `#reports` et `#settings`.
- Conservation de l’écran demandé pendant la connexion et lors du rechargement.
- Prise en charge des boutons précédent et suivant du navigateur.
- Redirection des fragments inconnus vers le tableau de bord.
- Documentation de tous les liens locaux dans `README.md`.

## 1.1.1 — 2026-09-10

- Ajout d’un bouton permettant de choisir les colonnes visibles dans le tableau
  des créances des élèves.
- Mémorisation du choix des colonnes sur l’appareil et commande pour les afficher
  toutes en un clic.
- Maintien permanent des colonnes essentielles « Élève » et « Actions ».

## 1.1.0 — 2026-09-10

- Amélioration de l’ergonomie du tableau des créances des élèves : filtres
  rapides, compteurs, remise à zéro, résumé des filtres et totaux plus lisibles.
- Maintien du nom de l’élève et des actions pendant le défilement horizontal du
  tableau, avec une meilleure présentation sur mobile.
- Affichage permanent de la version de l’application dans le pied de page.
- Centralisation de la version Electron et serveur à partir de `package.json`.
- Ajout des règles de versionnement et de documentation dans `AGENTS.md`.
