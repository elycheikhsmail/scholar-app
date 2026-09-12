# Journal des changements

Toutes les modifications livrées sont consignées ici. Le projet suit le
versionnement sémantique (`MAJEURE.MINEURE.CORRECTIF`).

## 1.57.0 — 2026-09-12

- Journal d'erreurs sur disque pour diagnostiquer une panne de l'application de
  bureau : `logs/app.log` dans le dossier des données (`userData` sous Electron,
  le projet pour `node server.js`), rotation automatique au-delà de 2 Mo
  (`app.1.log` … `app.3.log`). Y sont consignés le démarrage (version, mode,
  port, système), les erreurs 500 avec leur pile, les requêtes refusées (400)
  en avertissement, les échecs de synchronisation, les exceptions non attrapées
  du processus, les plantages du rendu (`render-process-gone`, `did-fail-load`,
  fenêtre figée) et les erreurs JavaScript de l'interface (`window.onerror`,
  promesses rejetées) envoyées via `POST /api/client-log`.
- Un échec de démarrage affiche désormais une boîte de dialogue avec le chemin
  du journal au lieu de laisser l'application sans fenêtre.
- الإعدادات ← حسابي : le chemin du journal est affiché et, sur le bureau, un
  bouton « فتح مجلد السجلات » ouvre le dossier pour l'envoyer au développeur.
- Technique : nouveau module `logger.js` (ajouté au paquet `electron-builder`),
  `logFile` dans `GET /api/mode`, route `/api/client-log` sans connexion,
  bornée (2 000 caractères par champ, 30 envois par minute et par client, 30
  par page côté navigateur) ; `preload.js` expose `schoolAPI.openLogs`
  (`ipcMain` → `shell.openPath`). Tests : `tests/logger.test.js` (format,
  rotation, gestionnaires de processus, route serveur) ; `logs/` ignoré par git.

## 1.56.1 — 2026-09-12

- Serveur lancé seul (`node server.js`, ouvert dans un navigateur) : l'arrêt
  (Ctrl+C / SIGTERM) envoie d'abord l'instantané au site, comme la fermeture de
  l'application de bureau (`main.js`), attente bornée à 5 s ; le résultat est
  affiché dans le terminal (« تمت المزامنة قبل الإغلاق: N سجلًا »).
- Technique : gestionnaires `SIGINT`/`SIGTERM` dans le bloc `require.main` de
  `server.js` ; vérifié avec un récepteur factice.

## 1.56.0 — 2026-09-12

- Tous les champs de mot de passe (connexion, confirmation dans les paramètres,
  changement de mot de passe, nouvel utilisateur, modification de salaire,
  synchronisation et boîtes de dialogue) ont une icône œil pour afficher ou
  masquer la saisie.
- Technique : `enhancePasswordFields` (`core.js`) enveloppe chaque
  `input[type=password]` dans `.password-field` avec un bouton
  `.password-toggle` ; appelé au démarrage (`app.js`) et dans
  `showInputDialog`. Test UI étendu.

## 1.55.0 — 2026-09-12

- الإعدادات ← المزامنة مع الموقع : la sauvegarde du lien et du jeton ne demande
  plus la كلمة المرور الحالية (champ retiré) ; les paramètres restent réservés à
  l'admin et au développeur.
- La secrétaire voit désormais l'onglet المزامنة avec le seul bouton
  « مزامنة الآن » et peut envoyer l'instantané au site (lecture seule, sans
  risque) une fois les paramètres posés par l'admin.
- Guide `DEPLOIEMENT-VERCEL.md` : rappel que le jeton desktop est `SYNC_TOKEN`
  (pas le jeton Blob) ; ligne « يجب تسجيل الدخول » = URL sans `/api/sync`.
- Technique : `sync-remote` retiré de `ADMIN_ROUTES` (`server.js`), plus de
  `checkLogin` sur `PUT /sync-settings` ; `data-roles` sur le formulaire ;
  tests db et UI ajustés.

## 1.54.1 — 2026-09-12

- Guide `DEPLOIEMENT-VERCEL.md` § 3 : le nouveau formulaire Vercel Blob ne crée
  plus `BLOB_READ_WRITE_TOKEN` par défaut ; il faut cocher « Add a read-write
  token env var » (ou créer le token ensuite). Préfixe à laisser à `BLOB`.
- Technique : version de `package.json` resynchronisée avec ce journal
  (elle était restée à 1.52.1).

## 1.52.1 — 2026-09-12

- Reçus (frais, salaires, avances) : la mention « نسخة للتجريب فقط » n'est plus
  imprimée sur les reçus, ni en production ni en mode test. Les listes A4 et
  les relevés de notes la conservent en mode test.
- Technique : `receiptHtml` (`fees-ui.js`) et `staffReceiptHtml` (`staff.js`)
  n'insèrent plus `TEST_MODE_LABEL` ; test UI inversé.

## 1.54.0 — 2026-09-12

- Onglet الطلاب : le tableau « سجل الطلاب » affiche deux nouvelles colonnes
  après le sexe — **ولي الأمر** (nom du tuteur) et **الهاتف** (téléphone du
  tuteur). Elles peuvent être masquées avec « إظهار وإخفاء الأعمدة ».
- Technique : en-tête dans `index.html`, cellules dans `renderStudents`
  (`students.js`, `colspan` 10) ; test UI étendu.

## 1.53.2 — 2026-09-12

- Le mot « إيصال » est remplacé par « وصل » partout dans l'application : titre
  du reçu de paiement des frais (« وصل دفع »), reçus de salaire et d'avance,
  boutons « وصل » des journaux, colonne « رقم الوصل » à l'écran et dans les
  exports Excel, message du bloqueur de fenêtres.
- Technique : `fees-ui.js`, `staff.js`, `index.html` ; test UI ajusté. Les
  numéros (`S-…`, `A-…`, `F-…`) et les données stockées sont inchangés.

## 1.53.1 — 2026-09-12

- Le bouton « إظهار وإخفاء الأعمدة » des tableaux est centré au-dessus du
  tableau ; sa liste déroulante s'ouvre centrée sous lui.
- Technique : `.column-picker-bar` (`style.css`) passe en `justify-content:center`.

## 1.53.0 — 2026-09-12

- Tous les tableaux de l'application (طلاب, كشف الرواتب, سجل الموظفين, دفعات
  الرواتب, السلف, المصروفات, الامتحانات, التقارير, الإعدادات, فواتير الطالب…)
  reçoivent le bouton **« إظهار وإخفاء الأعمدة »** déjà présent sur le tableau
  des frais : chaque colonne peut être masquée ou réaffichée, « إظهار الكل »
  rétablit tout, et le choix est mémorisé par tableau sur l'appareil.
- Technique : `setupColumnPickers` (`core.js`) construit le sélecteur à partir
  des en-têtes `<thead>` de chaque `table[aria-labelledby]` à en-tête fixe et
  masque les colonnes par une règle CSS `nth-child` (survit aux re-rendus,
  laisse visibles les lignes `colspan`) ; mémoire `localStorage`
  `hiddenColumns:<id>` par libellé de colonne ; styles `.column-picker-bar` ;
  test UI étendu.

## 1.52.0 — 2026-09-12

- Montants et effectifs : le séparateur de milliers est désormais une **espace**
  (1 000 au lieu de 1,000) partout — écrans, impressions A4 et reçus. Les
  fichiers Excel contiennent toujours des nombres bruts.
- Reçus (frais, salaires, avances) : la mention « نسخة للتجريب فقط » est
  imprimée sur tous les reçus quel que soit le mode (production ou test). Les
  listes A4 et les relevés de notes ne l'affichent qu'en mode test, comme avant.
- Technique : `money` (`core.js`) remplace la virgule par une espace insécable ;
  `receiptHtml` (`fees-ui.js`) et `staffReceiptHtml` (`staff.js`) n'appellent
  plus `isTestMode()` ; test UI adapté.

## 1.51.0 — 2026-09-12

- Onglet الموظفون والرواتب : chaque tableau s'exporte en **Excel avec choix des
  colonnes** — كشف رواتب الشهر (nouveau bouton « تصدير Excel » à côté de
  l'impression), سجل الموظفين (nouveau bouton dans la barre de filtres),
  سجل دفعات الرواتب et سجل سلف الموظفين (les boutons existants ouvrent
  désormais la boîte de choix). L'export suit les filtres affichés ; les
  colonnes cochées sont mémorisées séparément pour chaque tableau.
- Technique : boîte commune `columnExportDialog` et `openColumnExport`
  (`core.js`, colonnes `{key,label,value}`, mémoire `localStorage` par
  `storageKey`) ; `PAYROLL_/TEACHER_/SALARY_/ADVANCE_EXPORT_COLUMNS` et
  `payrollVisibleRows` dans `staff.js` ; test UI étendu.

## 1.50.0 — 2026-09-12

- Onglet الطلاب : nouveau filtre **الجنس** (الكل / ذكر / أنثى) à côté du filtre
  القسم/الشعبة. Il se combine avec le département et la recherche ; le compteur
  « عدد الطلاب » et l'export Excel suivent la liste filtrée.
- Technique : champ `studentGenderFilter`, `filteredStudents` compare
  `s.gender` ; test UI étendu. (Livré sous le numéro 1.49.0 déjà utilisé par
  l'entrée suivante ; renuméroté 1.50.0.)

## 1.49.0 — 2026-09-12

- Onglet الموظفون : la colonne « الهاتف » apparaît maintenant dans les quatre
  tableaux à l'écran — registre (déjà présente), « كشف رواتب الشهر », « سجل
  دفعات الرواتب » et « سجل سلف الموظفين » — juste après le nom de l'employé.
- Technique : `renderPayroll`, `renderSalaries`, `renderAdvances` et les
  en-têtes de `index.html` ; lignes vides ajustées (`colspan`) ; test UI
  vérifie le numéro dans le كشف et le journal des salaires. Les impressions et
  exports Excel restent inchangés.

## 1.48.0 — 2026-09-12

- Onglet الموظفون : recherche d'un employé par **numéro de téléphone** (chiffres
  arabes acceptés) dans « كشف رواتب الشهر » (nouveau champ « بحث » à côté du
  mois), « الرواتب الشهرية » (le champ de recherche du formulaire indique
  désormais « ابحث بالاسم أو الهاتف ») et « السلف » (nouveau champ de recherche
  devant la liste des employés). Une recherche sans résultat l'indique dans le
  tableau ou sous le formulaire, et le formulaire de سلفة refuse avec un
  message lisible au lieu de rester muet.
- Technique : `teacherQuery` / `teacherMatches` (nom, طبيعة العمل, téléphone)
  partagés par le registre, le كشف, la paie et les avances ; champs
  `payrollSearch` et `advanceTeacherSearch` ; `prefillAdvanceForm` vide la
  recherche avant de sélectionner l'employé ; test UI étendu.

## 1.47.0 — 2026-09-12

- Onglet « قاعدة البيانات » (compte développeur uniquement) : **تصدير قاعدة
  البيانات** télécharge une copie cohérente de la base en un fichier
  `school-data-AAAA-MM-JJ.sqlite` ; **استيراد قاعدة بيانات** remplace la base
  courante par un fichier exporté, après mot de passe du développeur et
  confirmation. Le fichier est vérifié (en-tête SQLite, `integrity_check`,
  tables, version du schéma), la base actuelle est sauvegardée dans
  `database/backups/before-import-….sqlite`, toutes les sessions sont fermées
  et l'écran de connexion revient. Un fichier refusé ne change rien ; une base
  importée qui ne s'ouvre pas est remplacée par la sauvegarde.
- Technique : `db.exportDatabase`, `db.validateDatabaseFile`,
  `db.replaceDatabase` (sauvegarde en ligne SQLite, fermeture qui replie le
  WAL, remplacement puis réouverture) ; routes `POST /api/database/export`
  (JSON `{password}`, réponse binaire) et `POST /api/database/import` (corps
  brut, en-tête `X-Confirm-Password`), réservées au rôle développeur, mot de
  passe revérifié à chaque appel.
- Documentation : `README.md` (« Export et import de la base »).
- Vérification : `npm run check`, `npm test` (48), `npm run test:ui`.

## 1.46.0 — 2026-09-12

- Comptes utilisateurs avec rôles. **Administrateur** : tout, y compris la
  gestion des comptes (nouvel onglet « المستخدمون » : ajout, changement de
  rôle, réinitialisation du mot de passe, suppression — jamais son propre
  compte ni le dernier administrateur). **Secrétaire** : élèves, paiements,
  personnel, salaires, avances, dépenses et examens, sans accès aux paramètres.
  **Superviseur** : consultation et impression de tous les écrans, aucune
  saisie (mêmes masquages que la copie web). **Développeur** : compte intégré
  (`developer`, mot de passe initial `Dev@2026`), invisible et intouchable
  pour les administrateurs, réservé aux opérations sur la base de données.
- Onglet « حسابي » pour tous : nom, rôle et changement de son propre mot de
  passe. Le nom d'utilisateur et le mot de passe quittent le formulaire
  « بيانات المدرسة » (la sauvegarde y demande toujours le mot de passe courant).
  Le compte connecté s'affiche dans la barre supérieure.
- Migration transparente : l'identifiant unique d'une base existante devient
  son compte administrateur à la première ouverture ; le bouton de bascule de
  mode copie les comptes dans la base de test.
- Technique : collection `users` (`db.js`, jamais envoyée au navigateur ni au
  site), sessions porteuses du compte et matrice de permissions par route dans
  `server.js` (403 « ليست لديك صلاحية »), routes `/api/users`, `/api/password` ;
  `db.checkLogin` renvoie le compte. Onglets `data-roles` masqués selon le rôle.
- Vérification : `npm run check`, `npm test` (47), `npm run test:ui`.

## 1.45.0 — 2026-09-12

- Copie web en lecture seule, étape 4 : fonction Vercel `api/[...path].js`
  (réception de l'instantané avec jeton, stockage Vercel Blob privé, API GET
  identique à celle du desktop, connexion par mot de passe, 405 sur toute
  écriture), `vercel.json`, `.vercelignore`, `npm run web:local` pour l'essayer
  sur la machine. L'instantané part gzippé du desktop (0,13 Mo pour une année
  pleine). Mode d'emploi du déploiement dans `README.md`.
- Technique : `@vercel/blob` en devDependency (non embarqué dans l'application
  Electron) ; `tests/web-readonly.test.js` fait dialoguer le serveur desktop et
  la fonction web.
- Vérification : `npm run check`, `npm test`, `npm run test:ui`.

## 1.44.0 — 2026-09-11

- Préparation de la copie web en lecture seule (étapes 1–3 de
  `NOTES-WEB-READONLY.md`) :
  - mode lecture seule (`SCHOOL_READ_ONLY=1`) : badge « نسخة للعرض فقط »,
    formulaires et boutons d'écriture masqués (`body.read-only`), `api()`
    refuse les écritures côté navigateur et le serveur répond 405 ;
  - `db.snapshot()` : instantané complet sans mot de passe ;
  - الإعدادات ← « المزامنة مع الموقع » : URL + jeton, bouton « مزامنة الآن »,
    « آخر مزامنة » et nombre de fiches modifiées depuis (table `metadata`) ;
    synchronisation automatique à la fermeture d'Electron ; refusée en mode test.
- Technique : `db.updateSyncSettings` / `syncSettings` / `recordSync`,
  compteur d'écritures dans le wrapper de `db.js`, `syncRemote()` dans
  `server.js`, `PUT /api/sync-settings`, `POST /api/sync-remote`,
  `readOnly` dans `GET /api/mode` ; marqueurs `write-only` / `data-write-only`.
- Vérification : `npm run check`, `npm test`, `npm run test:ui`.

## 1.43.0 — 2026-09-11

- Nouveau `npm run fees:clear` (`scripts/clear-fees.js`) : vide les niveaux et
  frais mensuels de la base de production pour les remplacer par la liste
  officielle (`npm run fees:apply`) — niveau sans élève supprimé, niveau avec
  élèves conservé à frais zéro et listé ; élèves, reçus, personnel et
  paramètres intacts ; sauvegarde préalable ; `--dry-run` pour l'aperçu.
- Vérification : `npm run check`, `npm test`.

## 1.42.0 — 2026-09-11

- Nouveau `npm run fees:apply` (`scripts/apply-fees.js`) : charge les frais
  mensuels officiels des 18 niveaux dans la base de production — niveau présent
  mis à jour (élèves conservés), niveau absent ajouté, autres niveaux laissés
  et listés ; sauvegarde préalable ; `--dry-run` pour l'aperçu.
- La liste officielle vit dans `scripts/official-fees.js`, partagée avec le
  générateur de la base de test.
- Vérification : `npm run check`, `npm test`.

## 1.41.0 — 2026-09-11

- Formulaire des dépenses (المصروفات) : même signalement visuel des erreurs —
  nature du مصروف requise, montant requis et supérieur à zéro, date requise ou
  incomplète. Corriger un champ efface son signalement ; un refus du serveur est
  rattaché au champ nommé. La date n'est plus remplacée en silence par
  aujourd'hui quand elle manque.
- Technique : `expenseFieldErrors()` dans `reports.js`, `novalidate` sur `#expenseForm`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.40.0 — 2026-09-11

- Fiche employé (الموظفون) : même signalement visuel des erreurs que la fiche
  élève — nom, طبيعة العمل, téléphone (8 chiffres), salaire ou taux horaire
  négatif, date d'embauche requise ou incomplète, date de fin de service
  requise pour un employé arrêté et postérieure à l'embauche. Corriger un champ
  efface son signalement ; un refus du serveur est rattaché au champ nommé.
- Technique : helpers partagés dans `core.js` (`showFormErrors`,
  `clearFormErrors`, `clearFieldErrorOnEdit`, `dateFieldState`,
  `serverErrorField`) utilisés par `students.js` et `staff.js` ; styles
  `label.field-invalid` génériques ; `novalidate` sur `#teacherForm`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.39.0 — 2026-09-11

- Fiche élève (الطلاب) : les erreurs de saisie sont signalées champ par champ
  avant l'envoi — libellé et bordure rouges, message sous le champ, focus sur le
  premier champ fautif, bulle récapitulative. Contrôles : département, numéro
  scolaire, nom, sexe, NNI (10 chiffres), téléphone du parent (8 chiffres),
  dates incomplètes, date de naissance future, date d'inscription, date de
  départ requise et postérieure à l'inscription. Corriger un champ efface son
  signalement ; un refus du serveur (NNI ou numéro déjà pris…) est rattaché au
  champ concerné.
- Technique : `novalidate` sur `#studentForm`, `studentFieldErrors()` /
  `showStudentErrors()` dans `students.js`, classes `.field-invalid` / `.field-error`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.38.0 — 2026-09-11

- Recherche par téléphone : dans الطلاب et الرسوم, le nom ou le téléphone du
  parent (ولي الأمر) retrouve ses enfants ; les chiffres arabes sont acceptés.
  La recherche du personnel (الموظفون, paie) trouvait déjà par téléphone.
- Technique : `filteredStudents()` (`students.js`) et la recherche des frais
  (`fees-ui.js`) incluent `guardianName` / `guardianPhone` et passent par `western()`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.37.0 — 2026-09-11

- المصروفات : filtre « تصفية حسب الشهر » au-dessus du registre — tous les mois
  (par défaut) ou l'un des mois scolaires déjà commencés — avec le nombre de
  dépenses et leur total pour la sélection. Le message vide nomme le mois.
- Technique : `renderExpenseMonths()` dans `public/reports.js` réutilise
  `reportPeriods()` ; `#expenseMonth`, `#expenseCount`, `#expenseTotal`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.36.0 — 2026-09-11

- التقارير : l'إجمالي الخارج est détaillé en deux cartes — « الخارج: الرواتب
  والسلف » et « الخارج: المصروفات » — avant le total et le net ; le rapport
  imprimé reprend les deux sous-totaux.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.35.1 — 2026-09-11

- التقارير : bouton « 🖨️ طباعة التقرير ». Imprime sur A4 le rapport du mois
  affiché (ou de l'année) : synthèse dépôt / salaires / avances / dépenses /
  sortie / net, dépenses par nature, créances par classe et principaux débiteurs.
- Technique : `currentReport` dans `public/reports.js`, `openPrintWindow` de
  `print.js` ; `h3` ajouté au style d'impression partagé.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.35.0 — 2026-09-11

- التقارير : rapports mensuels. Un sélecteur « الشهر » propose chaque mois
  scolaire déjà commencé (le mois courant par défaut) et « السنة الدراسية كاملة ».
  Le dépôt, la sortie et le net portent sur les reçus, salaires, avances et
  dépenses datés dans le mois choisi, avec un tableau de détail ; le mois courant
  s'arrête à aujourd'hui. Les inscriptions de septembre comptent dans octobre.
- Le ملخص المستحقات حسب القسم et أعلى المديونين montrent l'état des créances
  à la fin du mois choisi (frais échus à cette date, reçus enregistrés avant).
- Technique : `reportPeriods()` / `renderReports()` dans `public/reports.js`,
  `#reportMonth` dans `index.html`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.34.0 — 2026-09-11

- Nouveau générateur `npm run seed:testing` (`scripts/seed-testing.js`) : reconstruit
  la base de test (`database/testing`) comme une année scolaire en cours au dernier
  jour de février — les 18 niveaux avec les frais de l'école, 20 à 50 élèves par
  niveau, reçus des mois écoulés (majorité à jour, retards, paiements partiels,
  impayés), معلمون à 6 000/mois, أساتذة à 150/heure, employés d'appui, salaires,
  avances, dépenses et deux examens. Sauvegarde préalable, paramètres et
  identifiants conservés, production intouchée.
- La base de test porte sa date de test : ouverte en وضع التجريب, l'application
  adopte cette date une fois sur l'appareil (bandeau ⚠️ تاريخ تجريبي), puis elle se
  modifie ou s'efface comme avant.
- Technique : `db.batch(fn)` regroupe des milliers d'opérations dans une seule
  transaction (1 s au lieu de 2 min) ; `db.setTestDate`, `testDate` dans
  `GET /api/mode` en mode test, adoption dans `public/settings.js`.
- Vérification : `npm run check`, `npm test`, `npm run test:ui`.

## 1.33.1 — 2026-09-11

- Formulaire de paie : quand la recherche d'employé ne trouve personne (ou
  qu'aucun employé n'est choisi), le rappel sous le formulaire le dit
  clairement et « تسجيل دفعة » affiche un message lisible en replaçant le
  curseur dans le champ de recherche, au lieu de la bulle du navigateur et
  des montants périmés du dernier employé affiché.
- Technique : `novalidate` sur `#salaryForm`, contrôle en JavaScript.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.33.0 — 2026-09-11

- الإعدادات ← وضع الاستخدام : « تاريخ الاختبار ». L'application se comporte
  comme si l'on était ce jour-là (mois courant, échéances des frais,
  استحقاق الرواتب, dates proposées dans les formulaires) pour tester octobre,
  novembre, etc. Réglage propre à l'appareil, avertissement permanent dans le
  bandeau supérieur, retour au vrai jour en un clic.
- Technique : `now()` / `today()` dans `public/core.js` lisent
  `localStorage.simulatedDate` ; les relevés reçoivent `asOf` (`students.js`).
- Vérification : `npm run check` et `npm run test:ui`.

## 1.32.0 — 2026-09-11

- La date du bandeau supérieur s'affiche en arabe (jour de la semaine, mois en
  toutes lettres) avec des chiffres occidentaux, au lieu de l'anglais.
- Le bandeau supérieur prend la couleur du bouton de rubrique ouvert (élèves en
  bleu, frais en vert, employés en violet, etc.), avec une transition douce.
- Technique : `.topbar[data-section]` (`public/style.css`) piloté par `go()`
  dans `public/core.js`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.31.0 — 2026-09-11

- Règle métier : le salaire d'un mois n'est dû qu'à son dernier jour. Une
  dépense de salaire datée avant cette date est refusée (nouvelle dépense et
  modification) avec la date d'échéance dans le message ; les avances (سلف)
  restent possibles à tout moment.
- كشف رواتب الشهر : un mois dont le dernier jour n'est pas passé affiche
  « لم يحل بعد » avec la date d'échéance, sans bouton « صرف المتبقي » (le
  bouton « سلفة » reste) ; le formulaire de paie rappelle l'échéance et
  avertit quand la date saisie la précède.
- Technique : `salaryDueDate()` / `salaryEarnedOn()` dans `public/fees.js`,
  contrôle serveur dans `db.js`, données de démonstration datées au dernier
  jour du mois.
- Vérification : `npm test` et `npm run test:ui` (horloge du navigateur fixée
  au 31 octobre pour le كشف).

## 1.30.0 — 2026-09-11

- Écran « الموظفون والرواتب » : les quatre blocs (كشف رواتب الشهر, سجل
  الموظفين, الرواتب الشهرية, السلف) sont présentés un à la fois derrière une
  liste d'onglets, comme dans الإعدادات ; le dernier onglet ouvert est retenu
  sur l'appareil, la liste se parcourt aux flèches.
- « صرف المتبقي » et « سلفة » depuis le كشف du mois ouvrent automatiquement
  l'onglet correspondant avec le formulaire pré-rempli.
- Technique : `createTabs()` partagé dans `public/core.js`, utilisé par
  `settings.js` et `staff.js` ; panneaux `[data-staff-panel]`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.29.2 — 2026-09-11

- Les rappels de montants sous les formulaires de paie et de سلفة (استحقاق,
  سلف, المتبقي قبل الدفعة, المتاح) s'affichent en gras et en grand, dans un
  encadré mis en évidence ; masqués quand ils sont vides.
- Technique : classe `.due-info` (`public/style.css`) sur `#salaryDueInfo`
  et `#advanceDueInfo`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.29.1 — 2026-09-11

- Formulaire de paie : la touche `Esc` vide le formulaire et remet le mois et
  la date du jour.
- `PROPOSITIONS-UX-STAFF.md` : état d'avancement de chaque proposition.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.29.0 — 2026-09-11

- سجل دفعات الرواتب et سجل السلف : filtres par employé, mois et plage de
  dates, totaux des lignes affichées, bouton **تصدير Excel** (numéro
  d'إيصال, employé, mois, montants, date, heure, heures, taux, notes).
- Garde-fous : confirmation avant d'enregistrer une paie ou une سلفة pour un
  mois à venir ; avertissement à l'enregistrement d'un employé sans salaire
  fixe (ou d'un أستاذ sans سعر الساعة).
- Technique : `renderLogFilters`, `logFilterMatches`, `confirmFutureMonth`,
  exports via `downloadXlsx` dans `public/staff.js`.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.28.0 — 2026-09-11

- **سجل الموظفين** : recherche par nom/téléphone, filtre par طبيعة العمل et
  par statut (النشطون par défaut), compteurs (affichés / total / actifs,
  somme des salaires fixes mensuels), colonnes **الحالة**, **الهاتف** et
  **آخر دفعة** (mois et date du dernier versement).
- Statut de l'employé **نشط / متوقف عن العمل** avec date de fin de service
  dans le formulaire ; un employé متوقف garde tout son historique mais
  disparaît des listes de paie, de سلفة et du كشف du mois.
- Technique : `status` / `endDate` validés dans `db.js`
  (`teacherStatusFields`), `activeTeachers`, `filteredTeachers`,
  `lastPaymentOf` dans `public/staff.js`.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.27.0 — 2026-09-11

- Reçus imprimables : bouton **إيصال** dans سجل دفعات الرواتب (إيصال صرف
  راتب : heures × taux, استحقاق, السلف المخصومة, total payé, reste, signatures
  comptable/bénéficiaire) et dans سجل السلف (إيصال سلفة). Bouton **طباعة كشف
  الشهر** : كشف الرواتب en A4 avec colonne de signature et totaux.
- Numéros d'إيصال uniques et persistants : `S-000001` (salaires) et
  `A-000001` (avances), affichés dans les tableaux ; heure de saisie
  enregistrée et affichée avec la date.
- Le formulaire de paie détaille les سلف déduites (montant et date) ; le
  formulaire de سلفة affiche les heures du mois en ligne (plus de fenêtre
  séparée) avec un rappel de l'استحقاق, du payé et du disponible ; un montant
  trop élevé est ramené au disponible.
- Technique : séries `RECEIPT_SERIES` (`db.js`) avec `salaryReceiptSequence`
  et `advanceReceiptSequence`, champ `time` sur `teacherPayments` /
  `teacherAdvances` ; `printSalaryReceipt`, `printAdvanceReceipt`,
  `updateAdvanceHint` dans `public/staff.js`.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.26.0 — 2026-09-11

- **كشف رواتب الشهر** en tête de **الموظفون والرواتب** : une ligne par employé
  pour le mois choisi (الاستحقاق, السلف, المدفوع, المتبقي, الحالة), totaux du
  mois, filtres الكل / لم يُصرف / جزئي / مسدَّد. Les boutons **صرف المتبقي**
  (ou **أدخل الساعات** pour un أستاذ sans heures) et **سلفة** pré-remplissent
  les formulaires correspondants.
- Formulaire de paie : champ de recherche d'employé, montant pré-rempli avec le
  reste du mois (une saisie manuelle n'est pas écrasée), champ **ملاحظات**,
  ✓ devant les employés déjà soldés pour le mois, confirmation avant une
  dépense supplémentaire sur un mois soldé, montant disponible placé
  automatiquement quand la saisie le dépasse, et passage à l'employé suivant à
  payer après chaque versement.
- Technique : `monthlyPayroll`, `renderPayroll`, `prefillSalaryForm`,
  `prefillAdvanceForm`, `nextUnpaidTeacherId` dans `public/staff.js` ;
  `#payrollPanel` dans `public/index.html`.
- Vérification : `npm run check` et `npm run test:ui` (scénario étendu).

## 1.25.1 — 2026-09-11

- Formulaire employé : le champ **المادة** n'apparaît que lorsque la
  « طبيعة العمل » est **معلم** ou **أستاذ** ; il est vidé pour les autres.
- Technique : `toggleRoleFields` (`public/staff.js`) et `#subjectWrap`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.25.0 — 2026-09-11

- Nouvel onglet **طبيعة العمل** dans **الإعدادات** : ajout, renommage et
  suppression des valeurs proposées dans le champ « طبيعة العمل » du
  formulaire d'ajout/modification d'un employé (**الموظفون والرواتب**).
  « أستاذ » (payé à l'heure) et « أخرى » (valeur par défaut) sont fixes ;
  une valeur liée à des employés ne peut pas être supprimée ; renommer une
  valeur met à jour les employés concernés.
- Technique : `settings.staffRoles` avec `addStaffRole` / `updateStaffRole` /
  `deleteStaffRole` dans `db.js`, routes `/api/staff-roles` dans `server.js`,
  validation du rôle à l'enregistrement d'un employé, `renderStaffRoles`
  (`public/settings.js`) et `renderStaffRoleOptions` (`public/staff.js`).
- Vérification : `npm run check`, `npm test` (test db ajouté) et `npm run test:ui`.

## 1.24.1 — 2026-09-11

- Répartition des paiements : les factures sont affectées aux frais dans
  l'ordre de leur numéro (ordre d'émission) et non plus selon la date saisie.
  Un mois ne reçoit de l'argent qu'une fois le précédent entièrement soldé,
  et modifier la date d'une facture (ou la dater dans le passé) ne rebrasse
  plus les mois couverts par les factures déjà émises et imprimées.
- Le tableau **الفواتير** suit le même ordre (dernière facture en premier).
- Technique : `allocate` dans `public/fees.js` trie par `id` ; tests ajoutés
  dans `tests/fees.test.js`.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.24.0 — 2026-09-11

- Le tableau **الفواتير** du formulaire de frais est simplifié : une ligne par
  facture avec trois colonnes — **تاريخ الفاتورة**, **ملاحظة** (liste des
  frais réglés, en tout ou en partie, par la facture : رسوم التسجيل et les
  mois concernés, avec le montant affecté) et **إجراء** (numéro, طباعة,
  تعديل, حذف). Les filtres de période propres à ce tableau sont retirés ;
  ceux de la liste des frais restent.
- Technique : `refreshStudentFeeDetails` (`public/students.js`) inverse les
  allocations du moteur de frais par facture ; suppression de
  `applyStudentLedgerPeriodFilter` et du bloc `.ledger-period-tools` du tableau.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.23.0 — 2026-09-11

- Le tableau **الفواتير** du formulaire de frais n'affiche plus que les frais
  qui portent au moins une facture ; les frais encore sans facture restent
  visibles dans la liste des frais au-dessus. Un message s'affiche lorsque
  l'élève n'a aucune facture.
- Technique : filtrage sur `allocations.length` dans `renderStudentLedger`
  (`public/students.js`) ; le compteur de période ignore la ligne vide.
- Vérification : `npm run check` et `npm run test:ui` (scénario mis à jour).

## 1.22.0 — 2026-09-11

- Chaque reçu enregistre l'heure et la minute de saisie ; elles s'affichent
  après la date dans le tableau **الفواتير** du formulaire de frais, le
  détail d'un frais, le tableau des encaissements et le reçu imprimé
  (« 2026-09-11 14:05 »). Les reçus antérieurs n'affichent que la date.
- Technique : `db.js` ajoute le champ `time` (HH:MM, heure locale) aux
  `studentPayments` ; `date` reste `AAAA-MM-JJ` pour les filtres. Helper
  `dateTime` dans `public/core.js`, `time` propagé aux allocations de `fees.js`.
- Vérification : `npm run check`, `npm test` et `npm run test:ui`.

## 1.21.3 — 2026-09-11

- Le tableau **الفواتير** du formulaire de frais de l'élève (`#student-fees`)
  n'affiche plus la colonne **نوع الرسوم / الشهر**.
- Technique : le mois reste porté par l'attribut `data-month` de chaque ligne
  (`public/students.js`) ; le test UI s'appuie dessus.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.21.2 — 2026-09-11

- Le numéro de facture (**رقم الفاتورة**) est désormais unique : après la
  suppression d'un reçu, le numéro libéré n'est plus réattribué au reçu suivant.
- Technique : `db.js` tient une séquence persistante `invoiceSequence`
  (`nextInvoiceNo`) qui ne redescend jamais ; les bases existantes reprennent
  après le plus grand numéro déjà émis, et la migration JSON renumérote les
  doublons éventuels.
- Vérification : `npm run check`, `npm test` (deux tests ajoutés dans
  `tests/db.test.js`) et `npm run test:ui`.

## 1.21.1 — 2026-09-11

- Les filtres de période (**الفترة**) du formulaire de frais et du tableau
  **الفواتير**, ainsi que la colonne **الفترة** et le détail d'un frais, suivent
  désormais la chronologie de l'année scolaire (octobre … juin de l'année
  civile suivante) et non la date d'échéance : juin, exigible à l'inscription,
  reste **قادمة** jusqu'à l'arrivée de juin. Le frais d'inscription garde sa
  date d'échéance.
- Technique : `ledgerPeriodMonthOf` dans `public/students.js` s'appuie sur
  `monthDate` / `startYearOf` du moteur de frais.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.21.0 — 2026-09-11

- Dans le formulaire de frais de l'élève (`#student-fees`), la liste des frais avec
  leur état de paiement dispose de ses propres filtres, placés au-dessus des
  lignes : **الفترة** (الكل / الماضي / الماضي والجاري / الجاري / القادم, mêmes
  périodes que le tableau **الفواتير**) et **حالة السداد** (الكل / لم يُسدَّد /
  مسدَّد جزئياً / مسدَّد بالكامل).
- Un compteur `عرض N من M رسم` accompagne les filtres et un message s'affiche
  quand aucun frais ne correspond. Les filtres sont remis à **الكل** à chaque
  ouverture du formulaire ; l'état utilisé est celui réellement enregistré, la
  saisie d'un montant ne masque donc aucune ligne.
- Technique : `periodFilterMatches` et `syncFilterButtons` sont partagés avec
  le filtre du tableau des factures ; règle `.fee-entry[hidden]`.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.20.0 — 2026-09-11

- Le tableau **المستحقات حسب الشهر** devient **الفواتير** et sa colonne
  **تاريخ الاستحقاق** devient **تاريخ الفاتورة**. Elle affiche les dates des
  factures réellement affectées à chaque frais.
- Ajout d'une colonne **إجراء** donnant accès à l'impression, la modification
  et la suppression de chaque facture depuis la ligne du mois concerné. Quand
  plusieurs factures couvrent un mois, chacune conserve ses propres actions.
- Suppression du tableau séparé **سجل دفعات الطالب**, devenu redondant.
- Vérification : `npm run check` et `npm run test:ui`.

## 1.19.1 — 2026-09-11

- Les boutons **تسجيل الدفعة** et **مسح المبلغ** sont maintenant placés
  directement sous le champ **المبلغ المدفوع** et avant les lignes détaillant
  l'état de paiement des mois.
- Vérification : `npm run check` et `npm run test:ui`.

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
