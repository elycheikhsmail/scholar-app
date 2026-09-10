# Journal des changements

Toutes les modifications livrées sont consignées ici. Le projet suit le
versionnement sémantique (`MAJEURE.MINEURE.CORRECTIF`).

## 1.2.4 — 2026-09-10

- Remplacement du bouton textuel d’ouverture de l’استمارة رسوم الطالب par une
  icône `+` compacte dans le tableau des frais.
- Ajout d’une infobulle et d’un libellé accessible indiquant que l’icône ouvre
  l’استمارة رسوم الطالب sélectionné.

## 1.2.3 — 2026-09-10

- Suppression de la colonne « دفعة جديدة » du tableau des frais.
- Suppression de la saisie et du bouton « حفظ وطباعة » associés à cette colonne.
- Les paiements restent disponibles dans l’استمارة رسوم الطالب المنبثقة، avec le
  choix du type de frais, du montant et de la date.

## 1.2.2 — 2026-09-10

- Ouverture de l’استمارة رسوم الطالب dans une fenêtre modale depuis les boutons
  « تم دفع الرسوم » et « استمارة الرسوم » du tableau des frais.
- Ajout d’un en-tête fixe avec l’identité de l’élève et un bouton de fermeture.
- Fermeture possible avec `Esc` ou en cliquant à l’extérieur de la fenêtre.
- Conservation du كشف الحساب comme seconde fenêtre latérale accessible depuis
  l’استمارة.
- Adaptation de l’استمارة aux écrans mobiles.

## 1.2.1 — 2026-09-10

- Affichage du « كشف الحساب » depuis le tableau des frais dans une grande fenêtre
  latérale, sans déplacer l’utilisateur en haut de la page.
- Ajout du nom et des références de l’élève dans l’en-tête fixe de la fenêtre.
- Ajout d’un bouton de fermeture, de la fermeture par `Esc` et de la fermeture en
  cliquant à l’extérieur.
- Adaptation de la fenêtre aux écrans mobiles avec un défilement indépendant.

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
