# Déploiement de la copie web en lecture seule sur Vercel (étape 5)

Objectif : un lien `https://<projet>.vercel.app` qui montre les mêmes écrans que
l'application de bureau, sans aucune possibilité d'écriture, alimenté par le
bouton « مزامنة الآن » du desktop. Durée : 20 à 30 minutes la première fois.

Prérequis : le dépôt GitHub `abeidyaghoub-coder/scholar-app` à jour sur `main`
(version ≥ 1.45.0), un compte GitHub, une adresse e-mail pour Vercel.

---

## 1. Créer le compte et importer le projet

1. Ouvrir <https://vercel.com/signup> → **Continue with GitHub** → autoriser Vercel
   à lire le dépôt (« Only select repositories » → choisir `scholar-app`).
2. Tableau de bord Vercel → **Add New… → Project** → ligne `scholar-app` → **Import**.
3. Écran *Configure Project* :
   - **Framework Preset** : `Other`.
   - **Root Directory** : laisser `./`.
   - **Build and Output Settings** : ne rien cocher (pas de build ; `vercel.json` du
     dépôt fixe déjà `ELECTRON_SKIP_BINARY_DOWNLOAD=1` pour l'installation).
   - **Environment Variables** : à remplir maintenant (voir § 2) ou après.
4. **Deploy**. Le premier déploiement dure 1 à 2 minutes. Le lien
   `https://scholar-app-<xxxx>.vercel.app` s'affiche ; il répond mais refuse la
   connexion tant que les variables du § 2 manquent.

## 2. Variables d'environnement

Projet → **Settings → Environment Variables** → *Add* pour chacune, environnement
**Production** (cocher aussi *Preview* si tu veux tester des branches).

| Nom | Valeur | Rôle |
| --- | --- | --- |
| `WEB_PASSWORD` | mot de passe choisi pour le site | demandé à l'écran de connexion du site |
| `WEB_USERNAME` | facultatif, ex. `yaghoub` | identifiant du site ; à défaut, celui du desktop (`settings.username`) |
| `SYNC_TOKEN` | chaîne longue et aléatoire | le desktop doit présenter exactement cette valeur pour pousser l'instantané |
| `WEB_SESSION_SECRET` | facultatif, chaîne aléatoire | signe les sessions ; sinon dérivé des deux précédentes |

Générer un jeton : dans un terminal du poste,

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Conserver `SYNC_TOKEN` : il sera ressaisi dans le desktop (§ 4). Ne jamais le
mettre dans le dépôt ni dans un message.

Après tout ajout ou changement de variable : **Deployments → ⋯ → Redeploy**
(les fonctions lisent les variables au démarrage).

## 3. Stockage de l'instantané (Vercel Blob)

1. Projet → **Storage → Create Database → Blob** → nom libre (ex. `school-snapshot`)
   → **Create**.
2. **Connect Project** → choisir `scholar-app`, environnements *Production* (+ *Preview*)
   → **Connect**. Vercel ajoute lui-même `BLOB_READ_WRITE_TOKEN` aux variables.
3. **Redeploy** (même chemin qu'au § 2).

Vérification : ouvrir `https://<projet>.vercel.app/api/mode` → doit répondre
`{"mode":"production","label":"وضع الإنتاج","version":"1.45.0","readOnly":true,"syncedAt":""}`.
`syncedAt` vide = aucun instantané encore reçu, c'est normal.

## 4. Relier le desktop

Dans l'application de bureau (وضع الإنتاج, pas وضع التجريب — la synchro y est refusée) :

1. **الإعدادات → المزامنة مع الموقع**.
2. **رابط المزامنة** : `https://<projet>.vercel.app/api/sync`
   (bien `/api/sync` à la fin, en `https`).
3. **رمز المزامنة** : coller `SYNC_TOKEN`.
4. **كلمة المرور الحالية** : mot de passe du desktop → **حفظ إعدادات المزامنة**.
5. **مزامنة الآن** → message « تمت المزامنة: N سجلًا ». « آخر مزامنة » se remplit,
   « التغييرات منذ آخر مزامنة » repasse à 0.

Messages possibles et remèdes :

| Message | Cause | Remède |
| --- | --- | --- |
| رمز المزامنة غير صحيح | jeton différent entre Vercel et le desktop | recopier `SYNC_TOKEN`, redéployer si modifié côté Vercel |
| رفض الموقع المزامنة (HTTP 500) | Blob non lié ou `BLOB_READ_WRITE_TOKEN` absent | § 3, puis Redeploy |
| تعذر الاتصال بالموقع / انتهت مهلة الاتصال | pas d'internet, URL fausse, pare-feu | vérifier l'URL dans un navigateur (`/api/mode`) |
| المزامنة متاحة في وضع الإنتاج فقط | l'app est en وضع التجريب | repasser en وضع الإنتاج |

Ensuite, l'agent de saisie clique « مزامنة الآن » quand il a saisi beaucoup de
données ; l'application synchronise aussi seule à la fermeture (5 s maximum,
silencieux hors ligne). Rien ne revient jamais du site vers le desktop.

## 5. Vérifier le site

1. `https://<projet>.vercel.app/` → écran de connexion avec le badge
   « نسخة للعرض فقط ».
2. Se connecter avec `WEB_USERNAME` (ou l'identifiant du desktop) et `WEB_PASSWORD`.
3. Contrôler : tableau de bord (effectifs, totaux), الطلاب (liste, كشف الحساب, impression
   d'un reçu), الرسوم الشهرية, الموظفون, الامتحانات (كشف نقاط), التقارير (mois + impression).
   Aucun formulaire ni bouton تعديل / حذف / دفع ne doit apparaître ; la version en pied
   de page est celle du `package.json`.
4. Modifier une fiche dans le desktop, « مزامنة الآن », recharger le site : la
   modification apparaît (au plus 5 s de cache côté fonction).

## 6. Exploitation

- **Changer le mot de passe du site** : Settings → Environment Variables →
  `WEB_PASSWORD` → Save → Redeploy. Les sessions ouvertes expirent d'elles-mêmes (12 h).
- **Révoquer la synchro** (poste compromis) : changer `SYNC_TOKEN` → Redeploy → ressaisir
  dans le desktop.
- **Nom de domaine** : Settings → Domains → ajouter (facultatif). Mettre alors à jour le
  رابط المزامنة dans le desktop.
- **Mises à jour** : chaque `git push` sur `main` redéploie le site automatiquement ; le
  desktop et le site partagent `public/`, donc une évolution d'écran est visible des deux
  côtés dès la version suivante.
- **Journal** : Vercel → Deployments → *Functions* → logs de `api/[...path]` (seules les
  erreurs 500 y sont écrites).
- **Limites du plan gratuit (Hobby)** : usage non commercial, 100 Go de bande passante et
  1 Go de Blob par mois — l'instantané pèse ~0,15 Mo gzippé, ~2 Mo stocké : très loin des
  limites. Si Vercel exige le plan Pro (20 $/mois), Deno Deploy est l'alternative notée
  dans `NOTES-WEB-READONLY.md`.

## 7. Essai sur la machine avant Vercel (facultatif)

```bash
WEB_PASSWORD=essai SYNC_TOKEN=essai-jeton npm run web:local
```

Site local sur `http://127.0.0.1:3790`, instantané dans `database/web-snapshot.json`.
Dans le desktop : URL `http://127.0.0.1:3790/api/sync`, jeton `essai-jeton`,
« مزامنة الآن », puis ouvrir `http://127.0.0.1:3790/` (identifiant du desktop, mot de
passe `essai`). Même code que sur Vercel, seul le stockage change (fichier au lieu de Blob).
