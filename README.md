# CMH Academy — socle local

## Suivi documentaire des stagiaires

La branche `feat/suivi-documents-stagiaires` étend les dossiers, versions et
partages existants : tableau ADMIN « Suivi des documents », rubrique stagiaire
« Mes documents », dépôt privé et correction/validation par version.
La migration est préparée, sans application à une base existante ni déploiement.
Voir [le fonctionnement, les tests isolés et la recette manuelle](backend/docs/suivi-documents-stagiaires.md).

## Démonstration Camille

La branche `feat/demo-camille` prépare une démonstration fictive indépendante,
avec formatage français commun, frontend de production, base PostgreSQL et
stockage privés dédiés. Voir [la procédure de déploiement et le scénario](deploy/README.md).
Les configurations remplies, médias, sauvegardes et accès privés restent hors Git.

## Vidéos et replays — branche de développement

Gestion ADMIN de MP4 privés par version, lecteur protégé avec Range/HEAD,
transcription et progression toujours déclarative. La migration
`20261111180000_videos_pedagogiques` a été appliquée à `cmh_academy_dev` après
sauvegarde conjointe et restauration isolée vérifiée : quatorze migrations
terminées, aucune divergence, aucune vidéo créée automatiquement.
Voir [les formats, limites et tests isolés](backend/docs/videos-pedagogiques.md).
Le dépôt contient le code ; aucun fichier vidéo ni stockage privé n'est versionné.

## Point de sauvegarde GitHub — 11 novembre 2026

Ce point de sauvegarde couvre le catalogue, l'administration, les inscriptions,
les dossiers et pièces jointes, l'espace stagiaire, les questionnaires, les
présences, les attestations et le premier bloc e-learning (modules, leçons,
supports PDF privés et progression déclarative). Les vidéos sont hors périmètre.
Voir [le guide pédagogique](backend/docs/contenu-pedagogique.md).

Contrôles avant publication : lint et build frontend, syntaxe des 80 fichiers
JavaScript backend, suite complète `npm run test:elearning` et tests SQL
`npm run test:elearning:schema`, exécutés sur des clusters PostgreSQL isolés.
Les fichiers candidats ont été contrôlés pour les secrets et données privées.
Les rapports bruts, données de test, documents déposés et sauvegardes restent
locaux et ignorés par Git. Le dépôt contient le code et les migrations, pas une
sauvegarde des données. Aucun déploiement ni modification de `cmh_academy_dev`
n'a été effectué pour cette sauvegarde GitHub.

La migration pédagogique est préparée mais reste non appliquée à la base de
développement. Ne pas lancer les scripts `apply-*-local`, un seed ou une
migration sur une base existante pour simplement restaurer ce code.

Le [catalogue public](http://127.0.0.1:5173/formations) propose des cartes et des
fiches `/formations/:slug`, réservées aux formations publiées. Les sessions sont
masquées par défaut et leur visibilité se choisit explicitement dans l'administration.
Voir [le guide du catalogue public](backend/docs/catalogue-public.md).

**Catalogue → Sessions** permet de préparer les informations pratiques, plusieurs
séances en Europe/Paris et les accès privés de visioconférence séparés.
Voir [le guide Sessions et les tests isolés](backend/docs/admin-sessions.md).

**Catalogue → Formations** est disponible dans l'administration : brouillons,
associations, tarification exacte, publication explicite et contrôle des conflits.
Voir [le guide Formations](backend/docs/admin-formations.md). Aucun changement
de schéma nécessaire pour cette étape.

Le premier bloc d'administration du catalogue est disponible : **Pôles et
Formateurs**, avec lecture, création et modification, sans suppression.
Voir [le guide et les tests](backend/docs/admin-catalogue.md).

L'authentification administrateur est disponible sur `/admin/connexion`.
Aucun compte n'a été créé automatiquement. Depuis `backend`, lancer
`npm run admin:create` dans un terminal interactif pour choisir votre email et
votre mot de passe (saisie masquée). Voir
[le guide d'authentification](backend/docs/authentification.md) pour les routes,
la configuration, la sauvegarde et les tests isolés.

Le modèle du catalogue est décrit dans [backend/docs/catalogue.md](backend/docs/catalogue.md).
La migration a été **appliquée à la base locale de développement** le 24 octobre
2026 après sauvegarde et restauration de contrôle : voir
[le compte rendu](backend/docs/catalogue-application-locale.md).

Les essais SQL réels sur une instance indépendante sont documentés dans
[backend/docs/catalogue-tests.md](backend/docs/catalogue-tests.md).
Pour les reproduire depuis `backend` : `npm run test:catalogue` (PostgreSQL 18
installé localement). Cette commande crée une instance dédiée et ne charge pas
le fichier `.env` de la base actuelle.

Frontend React/Vite, API Express et PostgreSQL via Prisma. Node.js 24 et npm
permettent d'utiliser les scripts existants. Aucun déploiement n'est prévu ici.

## Démarrage

Depuis la racine, dans deux terminaux PowerShell :

```powershell
cd backend
npm ci
npm run dev
```

```powershell
cd frontend
npm ci
npm run dev
```

Le backend lit `backend/.env`, où `DATABASE_URL` doit désigner la base existante
avec le rôle `cmh_app`. Garder ce fichier local et confidentiel. Si le client
Prisma généré manque après installation, exécuter `npx prisma generate` dans
`backend`. Ne pas lancer de migration, de seed ou de `db push` pour cette étape.

Ouvrir l'adresse locale affichée par Vite (normalement http://localhost:5173).
Le proxy `/api` de Vite cible http://localhost:3001 : conserver ce port pour
l'API lors du développement avec la configuration actuelle.

## Lecture du catalogue

`GET /api/formations` renvoie `{ "formations": [...] }` avec seulement `id`,
`titre` et `description`, pour les lignes où `publiee = true`, triées par titre
puis identifiant. Les brouillons restent privés. Une erreur de lecture renvoie
HTTP 503 et un message générique. Les cartes utilisent désormais la route enrichie
`GET /api/catalogue/formations` et les fiches `GET /api/formations/:slug` ;
aucun identifiant PostgreSQL ni client Prisma ne se trouve dans le frontend.

Les pôles de la page publique restent une présentation statique. Les outils
d'administration du catalogue sont réservés aux comptes actifs de rôle ADMIN.
Les sessions explicitement visibles apparaissent uniquement sur la fiche d'une
formation publiée ; les accès privés restent exclus des réponses publiques.

## Vérification

```powershell
cd frontend
npm run lint
npm run build
```

Test manuel :

1. Démarrer PostgreSQL, Express et Vite puis ouvrir « Nos formations ».
2. Dans l'onglet Réseau du navigateur, vérifier `GET /api/formations` : HTTP 200,
   avec les formations publiées réellement présentes dans la base. Comparer les
   titres/descriptions affichés à la réponse. Une base sans formation publiée
   doit afficher « Aucune formation disponible pour le moment » ; ne pas créer
   ou publier de données uniquement pour ce test.
3. Ralentir le réseau et actualiser pour voir « Chargement des formations… ».
4. Arrêter le backend puis actualiser : le message d'indisponibilité doit
   apparaître, sans détail technique. Relancer le backend puis actualiser pour
   retrouver le catalogue. Le délai maximal côté React est de 10 secondes.

Les états vide et erreur peuvent aussi être simulés via les outils du navigateur,
en remplaçant la réponse HTTP, sans toucher à la base.
