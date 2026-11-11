# Démonstration CMH Academy pour Camille

Branche dédiée : `feat/demo-camille`, depuis le commit vidéo validé `728dba0`.
Ne pas fusionner automatiquement dans `main`. Aucun changement de schéma n'est
nécessaire pour cette étape et aucune donnée de `cmh_academy_dev` n'est utilisée.

## Hébergement retenu

Railway, environnement `demonstration`, région Europe, une instance applicative
Express/React et une instance PostgreSQL 18. Cible publique :
<https://cmh-academy-demo-demonstration.up.railway.app>.
Les identifiants de ressources, sans secrets, sont dans `railway-demo.json`.

Utilisation autorisée : **crédits d'essai gratuits uniquement**. Aucun abonnement
payant n'est activé. Railway prévoit 5 USD d'essai au maximum pendant 30 jours ;
l'application peut s'arrêter lorsque ces crédits expirent ou sont épuisés.
Le solde exact est à surveiller dans le compte Railway. Ne pas convertir l'essai
en offre Hobby ou activer une facturation sans nouvel accord.
Voir [l'essai gratuit](https://docs.railway.com/pricing/free-trial).

Ressources limitées à une réplique et 0,5 Go de mémoire / 1 vCPU par service.
Volume PostgreSQL de 256 Mo et volume privé de 128 Mo ; la démonstration n'est
pas destinée à stocker de longues vidéos ou à subir des tests de charge.
La limite de dépôt vidéo de cette démonstration est de 50 Mio par fichier.
Tous les objets déposés, versions retirées comprises, occupent ce volume.

L'URL HTTPS est gérée par Railway. Le service PostgreSQL n'a **aucun proxy TCP
public**. Sa base s'appelle `cmh_academy_demo`, accessible seulement par le réseau
privé depuis l'application. Le disque privé est monté sur `/data`, le stockage
applicatif sur `/data/private`. Les volumes Railway sont montés en root :
`RAILWAY_RUN_UID=0` est explicitement configuré pour cette image, conformément
à leur [documentation des volumes](https://docs.railway.com/volumes#permissions).
Ce choix de démonstration reste à durcir avant une mise en production durable.

## Configuration privée

Les mots de passe et clés sont configurés comme variables Railway, jamais dans
le dépôt, une URL ou une page publique. Les informations permettant de présenter
les comptes sont conservées uniquement dans `.demo-secrets/access.json` sur le
poste de préparation. Communiquer les mots de passe à Camille par un canal privé,
jamais dans un commit, le scénario public, les logs ou une capture d'écran.

Comptes fictifs :

| Espace | Adresse fictive | Page |
| --- | --- | --- |
| Administration | `administration@demo.invalid` | `/admin/connexion` |
| Stagiaire principal | `alice@demo.invalid` | `/stagiaire/connexion` |
| Autre stagiaire, test d'isolation | `leo@demo.invalid` | `/stagiaire/connexion` |

Les mots de passe sont aléatoires, distincts et d'au moins 16 caractères. Aucun
email n'est envoyé. Les demandes de préinscription publiques sont désactivées
dans ce mode pour éviter la saisie de coordonnées personnelles.

Variables principales :

- `DEMO_MODE=true`, `DEMO_DATABASE_NAME=cmh_academy_demo`.
- `DATABASE_URL` : référence privée à la base PostgreSQL dédiée. Jamais la base
  locale de développement ni sa base shadow.
- `SESSION_SECRET` aléatoire et privé ; `APP_ORIGINS` limité exactement à l'origine
  HTTPS de démonstration.
- `NODE_ENV=production`, `SERVE_FRONTEND=true`, `TRUSTED_PROXY=1`, `PORT=3001`.
- `DOCUMENT_STORAGE_DIR=/data/private`, `VIDEO_FFPROBE_PATH=/usr/bin/ffprobe`,
  `DEMO_FFMPEG_PATH=/usr/bin/ffmpeg`.
- `DEMO_ADMIN_PASSWORD`, `DEMO_STUDENT_PASSWORD`, `DEMO_OTHER_PASSWORD` uniquement
  pour l'initialisation explicite ; leurs valeurs ont été vidées du service
  après création des comptes. Les mots de passe des comptes restent conservés
  uniquement dans le fichier privé local pour les accès de présentation.

Le frontend et l'API partagent la même origine : aucun CORS permissif n'est
nécessaire. Cookies `__Host-`, Secure, HttpOnly et SameSite=Lax ; CSRF et origine
vérifiés sur les écritures. CSP, interdiction d'intégration par un autre site,
API privées non mises en cache, fichiers privés hors racine statique.

## Construction et initialisation explicite

Le Dockerfile construit Vite puis installe l'API, Prisma et ffmpeg/ffprobe sous
Node.js 24 / Debian Trixie. Le client Prisma est généré sans accès à une base.
`.dockerignore` exclut secrets, données, sauvegardes, médias et dépendances locales.

Première mise en route, après configuration des variables et volumes :

```sh
node scripts/migrate-demo.mjs
node scripts/seed-demo.mjs --confirm-demo-only
node server.js
```

Le déploiement initial peut utiliser cette chaîne explicite dans la commande de
démarrage. Après succès, remplacer cette commande par **`node server.js`** pour
que les redémarrages ordinaires ne migrent pas et ne réinitialisent pas les données.
Les opérations utilisent `prisma.demo.config.ts`, qui ne charge ni `.env` local
ni base shadow. Le garde-fou refuse `cmh_academy_dev` et exige le nom exact de
la base de démonstration. Aucun reset, `db push` ou migration de développement.

Le seed refuse une base non vide qu'il ne reconnaît pas. Une seconde exécution
sur le jeu déjà présent ne remplace ni les comptes, ni les fichiers, ni la
progression. La vidéo est une mire animée avec son de synthèse de 12 secondes,
créée par FFmpeg ; le PDF a été rédigé pour cette démonstration. Aucun média tiers,
document déposé réel ou donnée personnelle.

Jeu créé : un organisme fictif, un pôle, un formateur fictif, une formation de
14 h, deux sessions de quatre séances de 3 h 30, deux modules et trois leçons,
deux inscriptions confirmées, PDF partagé + support pédagogique PDF, vidéo MP4,
questionnaire de positionnement et progression partielle. Les séances de la
première session sont passées et totalisent 12 h de présence renseignée sur 14 h.
La seconde session illustre les dates à venir. Les dates sont choisies à la
première initialisation, puis conservées telles quelles.

PostgreSQL utilise la commande `docker-entrypoint.sh postgres -c shared_buffers=32MB -c max_connections=40`.
L'appel explicite à l'entrypoint officiel initialise le volume puis abandonne
les privilèges root avant de lancer PostgreSQL. La commande applicative ordinaire
est désormais `node server.js` : migrations et seed ne sont pas relancés.

## Présentation et dates

`shared/format-fr.mjs` centralise dates longues, horaires et durées en français,
en Europe/Paris, pour catalogue, administration, espace stagiaire et PDF.
Exemples : `4 novembre 2026`, `09 h 00 – 12 h 30`, `3 h 30`, `14 h`, `45 min`.
Le changement d'heure ambigu est distingué en « heure d'été » / « heure d'hiver ».
Aucune conversion d'affichage ne modifie les instants stockés.

La durée pédagogique annoncée, les heures programmées, la présence manuelle et
la progression déclarative restent distinctes. Le modèle PDF devient
`cmh-attestation-2` ; les PDF déjà émis et leur historique ne sont pas régénérés.
La mention discrète « Environnement de démonstration » apparaît sur toutes les
pages lorsque le mode est actif. Les onglets et navigations sont contextualisés.

## Redémarrage et contrôle

Redémarrer **uniquement le service applicatif** depuis Railway, sans détacher ou
supprimer ses volumes et sans redémarrer la base pour ce contrôle.
L'URL et les secrets restent identiques. Vérifier ensuite :

- `/api/health` et `/api/health/database`.
- Les connexions existantes, la progression déclarée, PDF et vidéo par SHA-256.
- `/api/admin/demonstration/etat`, avec une session ADMIN : 14 migrations et
  empreintes conformes, trois comptes, deux inscriptions, trois leçons, une vidéo
  et trois objets privés référencés, audit sans anomalies. Cette route n'existe
  que dans le mode démonstration et n'est jamais publique.

Les tests sur URL réelle utilisent les comptes fictifs du fichier privé :

```powershell
cd backend
node scripts/test-demo-deployed.mjs
# Redémarrer le service applicatif, puis :
node scripts/test-demo-deployed.mjs --after-restart
```

Les cookies et rapports de test sont conservés sous `.demo-secrets` et
`.demo-environment`, hors Git. Le deuxième test ferme les sessions par les
déconnexions normales après vérification de la persistance.

## Sauvegarde conjointe et restauration

Une sauvegarde fiable comprend **la base complète et le volume privé ensemble**,
y compris les versions retirées. Ne pas prendre un dump et des objets à des
moments différents pendant des dépôts actifs.

1. Prévoir une courte indisponibilité et arrêter l'application depuis Railway,
   sans supprimer le service ni son volume. Garder PostgreSQL actif.
2. Dans le service PostgreSQL, via un terminal Railway/SSH autorisé, exécuter
   `pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /var/lib/postgresql/demo.dump`.
   Le client du conteneur a la même version majeure 18 que le serveur.
3. Télécharger ce dump et le répertoire privé `/private` du volume applicatif
   dans un dossier de sauvegarde local confidentiel. La CLI Railway fournit
   `railway volume files download` ; sélectionner explicitement projet,
   environnement et volume avant toute opération. Ne jamais afficher les secrets.
4. Calculer un manifeste de tailles et SHA-256 des objets ainsi que du dump.
   Ranger manifeste et sauvegarde hors Git. Redémarrer l'application.
5. Pour vérifier une restauration, créer un **autre environnement isolé**, restaurer
   le dump avec `pg_restore --exit-on-error --no-owner --no-acl`, copier tous les
   objets, puis comparer données et empreintes et exécuter l'audit du stockage.
   Ne jamais restaurer ce jeu dans `cmh_academy_dev` ou sur le jeu de démonstration
   actif. Aucun effacement automatique n'est prévu.

Cette procédure distante est documentée ; ne la présenter comme exécutée que si
un rapport de sauvegarde/restauration correspondant existe. Les tests isolés
vérifient la conservation des fichiers après redémarrage applicatif.

## Tests et limites

Vérification sur l'URL HTTPS réelle le 11 novembre 2026 :

- Catalogue et fiche publiés, bandeau, titres d'onglets et navigation active.
- Connexions ADMIN/STAGIAIRE, cookie Secure/HttpOnly/SameSite, gestion pédagogique.
- Heures de Paris, 14 h pédagogiques/programmées et 12 h de présence distinguées.
- Lecture réelle de la vidéo synthétique, déplacement à 8 secondes, commandes
  clavier, transcription et largeur mobile de 390 px sans débordement.
- PDF protégé, vidéo GET/HEAD/Range 206, plage hors limites 416 ; refus anonyme
  et autre stagiaire, absence de données privées dans la fiche publique.
- Progression déclarée explicitement ; lecture seule sans modification.
- Redémarrage effectif de l'application, sessions et progression conservées,
  fichiers PDF/vidéo identiques par SHA-256, déconnexions des deux rôles et
  accès révoqués. Quatorze migrations et empreintes conformes, trois comptes,
  deux inscriptions, trois leçons, une version vidéo, trois fichiers référencés,
  ffprobe 7.1 disponible et audit sans anomalie.

Rapports locaux confidentiels : `.demo-environment/deployed-results.json` et
`.demo-environment/deployed-after-restart-results.json` (hors Git).
La vérification READ ONLY de la base locale a confirmé les empreintes inchangées
des huit lignes métier relevées après l'étape vidéo, et quatorze migrations.

Régressions isolées réellement exécutées : `test:videos:browser` (78 groupes),
`test:attestations` (59 groupes), `test:demo`, `test:format`, lint et build.
La commande de référence pour la recette vidéo navigateur reste
`npm run test:videos:browser`.

Incidents de préparation corrigés : commande PostgreSQL initiale inadaptée et
démarrage applicatif avant disponibilité de la base. Les essais navigateur
lancés pendant la stabilisation ont été relancés avec succès. Les deux services
finaux sont en ligne ; un ancien déploiement échoué reste visible dans l'historique.

Avant publication : lint, build, tests de format (hiver/été et heure ambiguë),
suite complète `test:videos:browser`, test isolé `test:demo`, contrôles des secrets
et des exclusions. Le PDF d'aperçu est aussi extrait et rendu pour inspection.

Après publication, le rapport doit distinguer les contrôles réellement passés
sur l'URL publique des essais isolés. Appareils physiques iOS/Android, tests de
charge et audit de sécurité exhaustif restent hors périmètre. Un avertissement
`pg` préexistant peut apparaître sans échec fonctionnel.

Les fichiers `compose.demo.yaml`, `Caddyfile`, `Start-Demo.ps1` et `Backup-Demo.ps1`
préparent également une alternative sur serveur Docker ou poste local séparé.
Le moteur Docker local n'était pas disponible lors de la préparation. Le tunnel
Cloudflare envisagé avant la connexion Railway n'a pas été publié et ne constitue
pas l'hébergement retenu.

## Scénario de présentation — environ 8 minutes

1. **1 min — Catalogue public.** Présenter la formation, le programme, la durée
   pédagogique et les dates en heure de Paris ; signaler le bandeau de démonstration.
2. **2 min — Administration.** Se connecter en ADMIN, montrer les sessions, les
   quatre séances, l'inscription confirmée et son dossier. Distinguer les 14 h
   programmées des 12 h de présence renseignée.
3. **1 min — Contenu pédagogique.** Ouvrir les deux modules et trois leçons,
   montrer le support et l'aperçu vidéo. Ne pas déposer de document personnel.
4. **2 min — Espace stagiaire.** Se connecter dans un autre profil, ouvrir la
   formation, le PDF partagé et le parcours. Lire puis avancer dans la vidéo,
   ouvrir la transcription ; constater que la lecture seule ne termine rien.
5. **1 min — Suivi.** Déclarer une leçon terminée, actualiser, consulter le
   questionnaire et expliquer la séparation entre progression, présence et acquis.
6. **1 min — Confidentialité et fin.** Expliquer que les liens privés exigent la
   bonne session, puis se déconnecter des deux espaces. Ne pas afficher le fichier
   contenant les mots de passe pendant la présentation.
