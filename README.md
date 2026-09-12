# School Accounts

Application Electron de gestion des comptes d'une école.

L'application permet de gérer les élèves, les frais scolaires, les employés, les salaires, les avances, les dépenses, les examens et les rapports financiers.

## Fonctionnalités

- Tableau de bord avec les indicateurs financiers et scolaires.
- Gestion des élèves et de leurs informations administratives.
- Suivi des frais d'inscription et des paiements mensuels.
- Gestion des employés, des salaires et des avances. Règle : le salaire d'un
  mois n'est dû qu'à son dernier jour ; avant cette date seule une avance
  (سلفة) peut être versée, le كشف du mois affiche « لم يحل بعد ».
- Enregistrement et suivi des dépenses.
- Gestion des examens, des matières, des coefficients et des résultats.
- Règles personnalisables pour les appréciations et les décisions.
- Impression des reçus de paiement et des relevés de résultats.
- Paramètres de l'école, des classes et de l'accès utilisateur.
- Stockage local des données dans la base de données de l'application.

## Prérequis

- Node.js 22.16 minimum (ou une version ultérieure avec `node:sqlite`).
- npm.
- Windows pour la génération de l'installateur Electron.

## Installation

```bash
npm install
```

## Démarrage

### Application Electron

```bash
npm start
```

### Serveur local uniquement

```bash
npm run server
```

Le serveur écoute uniquement sur `127.0.0.1` par défaut. Le paramètre `SCHOOL_HOST` permet de choisir explicitement une autre interface si nécessaire.

Le serveur utilise le port `3780` par défaut. Si ce port est déjà utilisé, il cherche automatiquement un port disponible jusqu'à `3800`.

## Liens directs vers les écrans

Chaque écran possède un fragment d’URL stable. Un lien peut être ouvert avant ou
après la connexion ; l’application affiche l’écran demandé dès que la session est
prête. Les boutons précédent et suivant du navigateur suivent également cette
navigation.

| Écran | Lien local |
| --- | --- |
| Tableau de bord | `http://127.0.0.1:3780/#dashboard` |
| Élèves | `http://127.0.0.1:3780/#students` |
| Frais mensuels | `http://127.0.0.1:3780/#fees` |
| Encaissements et factures | `http://127.0.0.1:3780/#collections` |
| Employés et salaires | `http://127.0.0.1:3780/#staff` |
| Dépenses | `http://127.0.0.1:3780/#expenses` |
| Examens | `http://127.0.0.1:3780/#exams` |
| Rapports | `http://127.0.0.1:3780/#reports` |
| Paramètres | `http://127.0.0.1:3780/#settings` |

Un fragment inconnu est remplacé automatiquement par `#dashboard`.

## Accès et sessions

- Les sessions expirent après 12 heures (`SCHOOL_SESSION_TTL_MS` pour une autre durée).
- Après huit échecs de connexion en cinq minutes depuis la même adresse, les tentatives sont refusées jusqu'à la fin de la fenêtre.
- Les réponses de l'API n'autorisent l'accès cross-origin que depuis l'adresse locale qui sert l'interface.

## Vérifications ciblées

```bash
npm run check       # Syntaxe JavaScript, sortie courte
npm test            # Tous les tests unitaires et d'intégration
npm run test:fees   # Calcul des frais
npm run test:db     # Persistance, migrations et API
npm run test:seed   # Générateur de données de démonstration
npm run test:ui     # Chargement des scripts et navigation, API simulée
```

Les tests unitaires et le test UI utilisent des répertoires temporaires. Le test UI
nécessite Chromium de Playwright, ou `E2E_BROWSER_PATH`, comme les tests E2E.
Il vérifie la connexion, toutes les sections, les frais d'un élève et la reprise
de session, sans démarrer le serveur ni utiliser la base de travail.

## Tests E2E

Le projet contient un test E2E Playwright qui vérifie le parcours de base : connexion, affichage du tableau de bord, navigation vers les élèves et déconnexion.

```bash
npm run test:e2e
```

Les tests utilisent Chromium installé avec `npx playwright install chromium`. Pour utiliser Chrome déjà installé, définir `E2E_BROWSER_PATH` avec le chemin de son exécutable. Pour voir le parcours : `npm run test:e2e -- --headed`. Les identifiants par défaut sont :

- Nom d'utilisateur : `yaghoub`
- Mot de passe : `36485606`

Si les identifiants ont été modifiés, ils peuvent être fournis avec les variables d'environnement suivantes :

```powershell
$env:E2E_USERNAME = "votre-utilisateur"
$env:E2E_PASSWORD = "votre-mot-de-passe"
npm run test:e2e
```

## Génération de l'installateur Windows

```bash
npm run dist
```

L'installateur est généré dans le dossier `dist/`.

## Données locales

Les données sont stockées dans **SQLite**, dans `database/school-data.sqlite` : à côté de `server.js` en mode serveur, et dans le répertoire `userData` d'Electron en mode bureau.

Au premier lancement, le fichier `database/school-data.json` existant est importé automatiquement dans une transaction. Le JSON original reste intact, mais les modifications suivantes sont enregistrées uniquement dans SQLite. Un JSON invalide bloque la migration avec une erreur : il n'est jamais remplacé silencieusement par une base vide. Les lancements suivants utilisent directement SQLite.

Chaque collection possède sa table (élèves, paiements, employés, dépenses, examens, classes), avec une ligne par enregistrement. Les champs sont conservés en JSON dans les lignes pour préserver les champs facultatifs et les résultats d'examens imbriqués. Les identifiants sont des clés primaires ; les validations métier restent dans `db.js`. Chaque opération recharge un état cohérent sous transaction et seules les lignes modifiées sont écrites. Les collections sont analysées à la première lecture : une opération ne paie que les collections qu'elle touche, et seules celles-ci sont réécrites. Les sauvegardes et la migration écrivent toujours l'ensemble.

`GET /api/data` ne renvoie pas les examens, que l'interface lit déjà via `GET /api/exams`.

L'effacement des données crée d'abord une copie SQLite cohérente dans `database/backups/`. Pour une sauvegarde manuelle, arrêter complètement l'application avant de copier la base (ne pas copier seulement le fichier principal pendant son utilisation en mode WAL).

Tests de migration, de persistance et de transactions : `node --test tests/db.test.js`.

Les élèves portent aussi `status`, `leaveDate`, `discountType`, `discountValue` et `discountReason` (voir « Calcul des frais dus »). Ils ne portent plus de tarif : `registrationFee`, `monthlyFee` et `feeHistory` sont retirés des fiches à la lecture, les frais étant désormais lus dans les réglages et dans le niveau.

Les bases de données, sauvegardes, journaux, fichiers `.env`, résultats de tests et fichiers de compilation sont exclus du dépôt Git par `.gitignore`.

## Calcul des frais dus

Le moteur de calcul est dans `public/fees.js`, partagé par l'interface et le serveur.

**Période d'inscription.** Un élève n'est facturé que des mois compris entre son mois d'inscription et son mois de départ. Un élève inscrit en février ne doit rien pour octobre à janvier ; ces mois apparaissent dans son relevé avec la mention « خارج فترة القيد ». Le champ **حالة الطالب** (نشط, منقطع, محوَّل, متخرج) et le champ **تاريخ المغادرة** arrêtent les frais mensuels : le mois du départ reste facturé, les suivants non. Un départ exige une date, et une date de départ exige un statut de départ.

**Origine des frais.** Les frais ne sont plus saisis élève par élève : l'écran **الإعدادات** s'ouvre sur l'onglet **الرسوم**, qui fixe un frais d'inscription annuel unique pour l'école, et l'onglet **الأقسام** fixe le frais mensuel de chaque niveau, constant sur toute l'année. Chaque montant dû est relu depuis ces valeurs, donc corriger un tarif dans les réglages vaut immédiatement pour tous les élèves concernés, mois déjà facturés compris. Un niveau sans tarif retombe sur **الرسوم الشهرية الافتراضية**.

**Formulaire des frais de l'élève.** Le formulaire n'affiche plus de champ de tarif : il rappelle les frais lus dans les réglages, puis présente une ligne par montant dû — frais d'inscription, puis chaque mois d'inscription de l'élève — avec trois réponses : **لم يدفع بعد**, **دفع المبلغ كاملا**, **دفع جزء من المبلغ**. Le choix partiel ouvre un champ de montant, strictement supérieur à zéro et strictement inférieur au montant dû. L'enregistrement envoie `POST /api/student-payments/batch` : un reçu par montant dû, validés ensemble contre le solde. Un montant déjà soldé est verrouillé (se corrige en supprimant son reçu dans le relevé), et si un mois plus ancien reste impayé, le formulaire prévient que l'affectation FIFO servira d'abord ce mois-là.

**Affectation des paiements.** Un paiement est un crédit sur le compte de l'élève, affecté automatiquement au plus ancien montant dû non soldé (FIFO), par date de paiement puis par identifiant. Un règlement couvrant trois mois solde donc bien les trois mois, quel que soit le mois indiqué sur le reçu. Le surplus restant reste au crédit de l'élève et n'est plus compté comme une dette. Le relevé de l'élève affiche, pour chaque montant dû, les factures qui l'ont couvert.

**Remises et exonérations.** Un élève peut porter une remise, en pourcentage ou en montant fixe mensuel, avec un motif (bourse, remise fratrie…). Elle s'applique aux frais mensuels, jamais aux frais d'inscription, et ne peut pas rendre un montant négatif. Le relevé sépare les frais bruts, la remise et le montant dû.

**Plafond des paiements.** Un paiement ne peut pas dépasser le solde encore
planifié pour l'année scolaire. Ce plafond empêche un trop-perçu tout en laissant
les familles régler volontairement les prochains mois à l'avance.

**Exigibilité mensuelle.** Le solde dû, les factures, les rapports et les avis
aux parents ne comptent que les frais d'inscription, le mois courant et les
mois antérieurs. Les mois suivants restent visibles dans l'échéancier et peuvent
être réglés volontairement à l'avance, sans être présentés comme une dette
actuelle.

Lorsqu'un reçu concerne un mois futur payé volontairement, son total s'étend
jusqu'au mois choisi seulement. Il affiche aussi le total déjà affecté à ce
mois, afin que `frais - payé = reste` soit directement vérifiable.

**Dates d'échéance.** Chaque mois échoit au jour d'inscription de ce mois, ramené au dernier jour si le mois est plus court.

Tests : `node --test tests/fees.test.js`.

## Tableau des frais dus

- **Vue totale.** Le sélecteur de frais propose « إجمالي المستحقات » : une ligne par élève avec le total de l'année, le plus ancien montant dû non soldé et le nombre de montants restants.
- **Tri et filtres.** Chaque en-tête trie la table (un second clic inverse l'ordre). Les filtres portent sur la classe, l'état (reste à payer, en retard, soldé, sans frais) et un reste minimum.
- **Ancienneté de la dette.** Une colonne indique le nombre de jours de retard, en trois niveaux au-delà de 30 et de 60 jours.
- **Export et impression.** Export Excel `.xlsx` natif de la vue filtrée, impression du relevé, et impression d'un avis par élève pour les parents avec le détail des mois impayés.
- **Volume.** La table affiche 300 lignes puis propose de tout afficher ; les champs de recherche sont temporisés.
- **Rapports.** La section des rapports résume les créances par classe et classe les vingt plus gros débiteurs avec le contact du tuteur.

## Structure principale

```text
main.js                 Processus principal Electron
preload.js              Pont sécurisé entre Electron et l'interface
server.js               Serveur HTTP et API locale
db.js                   Gestion de la base de données locale
public/index.html       Interface principale
public/fees.js          Moteur de calcul des frais dus (périodes, historique, affectation)
public/core.js          État partagé, API, dialogues et navigation
public/students.js      Élèves, formulaire des frais et relevé individuel
public/fees-ui.js       Tableau des frais, encaissements, exports et reçus
public/staff.js         Personnel, salaires et avances
public/reports.js       Dépenses, tableau de bord et rapports
public/settings.js      Onglets des réglages, frais, classes et mode
public/exams.js         Examens, modèles et bulletins
public/app.js           Démarrage et reprise de session
public/style.css        Styles de l'application
tests/e2e/              Tests end-to-end
playwright.config.js    Configuration Playwright
```

Les scripts du navigateur partagent leurs fonctions et leur état global. Leur
ordre de chargement dans `index.html` est explicite ; `app.js` démarre en dernier.
Ce découpage permet de consulter une fonctionnalité sans lire toute l'interface.
La carte de travail et les consignes concises pour les agents sont dans `AGENTS.md` ;
`CLAUDE.md` réutilise ce même guide. Les anciennes revues et analyses de refactoring
restent des références historiques, à confronter au code actuel.

## Dépôt

Le projet est publié sur GitHub :

https://github.com/abeidyaghoub-coder/scholar-app

## Données de démonstration

```bash
node scripts/seed-demo.js
```

Cette commande ajoute 144 élèves fictifs sur les 18 premières classes, 432 paiements scolaires, 12 employés, 36 salaires, 12 avances, 24 dépenses et 288 bulletins (deux examens, six matières). Les dates couvrent septembre à décembre 2026. Les identifiants `DEMO-…`, noms « تجريبي » et notes `[DEMO-V1]` identifient les données fictives.

Une sauvegarde SQLite est créée dans `database/backups/before-demo-….sqlite` avant chaque exécution. Les données existantes et identifiants de connexion sont conservés. Relancer le générateur complète les éléments manquants sans dupliquer ceux déjà présents. Les modèles de matières existants sont conservés.

Pour préparer un autre répertoire local : `node scripts/seed-demo.js /chemin/du/repertoire`. Le mode Electron utilise son répertoire `userData` ; le générateur cible par défaut le répertoire du serveur.

Test du générateur et de la sauvegarde : `node tests/seed-demo.test.js`.

### Frais officiels dans la base de production

```bash
npm run fees:apply -- --dry-run   # aperçu, rien n'est écrit
npm run fees:apply                # ou : node scripts/apply-fees.js [répertoire] [--dry-run]
```

Charge dans `database/school-data.sqlite` les frais mensuels officiels des 18 niveaux
(`scripts/official-fees.js` : الحضانة 400, التهجي 700, التحضيري et 2AF–6AF 800, 1AS–2AS 1000,
3AS–4AS 1400, 5C/5D/6C/6D 2000, 7C/7D 2500). Un niveau déjà présent garde sa fiche et ses
élèves et prend le frais officiel ; un niveau absent est ajouté ; les autres niveaux sont
laissés tels quels et listés dans le rapport (`kept`). Sauvegarde préalable dans
`database/backups/before-fees-….sqlite`. L'application peut rester ouverte ; recharger la
page ensuite. Le générateur de test réutilise la même liste.

Pour repartir de la liste officielle seule :

```bash
npm run fees:clear -- --dry-run   # aperçu
npm run fees:clear                # vide les niveaux, puis : npm run fees:apply
```

`scripts/clear-fees.js` supprime chaque niveau sans élève ; un niveau qui a encore des élèves
ne peut pas l'être (ils y sont rattachés) : son frais mensuel est mis à zéro et il est listé
(`zeroed`). Élèves, reçus, personnel et paramètres sont intacts ; sauvegarde préalable dans
`database/backups/before-clear-fees-….sqlite`.

### Base de test : une année en cours (fin février)

```bash
npm run seed:testing          # ou : node scripts/seed-testing.js [répertoire]
```

Le script reconstruit `database/testing/school-data.sqlite` (l'application peut rester ouverte ; recharger la page ensuite)
(sauvegarde préalable dans `database/testing/backups/`, paramètres et identifiants conservés,
base de production intouchée) :

- les 18 niveaux avec leurs frais mensuels : الحضانة 400, التهجي 700, التحضيري et 2AF–6AF 800,
  1AS–2AS 1000, 3AS–4AS 1400, 5C/5D/6C/6D 2000, 7C/7D 2500 ;
- 20 à 50 élèves par niveau (environ 600), quelques inscriptions tardives, départs et remises ;
- les reçus des mois écoulés jusqu'à février : la majorité des familles est à jour jusqu'en
  janvier, les autres ont des mois en retard, des paiements partiels ou rien du tout ;
- un معلم par classe de maternelle/primaire (6 000 par mois), des أساتذة au collège/lycée
  (150 l'heure), trois employés d'appui ; salaires d'octobre à janvier, quelques avances et
  paiements partiels, une partie de février déjà payée le 28 ;
- des dépenses mensuelles et deux examens (décembre, février).

La base de test enregistre sa **date de test** (dernier jour de février de l'année scolaire) :
à l'ouverture en وضع التجريب, l'application adopte cette date une fois sur l'appareil,
comme si elle avait été saisie dans الإعدادات ← وضع الاستخدام ; elle reste modifiable ou
effaçable. Même graine aléatoire, même base à chaque exécution.

## Copie web en lecture seule (préparation)

Voir `NOTES-WEB-READONLY.md` pour l'analyse. Ce dépôt fournit déjà :

- **Mode lecture seule** : `SCHOOL_READ_ONLY=1 npm run server` sert les mêmes écrans avec le
  badge « نسخة للعرض فقط », masque tout ce qui écrit (formulaires, تعديل / حذف / دفع) et refuse
  toute requête autre que GET (HTTP 405), connexion et déconnexion exceptées.
- **Instantané** : `db.snapshot()` = tout ce que le navigateur lit (paramètres publics,
  collections, examens), sans le mot de passe, avec `exportedAt`.
- **Synchronisation** : الإعدادات ← المزامنة مع الموقع — URL et jeton (jamais renvoyé au
  navigateur), bouton « مزامنة الآن » (`POST /api/sync-remote` → `POST <URL>` avec
  `Authorization: Bearer <jeton>`), « آخر مزامنة » et le nombre de fiches modifiées depuis
  (compteur dans la table `metadata`, hors des données de l'école). L'application Electron
  synchronise aussi à la fermeture (5 s maximum, silencieux hors ligne). Refusée en وضع التجريب.

### Le site (Vercel)

`api/[...path].js` est la seule fonction : elle reçoit l'instantané (`POST /api/sync`, jeton
`SYNC_TOKEN`, corps gzippé), le range dans Vercel Blob (privé) et sert `GET /api/mode`,
`/api/settings`, `/api/data`, `/api/departments`, `/api/exams` derrière une connexion
(`WEB_USERNAME` / `WEB_PASSWORD`, sessions signées de 12 h) ; tout le reste répond 405.
`public/` est servi tel quel par Vercel. `vercel.json` et `.vercelignore` évitent d'installer
Electron et d'envoyer les bases.

Essai local complet, sans compte Vercel : `WEB_PASSWORD=… SYNC_TOKEN=… npm run web:local`
(port 3790, instantané dans `database/web-snapshot.json`), puis dans le desktop
الإعدادات ← المزامنة : URL `http://127.0.0.1:3790/api/sync` + le jeton, « مزامنة الآن »,
et ouvrir `http://127.0.0.1:3790/`.

Déploiement :

1. Vercel → *Add New Project* → importer ce dépôt GitHub, framework *Other*, sans commande
   de build.
2. *Storage* → créer un **Blob store** et le lier au projet (`BLOB_READ_WRITE_TOKEN` est
   ajouté automatiquement).
3. *Settings → Environment Variables* : `WEB_PASSWORD` (mot de passe du site),
   `WEB_USERNAME` (facultatif, sinon l'identifiant du desktop), `SYNC_TOKEN` (long, aléatoire :
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).
4. Déployer, puis dans le desktop الإعدادات ← المزامنة مع الموقع : URL
   `https://<projet>.vercel.app/api/sync` + le même jeton, « مزامنة الآن ».
5. Ouvrir `https://<projet>.vercel.app/`, se connecter, vérifier reçus et relevés.

Test : `node --test tests/web-readonly.test.js` (desktop → fonction web locale → API lue).
Mode d'emploi pas à pas du déploiement et de l'exploitation : `DEPLOIEMENT-VERCEL.md`.

## Modes production et test

Dans **الإعدادات → onglet وضع الاستخدام**, choisir **وضع الإنتاج** ou **وضع التجريب**, puis cliquer sur le bouton de changement. Aucun mot de passe ni nouvelle connexion ne sont demandés à l’utilisateur déjà connecté. La page se recharge avec une nouvelle session pour éviter de conserver les formulaires du mode précédent. À la première création d'une base, seuls les paramètres de l'école et les identifiants de connexion sont repris ; aucun élève ni mouvement financier n'est copié.

- Production (mode initial) : `database/school-data.sqlite`. Les données déjà présentes restent à cet emplacement, y compris les éventuelles données de démonstration ajoutées auparavant.
- Test : `database/testing/school-data.sqlite`, avec ses propres sauvegardes dans `database/testing/backups/`.
- Sélection persistante : `database/application-mode.json`, exclu de Git.

Le bandeau **نسخة للتجريب فقط** apparaît en mode test sur la connexion, toutes les pages, les reçus et les relevés de notes. Le mode production affiche **وضع الإنتاج**. Les sessions ouvertes sont invalidées au changement de mode et les requêtes commencées avant le changement ne peuvent pas écrire dans l'autre base. Les bases ne sont ni fusionnées ni effacées lors du changement.

Le générateur CLI `scripts/seed-demo.js` conserve son fonctionnement existant : il cible la base de production du répertoire fourni, indépendamment du mode choisi dans l'interface.
