# School Accounts

Application Electron de gestion des comptes d'une école.

L'application permet de gérer les élèves, les frais scolaires, les employés, les salaires, les avances, les dépenses, les examens et les rapports financiers.

## Fonctionnalités

- Tableau de bord avec les indicateurs financiers et scolaires.
- Gestion des élèves et de leurs informations administratives.
- Suivi des frais d'inscription et des paiements mensuels.
- Gestion des employés, des salaires et des avances.
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

Chaque collection possède sa table (élèves, paiements, employés, dépenses, examens, classes), avec une ligne par enregistrement. Les champs sont conservés en JSON dans les lignes pour préserver les champs facultatifs et les résultats d'examens imbriqués. Les identifiants sont des clés primaires ; les validations métier restent dans `db.js`. Chaque opération recharge un état cohérent sous transaction et seules les lignes modifiées sont écrites.

L'effacement des données crée d'abord une copie SQLite cohérente dans `database/backups/`. Pour une sauvegarde manuelle, arrêter complètement l'application avant de copier la base (ne pas copier seulement le fichier principal pendant son utilisation en mode WAL).

Tests de migration, de persistance et de transactions : `node --test tests/db.test.js`.

Les bases de données, sauvegardes, journaux, fichiers `.env`, résultats de tests et fichiers de compilation sont exclus du dépôt Git par `.gitignore`.

## Structure principale

```text
main.js                 Processus principal Electron
preload.js              Pont sécurisé entre Electron et l'interface
server.js               Serveur HTTP et API locale
db.js                   Gestion de la base de données locale
public/index.html       Interface principale
public/app.js           Logique de l'interface
public/style.css        Styles de l'application
tests/e2e/              Tests end-to-end
playwright.config.js    Configuration Playwright
```

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

## Modes production et test

Dans **الإعدادات → وضع استخدام التطبيق**, choisir **وضع الإنتاج** ou **وضع التجريب**, puis saisir le mot de passe du mode courant. Le changement conserve les données de chaque mode et demande une nouvelle connexion. À la première création d'une base, seuls les paramètres de l'école et les identifiants de connexion sont repris ; aucun élève ni mouvement financier n'est copié.

- Production (mode initial) : `database/school-data.sqlite`. Les données déjà présentes restent à cet emplacement, y compris les éventuelles données de démonstration ajoutées auparavant.
- Test : `database/testing/school-data.sqlite`, avec ses propres sauvegardes dans `database/testing/backups/`.
- Sélection persistante : `database/application-mode.json`, exclu de Git.

Le bandeau **نسخة للتجريب فقط** apparaît en mode test sur la connexion, toutes les pages, les reçus et les relevés de notes. Le mode production affiche **وضع الإنتاج**. Les sessions ouvertes sont invalidées au changement de mode et les requêtes commencées avant le changement ne peuvent pas écrire dans l'autre base. Les bases ne sont ni fusionnées ni effacées lors du changement.

Le générateur CLI `scripts/seed-demo.js` conserve son fonctionnement existant : il cible la base de production du répertoire fourni, indépendamment du mode choisi dans l'interface.
