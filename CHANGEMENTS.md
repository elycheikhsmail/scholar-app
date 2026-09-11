# Journal des changements

Toutes les modifications livrées sont consignées ici. Le projet suit le
versionnement sémantique (`MAJEURE.MINEURE.CORRECTIF`).

## 1.19.0 — 2026-09-11

- La fiche financière reçoit désormais un montant global dans un seul champ et
  le répartit automatiquement selon l'ordre comptable : inscription, juin,
  puis les autres mois.
- La liste complète des frais reste visible et indique pour chaque ligne son
  état (**non payé**, **partiellement payé** ou **entièrement payé**), la part
  de la nouvelle somme qui lui sera affectée et son solde après paiement.
- Une prévisualisation récapitule la répartition avant validation. Une seule
  saisie crée une seule facture, même lorsqu'elle couvre plusieurs échéances.
- Le montant est refusé immédiatement s'il dépasse le solde annuel restant.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.18.0 — 2026-09-11

- Les frais mensuels sont désormais payables d'avance et deviennent exigibles
  le premier jour de leur mois.
- Les frais de juin deviennent exigibles intégralement dès l'inscription, en
  plus des frais d'inscription. L'affectation des paiements suit donc l'ordre :
  inscription, juin, puis les autres mois scolaires.
- La fiche financière explique cette règle et identifie juin comme payable à
  l'inscription. Les reçus indiquent aussi l'affectation réelle de chaque
  versement afin que son usage reste transparent.
- Tous les soldes, retards, limites de paiement, relevés, rapports et reçus
  réutilisent cette règle centrale.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.17.0 — 2026-09-11

- Le filtre **الجاري** est désormais sélectionné automatiquement à chaque
  ouverture du dossier financier d'un élève, afin de privilégier le travail du
  mois en cours.
- Ajout du filtre combiné **الماضي والجاري**, qui réunit les échéances passées
  et courantes en un seul clic.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.16.0 — 2026-09-11

- Le relevé des frais d'un élève propose maintenant quatre filtres immédiats :
  **الكل**, **الماضي**, **الجاري** et **القادم**.
- Le tableau se met à jour sans rechargement et annonce le nombre de lignes
  visibles par rapport au nombre total d'échéances.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.15.1 — 2026-09-11

- Dans le registre des élèves, le bouton **رسوم الطالب** est renommé
  **المالية** afin de mieux représenter l'accès à l'ensemble du dossier
  financier de l'élève.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.15.0 — 2026-09-11

- Fusion de **استمارة رسوم الطالب** et du relevé mensuel dans un écran unique,
  construit à partir de la fiche des frais existante. Le relevé complet et
  l'historique des paiements sont désormais consultables en bas de la fiche.
- Ajout d'un bouton **تفاصيل** sur chaque ligne de frais. Il affiche le montant
  brut, la remise, le dû, le payé, le reste et toutes les factures réellement
  affectées à ce frais, avec leurs montants affectés et leurs actions.
- Le bouton **كشف الحساب** de la liste ouvre directement la fiche fusionnée et
  déplie son relevé. L'ancienne adresse `#student-ledger` revient vers la liste
  des frais afin que les anciens favoris ne conduisent pas à un écran vide.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.14.0 — 2026-09-11

- Le **تاريخ الدفع** de la fiche des frais est désormais présenté dans un bloc
  clairement lisible avec trois contrôles nommés : jour, mois et année. Le mois
  s'affiche par son nom arabe au lieu d'un nombre ambigu.
- La liste des jours s'adapte automatiquement au mois et à l'année : 28 ou 29
  jours pour février selon l'année bissextile, et 30 ou 31 pour les autres mois.
  Si un changement rend le jour impossible, le formulaire l'efface et explique
  immédiatement quelle correction est attendue.
- Le composant amélioré reste synchronisé avec la valeur ISO utilisée par la
  validation et la persistance, sans modifier le format enregistré.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.13.0 — 2026-09-11

- **استمارة رسوم الطالب** et **كشف مستحقات الطالب حسب الشهر** ne sont plus
  des fenêtres modales : chacune dispose désormais de son propre écran complet.
- Les deux écrans participent à l'historique interne, conservent le contexte de
  l'élève et proposent un retour explicite vers l'écran précédent. La rubrique
  **الرسوم الشهرية** reste sélectionnée dans la barre latérale pour préserver
  le repère de navigation.
- Une adresse d'écran détaillé rechargée sans élève sélectionné revient de façon
  sûre à la liste des frais.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.12.0 — 2026-09-11

- Ajout de deux boutons **الصفحة السابقة**, en haut à droite et en bas à
  gauche du contenu, pour revenir facilement à l'écran précédent.
- Les boutons suivent l'historique interne de l'application, restent
  synchronisés avec les commandes précédent/suivant du navigateur et sont
  désactivés quand aucun écran interne précédent n'existe afin d'éviter de
  quitter l'application par erreur.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.11.0 — 2026-09-11

- L'écran **الإعدادات** réunissait cinq formulaires sur une seule page à faire
  défiler. Il présente désormais une liste d'onglets — **الرسوم**, **الأقسام**,
  **المدرسة والدخول**, **وضع الاستخدام**, **البيانات** — et n'affiche qu'un
  formulaire à la fois.
- L'écran s'ouvre sur les frais. L'onglet consulté en dernier est retenu, et
  retrouvé au retour sur l'écran.
- Les onglets se parcourent aussi au clavier (flèches gauche/droite, Début,
  Fin), et chaque panneau porte enfin un titre, y compris le formulaire de
  l'école qui n'en avait pas.
- Vérification : `npm run check`, `npm test` (34 tests) et `npm run test:ui`,
  qui couvre désormais le changement d'onglet, la mémorisation du choix et la
  navigation au clavier.

## 1.10.1 — 2026-09-11

- **إعدادات الرسوم** ouvre désormais l'écran des réglages, suivi du tableau des
  niveaux. Le bloc se trouvait sous le panneau rouge de vidage des données, tout
  en bas de la page, là où personne ne va chercher un réglage.
- Le formulaire des frais de l'élève range les montants dus en une seule
  colonne : chaque mois sous le précédent, avec ses trois réponses sur la même
  ligne, au lieu d'une grille de cartes côte à côte.
- Vérification : `npm run check`, `npm test` (34 tests) et `npm run test:ui`
  passent ; écrans des réglages et du formulaire des frais relus dans Chromium.

## 1.10.0 — 2026-09-11

- Les frais ne sont plus saisis élève par élève. L'écran **الإعدادات** contient
  un nouveau bloc **إعدادات الرسوم** : un frais d'inscription annuel unique pour
  toute l'école (200 par défaut) et, dans le tableau des niveaux, un frais
  mensuel fixe par classe, constant sur toute l'année scolaire.
- L'استمارة des frais de l'élève ne demande plus aucun montant : elle rappelle
  les frais lus dans les réglages, puis présente une ligne par montant dû —
  رسم التسجيل, puis chaque mois d'inscription jusqu'à يونيو — avec trois
  réponses : « لم يدفع بعد », « دفع المبلغ كاملا », « دفع جزء من المبلغ ».
- Le choix « دفع جزء من المبلغ » ouvre un champ de montant sous le bouton, exigé
  strictement supérieur à zéro et strictement inférieur au montant dû.
- Un montant déjà soldé est verrouillé dans le formulaire : le corriger passe
  par la suppression de son reçu dans le relevé, et non par une saisie inverse.
- Si un mois plus ancien reste impayé, le formulaire prévient avant
  l'enregistrement que les paiements sont affectés au plus ancien montant dû
  d'abord, puis laisse enregistrer.
- Corriger un tarif dans les réglages ou dans un niveau vaut désormais pour tous
  les élèves concernés et pour toute l'année, mois déjà facturés compris. Les
  périodes de frais par élève (`feeHistory`) disparaissent, ainsi que leur
  tableau et leur aperçu dans le formulaire.
- La remise de l'élève (bourse, fratrie) reste modifiable, dans son propre bloc
  du formulaire des frais.
- Technique : `public/fees.js` lit les frais depuis `settings.registrationFee`
  et depuis le niveau (`settings.departments`) ; `registrationFee`, `monthlyFee`
  et `feeHistory` sont retirés des fiches élèves à la lecture de la base.
  Nouvelles routes `PUT /api/fee-settings`, `PUT /api/students/:id/discount` et
  `POST /api/student-payments/batch` — cette dernière enregistre un reçu par
  montant dû et valide le lot entier contre le solde restant. Les routes
  `PUT /api/students/:id/fees` et `DELETE /api/students/:id/fee-periods/:month`
  sont supprimées.
- Vérification : `npm run check`, `npm test` (34 tests) et `npm run test:ui`
  passent ; le parcours complet (ouverture du formulaire, choix partiel, refus
  d'un montant hors bornes, enregistrement, relevé) a été rejoué dans Chromium
  contre un serveur réel.

## 1.9.3 — 2026-09-10

- L'installateur Windows et l'application portent désormais l'icône de l'école,
  dérivée de `ecole.jpg` : elle apparaît dans la barre des tâches, le menu
  Démarrer, le raccourci du bureau et la liste des programmes installés.
- Les propriétés du programme indiquent l'auteur « ely cheikh smail », repris
  comme mention de copyright dans l'exécutable et dans l'installateur.
- Technique : `build/icon.png` (512×512, recadré carré depuis `ecole.jpg`) sert
  de source unique ; `electron-builder` en produit l'icône Windows
  multi-résolutions (16 à 256 pixels).
- Vérification : installation silencieuse, lancement, création de la base dans
  `%APPDATA%` puis désinstallation testés sous Wine à partir de
  `School-Accounts-Setup-1.9.3.exe`.

## 1.9.2 — 2026-09-10

- La photo `ecole.jpg` devient l'icône visible de l'application dans l'en-tête
  principal, à côté du nom de l'école.
- L'icône est recadrée en cercle, conserve ses proportions et s'adapte à
  l'en-tête mobile sans déformer l'image.

## 1.9.1 — 2026-09-10

- Un reçu de paiement anticipé affiche désormais le solde restant jusqu'au mois
  futur choisi. Il n'affiche plus zéro simplement parce que ce mois n'est pas
  encore une dette courante, et n'ajoute pas les mois qui le suivent.
- Le reçu indique le total payé pour la ligne de frais concernée : le montant
  des frais, le total payé et le reste peuvent ainsi être rapprochés directement.
- Un test reproduit le cas comptable `13 000 - 6 000 = 7 000` pour novembre
  alors que le solde exigible courant de septembre reste nul.

## 1.9.0 — 2026-09-10

- Le solde exigible d'un élève ne comprend plus les mois futurs : seuls les
  frais d'inscription, le mois courant et les mois antérieurs alimentent la
  facture, les totaux, les rapports et les avis aux parents.
- L'échéancier annuel reste disponible pour permettre le paiement volontaire
  d'un ou plusieurs mois à l'avance. Ces versements réduisent les mois planifiés
  sans les présenter comme une dette actuelle.
- Le moteur distingue maintenant le solde exigible du solde annuel planifié,
  et des tests couvrent la période avant la rentrée, le mois courant et les
  paiements anticipés.

## 1.8.2 — 2026-09-10

- Le tableau des montants dus est désormais exporté dans un vrai classeur Excel
  `.xlsx`, comme le registre des élèves, et non plus dans un fichier CSV destiné
  à être interprété par Excel.
- Le libellé du bouton et la confirmation de l'export indiquent clairement le
  format Excel.

## 1.8.1 — 2026-09-10

- Le bouton « تعديل » du registre des salaires ouvre désormais un formulaire
  modal unique avec le mois, le montant, la date, les heures pertinentes, les
  notes et le mot de passe, au lieu d'une succession de boîtes de saisie.
- Le mot de passe est vérifié au moment de l'enregistrement et le formulaire
  reste ouvert en cas d'erreur pour permettre une correction.

## 1.8.0 — 2026-09-10

- Le formulaire des frais affiche désormais le tableau « فترات الرسوم الشهرية » :
  une ligne par période, avec le mois de début, le mois de fin, le nombre de mois
  concernés, le montant mensuel et la date de saisie.
- « تعديل » charge une période dans le formulaire ; la période en cours
  d’édition est surlignée dans le tableau.
- « حذف » supprime une période saisie par erreur, ses mois reprenant le tarif de
  la période précédente. Auparavant une période ne pouvait qu’être ajoutée ou
  remplacée : une erreur de mois était définitive.
- Refus de supprimer la dernière période restante : un élève a toujours un tarif
  en vigueur, ce cas est une modification et non une suppression.
- Aperçu en direct avant l’enregistrement : montant dû total et reste à payer
  avant et après, nombre et noms des frais modifiés, avertissement lorsque des
  mois déjà soldés sont recalculés ou qu’une échéance passée est touchée.
- L’aperçu couvre aussi la remise, qui s’applique rétroactivement à tous les
  mois : son effet n’était signalé nulle part.
- Le bouton « حفظ الرسوم » est désactivé quand rien ne change, ce qui évite
  d’enregistrer une période identique à la précédente.
- Ajout du bouton « استعادة القيم المحفوظة » pour revenir aux valeurs
  enregistrées sans rouvrir la fenêtre.
- Nouvelle route `DELETE /students/:id/fee-periods/:month`, protégée par mot de
  passe côté interface.

## 1.7.1 — 2026-09-10

- Refactorisation : `public/fees-ui.js` n'a plus de ligne au-dessus de
  360 caractères ; la plus longue en faisait 3497 (le reçu de paiement, styles
  compris). Le reçu passe par `printWindow` et la feuille 80 mm de `print.js`.
- `renderFees` ne parcourt plus deux fois la liste des élèves : le tableau et
  les compteurs des puces de filtrage partent du même ensemble filtré.

## 1.7.0 — 2026-09-10

- Nouveau module `public/print.js` : ouverture des fenêtres d'impression,
  feuilles de style A4 et 80 mm, intitulés officiels par défaut et en-tête des
  relevés de notes. Les écrans qui impriment ne dupliquent plus ce document.
- Refactorisation : `public/exams.js` passe de 119 lignes compactées (vingt
  lignes au-dessus de 300 caractères, la plus longue 1185) à une forme lisible,
  sans changement de comportement.
- Les deux suppressions de règles (ملاحظات et قرارات), qui étaient copiées mot
  pour mot, passent par une seule fonction.
- Suppression de code mort : une fonction vide `renderTemplateSubjectInputs` et
  un gestionnaire `onchange` sans effet sur le sélecteur d'élève.

## 1.6.3 — 2026-09-10

- Refactorisation : `public/settings.js` passe de six lignes compactées (jusqu'à
  948 caractères) à une forme lisible, sans changement de comportement.
- Le remplissage du formulaire de réglages passe par une table de champs au lieu
  de onze affectations à la suite.

## 1.6.2 — 2026-09-10

- Refactorisation : `public/staff.js` passe de 69 lignes compactées (jusqu'à 1080
  caractères par ligne) à une forme lisible, sans changement de comportement.
- Le test du rôle est partout `roleNeedsFixed`, au lieu de comparaisons
  `role==='أستاذ'` répétées et parfois inversées.
- `sumAmount` remonte dans `public/core.js` et sert aussi aux totaux des
  salaires et des avances.
- Suppression d'un gestionnaire `onchange` vide sur le sélecteur d'employé du
  formulaire d'avance.

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
