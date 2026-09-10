# Journal des changements

Toutes les modifications livrées sont consignées ici. Le projet suit le
versionnement sémantique (`MAJEURE.MINEURE.CORRECTIF`).

## 1.6.1 — 2026-09-10

- Refactorisation : `public/reports.js` était écrit en style compacté (27 lignes,
  jusqu'à 755 caractères par ligne). Le fichier est réécrit en forme lisible, sans
  changement de comportement.
- Les six totalisations `reduce` identiques passent par un seul `sumAmount`.
- Les modèles de lignes de tableau sont éclatés en une balise `<td>` par ligne.

## 1.6.0 — 2026-09-10

- Les champs de date se saisissent désormais dans l'ordre utilisé par l'école :
  اليوم puis الشهر puis السنة, au lieu de l'ordre imposé par la locale du
  navigateur.
- Passage automatique d'une case à la suivante, chiffres arabes convertis en
  chiffres occidentaux, et rejet des dates impossibles (31/02 par exemple).
- Technique : `setupDateFields` dans `public/core.js` masque l'`input[type=date]`
  d'origine et le pilote depuis trois cases visibles. Le champ conserve sa valeur
  ISO, donc tout le code qui lit ou écrit `.value` reste inchangé, y compris
  `form.reset()`.

## 1.5.0 — 2026-09-10

- Introduction de jetons de design (`:root`) : toutes les couleurs, arrondis et
  ombres répétés sont définis une seule fois et réutilisés partout.
- Une seule couleur par écran : « سجل التحصيل والفواتير » ne partage plus le vert
  de « الرسوم الشهرية », et les règles de navigation sont regroupées en un bloc.
- Fusion des quatre blocs de fenêtres modales quasi identiques en un seul système
  (`.app-dialog`), les variantes ne déclarant que largeur, accent et panneau
  latéral.
- Vocabulaire unique pour l'état des créances, partagé par la vue mensuelle, la
  vue annuelle et les filtres : « مسدَّد بالكامل / متأخر / عليه متبقٍّ /
  لم يُدفع بعد / بلا رسوم / خارج فترة القيد ».
- Les options du filtre « الحالة » et les puces de filtrage rapide sont générées
  depuis ce vocabulaire, elles ne peuvent plus diverger.
- Messages de succès et d'erreur annoncés aux lecteurs d'écran
  (`role="status"` sur la zone de notification).
- Ajout des états vides manquants : élèves, employés, dépenses, départements,
  règles de remarques et de décisions.
- Un seul intitulé « إجراءات » pour la colonne d'actions de tous les tableaux.
- Tests : nouveau test de domaine sur le vocabulaire des créances, et
  vérifications de fumée sur le système de fenêtres, les couleurs de sections et
  les états vides.

## 1.4.0 — 2026-09-10

- Le bouton « تصدير Excel » du registre des élèves ouvre désormais une fenêtre
  modale de sélection des colonnes avant de produire le fichier.
- Sélection colonne par colonne, avec « تحديد الكل » et « إلغاء التحديد », et
  rappel du nombre d’élèves concernés par la recherche et le département actifs.
- Le choix des colonnes est mémorisé localement (`localStorage`) et réappliqué
  aux exports suivants ; les clés inconnues sont ignorées.
- L’export refuse une sélection vide et n’écrit que les colonnes cochées, en
  respectant leur ordre d’affichage.
- Test de fumée Chromium étendu : passage par la fenêtre modale et vérification
  qu’une colonne décochée est absente du classeur.

## 1.3.0 — 2026-09-10

- Ajout d’un bouton « تصدير Excel » dans le registre des élèves.
- Export des élèves correspondant au département et à la recherche actifs dans
  un véritable fichier `.xlsx` compatible avec Microsoft Excel.
- Inclusion des données scolaires, personnelles, du responsable, de
  l’inscription, du statut et des notes dans le fichier.
- Génération entièrement locale du classeur, sans envoi de données ni connexion
  internet.

## 1.2.5 — 2026-09-10

- Ouverture de l’استمارة الموظف dans une fenêtre modale lors d’un clic sur
  « تعديل » dans le registre des employés.
- Ajout d’un bouton « إضافة موظف » ouvrant la même fenêtre avec un formulaire
  vide.
- Fermeture de la fenêtre par le bouton, l’annulation, `Esc` ou un clic à
  l’extérieur, avec nettoyage automatique du formulaire.
- Adaptation de la fenêtre aux écrans mobiles.

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
