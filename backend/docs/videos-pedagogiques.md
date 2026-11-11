# Vidéos et replays privés des leçons

Implémentation sur `feat/videos-pedagogiques`, depuis le socle pédagogique.
La migration `20261111180000_videos_pedagogiques` a été **appliquée localement
le 11 novembre 2026**, après sauvegarde PostgreSQL/stockage privé conjointe et
restauration vérifiée sur cluster isolé. Quatorze migrations sont terminées,
sans divergence ni création automatique de vidéo. Aucun jeu de démonstration
n'a été injecté dans cette base et aucun déploiement n'a été effectué.
Le démarrage de l'application ne lance jamais de migration.

## Gestion et conservation

Dans Catalogue → Formations → Contenu pédagogique, sélectionner une leçon
enregistrée. La section « Vidéo ou replay MP4 » permet l'ajout, le remplacement
et le retrait, chacun après confirmation. Enregistrer d'abord les modifications
textuelles et PDF. Le fichier et les informations saisis sont conservés après
une erreur ; un conflit demande de recharger explicitement le parcours.

Une leçon possède au plus une version active. Les versions sont immuables :
modifier le titre, la description ou la transcription demande un remplacement.
L'historique ADMIN indique version, auteur/date du dépôt et auteur/date de retrait.
Les anciens objets et leurs métadonnées restent disponibles à ADMIN, y compris
après retrait. Ils ne sont pas rétablis automatiquement par un rejeu de dépôt.
L'aperçu pédagogique ADMIN existant intègre le même lecteur.

La transaction de remplacement retire la version précédente et crée la nouvelle
ensemble. La révision globale du parcours protège aussi les modifications
simultanées de modules, leçons et PDF. La clé UUID de dépôt et l'empreinte du
fichier rendent le rejeu exact idempotent ; changer de fichier ou d'informations
crée une nouvelle tentative. Si une réponse est perdue après commit, réessayer
sans changer le fichier ni les champs. Une interruption après réception complète
peut avoir déjà enregistré une version : actualiser et vérifier l'historique.

Les dépôts utilisent le même `DOCUMENT_STORAGE_DIR`, les temporaires `.part`,
les noms UUID et la promotion exclusive des documents existants. Le pipeline
ferme le fichier avant le nettoyage en cas de transfert interrompu. Un échec
confirmé nettoie temporaire et objet non référencé ; un commit au résultat
incertain conserve l'objet pour l'audit plutôt que de risquer une perte.

## Formats, taille et configuration

- MP4 non fragmenté, avec atome `moov` avant `mdat` (« faststart »).
- Une piste vidéo H.264 8 bits `yuv420p`, balise `avc1` ou `avc3`.
- Zéro ou une piste audio AAC (`mp4a`). Pas de piste supplémentaire, DRM,
  HEVC, AV1, MOV, WebM ou playlist externe. Durée positive, au plus 24 heures.
- Titre obligatoire : 160 caractères. Description facultative : 3 000 caractères.
  Transcription textuelle facultative : 30 000 caractères. Texte brut uniquement.
- `VIDEO_MAX_FILE_BYTES` : **536 870 912 octets (512 Mio)** par défaut.
  Entier de 1 à 2 147 483 647, affiché à l'ADMIN depuis la configuration serveur.
  Les 50 versions maximum par leçon incluent les versions retirées.
- `VIDEO_FFPROBE_PATH` : chemin du binaire système `ffprobe`, ou `ffprobe` dans
  `PATH`. Installer une version maintenue de FFmpeg/ffprobe (6.1 ou ultérieure),
  à maintenir avec les correctifs de son fournisseur. Son absence refuse le
  dépôt avec 503 et ne bloque pas les autres fonctionnalités. Elle est signalée
  explicitement au démarrage du backend et dans le formulaire ADMIN, où le dépôt
  est désactivé. Les réponses ne divulguent pas le chemin du binaire.

Aucun binaire d'analyse n'est une dépendance de production npm. Le paquet
`ffmpeg-ffprobe-static`, fixé à une version précise dans les dépendances de
développement, sert uniquement aux fichiers synthétiques des tests isolés.
Le runner le sélectionne dans son propre processus, sans modifier `.env`.
Playwright utilise Chrome ou Edge installé, ou `CMH_BROWSER_PATH`.

La vérification serveur combine extension, MIME déclaré, détection de signature,
limite réelle de réception, bornes des atomes MP4 et analyse des paquets/pistes
par ffprobe. Les références de données externes et les protocoles réseau sont
désactivés. L'analyse est bornée à 120 secondes et 1 Mio de sortie, sans exposer
sa sortie brute au client ou aux logs. Elle analyse le fichier sans transcodage
ni décodage exhaustif : la lisibilité de chaque image d'une longue vidéo n'est
pas garantie par ce contrôle. Un échantillon réel est décodé par Chrome en test.

Exemple d'export manuel avant dépôt, sans service externe :

```text
ffmpeg -i source.mov -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart video.mp4
```

L'application ne lance pas cette conversion. Le lecteur dépend des codecs du
navigateur et de l'OS. Chrome Windows a été vérifié ; les appareils physiques
iOS/Android et les autres moteurs ne sont pas présentés comme testés.

## Lecture et droits

Les routes privées sont :

```text
POST /api/admin/formations/:formationId/contenu/lecons/:leconId/videos
POST /api/admin/formations/:formationId/contenu/lecons/:leconId/videos/:videoId/retrait
GET|HEAD /api/admin/formations/:formationId/contenu/lecons/:leconId/videos/:videoId/lecture
GET|HEAD /api/stagiaire/inscriptions/:id/parcours/lecons/:leconId/videos/:videoId/lecture
```

Les écritures imposent ADMIN actif, origine autorisée et CSRF avant réception du
multipart, puis contrôle du parent et de la révision. Après un dépôt potentiellement
long, le rôle actif de l'ADMIN est revérifié dans la transaction d'enregistrement.

Chaque requête de lecture, y compris HEAD et Range, revérifie session, compte
actif, rôle STAGIAIRE, rattachement explicite de l'inscription, statut CONFIRMEE,
formation, leçon et module publiés/non archivés, version vidéo non retirée.
ADMIN lit les versions privées par sa route d'aperçu, même en brouillon.
Un compte ADMIN ne passe pas par la route STAGIAIRE. Une formation masquée au
catalogue n'interdit pas à elle seule les leçons privées explicitement publiées.

Les nouvelles requêtes sont bloquées après annulation, désactivation, retrait,
archivage ou dépublication. Une requête déjà autorisée et les octets déjà reçus
ne sont pas révoqués à distance. Cette protection ne prétend pas empêcher la
copie ou la capture d'écran par un utilisateur autorisé.

Le lecteur utilise les commandes natives, `playsInline`, `preload="metadata"`,
aucune lecture automatique, une largeur adaptable et un nom accessible. La
transcription se consulte au clavier. Les états de chargement, erreur/reprise
et absence de vidéo sont explicites. Aucun événement de lecture ne modifie la
progression, les présences, les acquis ou les attestations ; seul le bouton
déclaratif de la leçon enregistre sa progression.

## Streaming HTTP

La diffusion ouvre un descripteur contrôlé et vérifie sa taille. Elle utilise
un flux avec blocs de 64 Kio, bornes de lecture et contre-pression ; aucun
`readFile` ou Buffer contenant la vidéo entière côté serveur. Une déconnexion
ferme le flux et son descripteur ; HEAD ferme le descripteur sans créer de flux.

- GET sans plage : 200, `video/mp4`, longueur complète.
- Une plage `bytes=début-fin`, `bytes=début-` ou suffixe `bytes=-n` : 206,
  `Content-Range` exact et longueur de la plage, fin tronquée à la taille réelle.
- Plage valide mais insatisfaisable, dont début égal à la taille ou suffixe zéro :
  416 avec `Content-Range: bytes */taille`.
- Plage malformée, unité inconnue, multi-plages ou entier non représentable :
  plage ignorée, réponse complète 200. Ce choix suit les possibilités du
  [RFC 9110, Range](https://www.rfc-editor.org/rfc/rfc9110.html#name-range).
- HEAD : 200 et métadonnées de GET complet, sans corps, même avec Range.
- `If-Range` correspondant à l'ETag fort : plage ; sinon réponse complète.

Les réponses sont `private, no-store`, `nosniff`, `Accept-Ranges: bytes` et
`Cross-Origin-Resource-Policy: same-origin`. Aucun chemin de stockage, jeton dans
l'URL ou lien public permanent n'est fourni. Aucun contenu vidéo ou métadonnée
privée n'est ajouté aux API publiques ou aux logs.

## Stockage, audit et sauvegarde

L'audit commun inclut les versions vidéo actives et retirées et vérifie taille,
empreinte SHA-256, objets manquants/altérés/orphelins et temporaires. Le mode de
nettoyage existant ne supprime que les anciens temporaires, pas les vidéos.
Il faut un client Prisma et une base correspondant aux quatorze migrations
pour auditer la nouvelle table.

Sauvegarder et restaurer **ensemble** la base complète et tous les objets du
stockage privé, y compris les versions retirées. Exécuter ensuite l'audit sur
la restauration isolée avant toute utilisation. Le rollback SQL refuse de
supprimer la table si elle contient une seule version, même retirée.

Prévoir disque, durée de sauvegarde et bande passante : un remplacement conserve
l'ancien fichier, jusqu'à environ 25 Gio par leçon avec 50 versions de 512 Mio.
La réception écrit sur disque et l'analyse relit le fichier. Une lecture complète
de 512 Mio par 100 stagiaires représente environ 50 Gio, hors relectures/reprises.
Pas de CDN, streaming adaptatif, reprise d'upload ou compression automatique.
Les délais du serveur HTTP et d'un éventuel proxy peuvent limiter les gros
transferts ; le client attend jusqu'à 30 minutes, l'analyse au plus 120 secondes.

Les vidéos restent dans le stockage privé, ignoré par Git, ainsi que les fichiers
MP4/MOV/WebM/AVI/MKV. Aucun fichier vidéo binaire n'est ajouté au dépôt.

## Tests et scénario reproductible

Depuis `backend`, avec PostgreSQL 18 disponible localement :

```powershell
npm ci
npm run test:videos:schema
npm run test:elearning:schema
npm run test:videos:browser
```

**Commande navigateur automatique de référence : `npm run test:videos:browser`.**
Le script réel ajoute `--video-browser` : il exécute les tests API/régressions,
le parcours Chrome automatisé, puis ferme le navigateur et le cluster isolés.
`npm run test:videos -- --browser` est une variante **manuelle**, décrite plus
bas, qui laisse le serveur isolé actif jusqu'au marqueur `stop-browser`.

Tous ces runners créent leur propre cluster PostgreSQL, port aléatoire, base et
stockage sous `.catalogue-test`. Ils vérifient leur destination avant les écritures,
ne chargent pas `.env` et ne se connectent pas à `cmh_academy_dev`. Le navigateur
utilise `127.0.0.2` et ses propres contextes de cookies. Les identifiants fictifs,
vidéos synthétiques, rapports et captures restent dans ces répertoires ignorés.

Pour un parcours manuel avec le serveur isolé maintenu actif :

```powershell
npm run test:videos -- --browser
```

1. Noter le dossier et l'URL `NAVIGATEUR` affichés. Consulter localement
   `browser.json` pour le compte ADMIN et `videos-browser.json` pour le compte
   stagiaire, les identifiants des parcours et le chemin du MP4 synthétique.
   Ne pas recopier ces fichiers dans un dépôt ou des logs.
2. Se connecter à l'URL ADMIN affichée. Catalogue → Formations →
   « Découvrir le cheval — parcours pédagogique » → Contenu pédagogique →
   « Préparer une observation ». Sélectionner le MP4 synthétique, renseigner
   titre/transcription, remplacer la vidéo. Annuler d'abord la confirmation,
   puis confirmer : une seule version supplémentaire apparaît dans l'historique.
3. Ouvrir « Prévisualiser le parcours », puis cette leçon. Vérifier le lecteur
   et l'absence de lecture automatique.
4. Dans un autre profil de navigateur, sur la même origine isolée, se connecter
   au compte stagiaire de `videos-browser.json`. Ouvrir son inscription, son
   parcours puis la leçon. Lancer/pause au clavier, déplacer le curseur vers
   8 secondes, consulter la transcription. Vérifier les réponses 206 dans Réseau.
5. Passer à 390 px de large. Vérifier les commandes et l'absence de débordement.
   Regarder jusqu'au bout : « À étudier » doit rester inchangé. Seul « Marquer
   comme terminée » doit modifier la déclaration.
6. Retirer la vidéo côté ADMIN après confirmation. Une nouvelle requête Range de
   l'ancien lecteur renvoie 404 ; après actualisation, aucune vidéo disponible.
   L'ancienne version reste lisible par ADMIN depuis l'historique.
7. Avec un nouveau dépôt et un débit réseau bridé dans les outils navigateur,
   cliquer « Interrompre le transfert » avant réception complète. Actualiser :
   aucune version incomplète ne doit apparaître. Réessayer le même fichier si
   le résultat est incertain, puis vérifier l'historique.
8. Terminer le runner en créant son marqueur, dans le dossier réellement affiché :

```powershell
New-Item -ItemType File .catalogue-test/auth-XXXXXX/stop-browser
```

Le cluster et les serveurs du test sont fermés ; les preuves restent locales.
Les contrôles frontend se lancent séparément depuis `frontend` :
`npm run lint` puis `npm run build`.

## Vérification effectuée le 11 novembre 2026

- `npm run test:videos:browser` : **78 groupes réussis**, soit 67 groupes du
  socle existant, 7 groupes vidéo et 4 groupes navigateur. Rapport final :
  `.catalogue-test/auth-udXdgr/auth-results.json`.
- `npm run test:videos:schema` : **4 groupes réussis**, rapport
  `.catalogue-test/auth-KHFjmH/videos-schema-results.json`.
- `npm run test:elearning:schema` : **4 groupes réussis**, rapport
  `.catalogue-test/auth-BkmfJx/pedagogie-schema-results.json`.
- Chrome Windows : lecture décodée, pause/lecture au clavier, déplacement à
  8 secondes, quatre réponses de lecture Range dans le parcours navigateur,
  vues 390 × 844 et 1366 × 900. Captures du lecteur inspectées visuellement :
  `videos-admin-preview.png`, `videos-stagiaire-mobile.png` et
  `videos-stagiaire-desktop.png` dans le dossier du rapport final.
- `npm run lint`, `npm run build`, syntaxe Node des fichiers backend et
  `git diff --check` réussis. Recherche des secrets sur 207 fichiers candidats :
  aucune occurrence des secrets réels de `.env` ; seuls l'exemple de configuration
  factice et deux messages de validation sont signalés par les motifs génériques.
  Aucun fichier vidéo ou objet privé suivi par Git.

La suite conserve l'avertissement préexistant de `pg` sur les requêtes simultanées
d'un même client, sans échec. Ces essais ne constituent pas un test de charge
multi-utilisateur ou une certification de tous les fichiers MP4 possibles.
Les bases isolées ont été arrêtées à la fin des runners ; leurs données et
preuves restent dans `.catalogue-test`, hors Git.

## Fichiers ajoutés ou modifiés

Backend et configuration :

- `backend/videos-pedagogiques.js` : gestion des versions et routes de lecture.
- `backend/lib/videos.js` : format, validation, limites et streaming.
- `backend/lib/documents.js` : réception interrompue et audit commun des vidéos.
- `backend/lib/pedagogie.js`, `backend/lib/pedagogie-errors.js` : sélections
  privées et erreurs communes sans import circulaire.
- `backend/admin/pedagogie.js`, `backend/app.js` : configuration et raccordement.
- `backend/.env.example`, `backend/package.json`, `backend/package-lock.json`.

Schéma :

- `backend/prisma/schema.prisma`.
- `backend/prisma/migrations/20261111180000_videos_pedagogiques/migration.sql`.
- `backend/prisma/rollbacks/20261111180000_videos_pedagogiques.sql`.

Frontend :

- `frontend/src/admin/VideosLecon.jsx` : formulaire, confirmations et historique.
- `frontend/src/pedagogie/VideoPlayer.jsx` : lecteur accessible et transcription.
- `frontend/src/admin/ContenuPedagogique.jsx` : intégration et protection des saisies.
- `frontend/src/pedagogie/ParcoursPedagogique.jsx` : lecteur et aperçu existant.
- `frontend/src/admin/admin.css` : adaptation mobile et focus clavier.

Tests et documentation :

- `backend/scripts/test-videos-schema.mjs`.
- `backend/scripts/lib/test-videos.mjs`.
- `backend/scripts/lib/test-videos-browser.mjs`.
- `backend/scripts/lib/video-fixture.mjs`.
- `backend/scripts/test-auth.mjs`, `backend/scripts/test-elearning-schema.mjs`.
- `README.md` et le présent document.
- `.gitignore` : exclusion des outils binaires privés `.local-tools/`.
- `backend/server.js` : diagnostic explicite de disponibilité de ffprobe au démarrage.
- `backend/scripts/apply-videos-local.mjs` et `verify-videos-local.mjs` :
  application sauvegardée et vérification locale sans jeu de données fictif.

## Application locale et vérifications après redémarrage

Le runner versionné `scripts/apply-videos-local.mjs` suit le mécanisme des étapes
précédentes : garde stricte de destination `localhost:5432/cmh_academy_dev`,
utilisateur PostgreSQL attendu, historique exact et empreintes, diff contre le
schéma des treize premières migrations, backend arrêté, `pg_dump` custom et copie
privée, restauration conjointe sur cluster neuf et comparaison exhaustive,
application/régénération/audit isolés, puis `prisma migrate deploy` et
`prisma generate` sur la destination locale vérifiée. Il refuse toute autre
migration en attente, un historique différent ou un backend encore actif.
Aucun reset, `db push`, seed, nouveau compte ou contenu de démonstration.

La sauvegarde vérifiée se trouve dans
`.local-backups/videos-20261111-CdRQZe/avant-videos.dump`, avec sa copie
`stockage-prive/`, le manifeste et `resultats.json`. Les rapports, le dump et la
copie de configuration restent privés et ignorés par Git. La restauration a
préservé toutes les lignes, l'historique, les colonnes, contraintes, index,
triggers et fichiers avant application de la migration isolée. Après application
locale, toutes les lignes et tous les fichiers préexistants sont identiques.
Le dump custom mesure 102 320 octets. Les neuf lignes préexistantes, session
technique comprise, sont conservées ; aucune ligne vidéo n'est créée.

| Volume | Avant | Après |
| --- | ---: | ---: |
| Migrations terminées | 13 | 14 |
| Formation / pôle / formateur | 1 / 1 / 1 | 1 / 1 / 1 |
| Association formation-formateur | 1 | 1 |
| Session / séance / accès privé de session | 1 / 1 / 1 | 1 / 1 / 1 |
| Utilisateur ADMIN / session technique | 1 / 1 | 1 / 1 |
| Inscriptions / dossiers / pièces jointes | 0 / 0 / 0 | 0 / 0 / 0 |
| Modules / leçons / progressions | 0 / 0 / 0 | 0 / 0 / 0 |
| Versions vidéo | table absente | 0 |
| Fichiers privés / octets | 0 / 0 | 0 / 0 |

Le backend est relancé avec **`npm run start`** (`node --env-file=.env server.js`).
La configuration `.env` pointe vers ffprobe **9.0.2**, installé sous le répertoire
privé `.local-tools/ffmpeg/verified-release/`. L'archive Windows a été téléchargée
depuis [Gyan, fournisseur de builds Windows](https://www.gyan.dev/ffmpeg/builds/),
puis son SHA-256 comparé à celui publié :
`60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`.
Le binaire et l'archive ne sont pas versionnés. Le journal de démarrage confirme
« Vidéos : ffprobe 9.0 disponible. ». Le même binaire valide le MP4 synthétique
de douze secondes dans `.catalogue-test`, sans dépôt dans le stockage local.

Le runner `scripts/verify-videos-local.mjs` conserve une empreinte des tables
métier et fichiers avant redémarrage, puis compare après les lectures. Il réutilise
une session serveur ADMIN préexistante encore valide, en signant son cookie en
mémoire avec la configuration locale ; aucun compte, login ou session n'est créé,
prolongé ou imprimé. Il vérifie les API ADMIN/états vides, catalogue/fiches publiques,
refus anonymes GET/HEAD/Range/écriture, séparation des rôles, CSRF, absence de
montage public du stockage, disponibilité des entrées frontend et audit complet.
Les valeurs privées et cookies restent en mémoire, jamais dans la sortie.

Exécution locale de contrôle, avec le dossier réellement créé par l'application :

```powershell
node scripts/verify-videos-local.mjs --backup=.local-backups/videos-20261111-CdRQZe
```

La base ne contient aucun compte STAGIAIRE ni inscription. Leur parcours
authentifié n'a donc pas été fabriqué dans la base locale : il est exercé dans
la suite isolée. Le contrôle visuel du navigateur local a été interrompu par
l'outil ordinateur, faute de certitude sur l'URL Chrome. Les contrôles locaux
effectivement réalisés sont API/SQL/HTTP ; les écrans et lecteurs sont testés
dans les navigateurs isolés du runner automatisé.

Les nouvelles vérifications d'absence de ffprobe couvrent la réponse ADMIN,
l'erreur explicite 503 sans version créée et le formulaire navigateur désactivé.
L'avertissement `pg` préexistant sur les requêtes simultanées reste présent,
sans échec fonctionnel.
