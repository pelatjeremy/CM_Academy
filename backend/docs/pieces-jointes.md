# Pièces jointes administrateur

La migration 20261109180000_pieces_jointes a été testée sur PostgreSQL isolé,
puis appliquée le 9 novembre 2026 à localhost:5432/cmh_academy_dev avec
prisma migrate deploy. Huit migrations sont terminées, sans divergence.
Le client Prisma est régénéré et le backend redémarré.

Le stockage local résolu est C:/Users/pelat/Documents/CM Horse/backend/.private-documents,
avec une limite explicite de 10485760 octets dans backend/.env.
La résolution part du module backend/lib/documents.js, indépendamment du cwd.
L'audit lancé depuis la racine du projet et la sonde technique de droits
écriture/lien exclusif ont réussi. Aucun document de test n'a été créé localement.

Sauvegarde PostgreSQL et copie privée :
backend/.local-backups/pieces-jointes-20261109-84QZXW/.
La restauration sur un cluster neuf et un stockage isolé a été comparée aux
données, colonnes, contraintes, index, historique et empreintes de fichiers.
Le stockage préexistant était vide ; sa restauration vérifie donc sa structure
vide, pas le téléchargement d'une pièce réelle. Après migration, l'audit ne
signale aucun temporaire ancien, orphelin, manquant, altéré ou inconnu ; aucun
nettoyage n'a été demandé. Zéro inscription, dossier et pièce jointe.

La reconnexion réelle, l'état vide d'Inscriptions, le catalogue et une fiche
publiée ont été vérifiés au navigateur. Les requêtes anonymes aux dossiers,
versions et téléchargements renvoient 401. Express ne monte aucun stockage
statique ; Vite est en mode fs.strict avec frontend seul dans fs.allow.
Les URL non reconnues de Vite peuvent répondre avec le HTML de l'application,
sans servir le stockage. Syntaxe Node, lint et build réussis.

Exploitation reproductible : scripts/apply-documents-local.mjs --apply protège
l'application initiale (sept migrations attendues) et refuse sa réexécution après
application. scripts/verify-documents-local.mjs vérifie les accès publics/anonymes
et compteurs en lecture seule. Les rapports sont dans le dossier de sauvegarde.

## Utilisation et conservation

Dans Inscriptions → dossier administratif → Préparation documentaire, ouvrir
« Pièces jointes » sur une catégorie. Cette fonction suit le parcours documentaire
copié sur le dossier ; elle ne modifie pas la configuration de la formation.

Chaque dépôt crée une PieceJointe avec version, nom sécurisé, taille exacte en
octets, MIME contrôlé, date et auteur. L'historique rassemble ces dépôts et les
événements déjà existants. Les anciennes versions restent téléchargeables.
Il n'existe pas de suppression dans cette étape.

Le dépôt ne change ni état manuel ni note, ni version de modification du suivi.
Une révision distincte par élément protège les dépôts simultanés ; une clé de
requête UUID permet de rejouer un envoi après une réponse perdue sans dupliquer
la version. Un autre dépôt concurrent provoque un conflit explicite. Le fichier
choisi et les notes restent présents, avec actualisation volontaire avant reprise.
Le bouton est verrouillé pendant l'envoi, y compris contre les doubles clics.

Un fichier reçu ne prouve aucune signature, présence ou conformité.

## Configuration locale

Dans backend/.env (ne jamais versionner ce fichier) :

DOCUMENT_STORAGE_DIR=.private-documents
DOCUMENT_MAX_FILE_BYTES=10485760

La limite par défaut vaut 10 Mio, affichés « 10 Mo » dans l'interface.
Elle s'exprime en octets, entier positif au maximum 2147483647.
Le chemin relatif est résolu depuis backend. Un chemin absolu privé est possible.
Ne jamais choisir frontend, un dossier public/statique, ou un emplacement servi
par un autre serveur. Les emplacements publics connus sont refusés.

Le répertoire par défaut backend/.private-documents est ignoré par .gitignore.
Pour un chemin personnalisé situé dans le projet, ajouter sa règle d'exclusion
avant utilisation ; préférer un emplacement extérieur au dépôt.
Restreindre ses droits au compte exécutant le backend et aux responsables de
sauvegarde. Sur Windows, configurer les ACL NTFS : le mode POSIX 0700 demandé
par Node ne remplace pas les permissions Windows.

Les sous-répertoires sont créés à la première opération :
- temporaires : réception en flux, un UUID.part par envoi ;
- objets : fichiers immuables UUID.blob, sans nom personnel.

Le stockage doit être sur un système de fichiers local permettant les liens
physiques exclusifs. Les deux sous-répertoires doivent rester sur le même volume.
Un échec de stockage renvoie une erreur générique, sans chemin interne.

## Contrôles et routes

Multer 2.5 reçoit directement sur disque avec limites de taille, nombre de
fichiers (un) et parties multipart ; aucun fichier complet n'est chargé en mémoire.
file-type 22 contrôle la signature PDF/JPEG/PNG. Extension et MIME déclaré doivent
aussi correspondre. Une signature reconnue n'est pas une analyse antivirus ni une
validation exhaustive du format.

Ces bibliothèques maintenues évitent un parseur multipart et une reconnaissance
binaire artisanaux :
- https://expressjs.com/en/resources/middleware/multer/
- https://github.com/sindresorhus/file-type

Les trois routes partagent la base :
/api/admin/inscriptions/:id/dossier/elements/:categorie/fichiers

- GET : versions, révision courante, limite ; aucune écriture.
- POST multipart, champ fichier uniquement ; en-têtes x-csrf-token,
  x-depot-id (UUID stable par tentative) et x-fichier-revision.
- GET /:fichierId/telecharger : téléchargement d'une version.

Session active et rôle ADMIN sont vérifiés avant toute opération, puis existence
du dossier/élément et activation documentaire. Le fichier doit appartenir au
dossier ET à la catégorie demandés. Le CSRF et l'origine sont contrôlés avant
le parseur multipart. Les coordonnées et métadonnées restent administratives.

Le téléchargement utilise Content-Disposition: attachment, un nom sans chemin
ni caractères de contrôle, Content-Type choisi dans la liste autorisée,
X-Content-Type-Options: nosniff et Cache-Control: no-store.
Ni clé de stockage, empreinte, chemin, ni URL statique ne figurent dans les DTO.
L'API publique reste inchangée. Aucun contenu ni nom personnel n'est journalisé
par le code de dépôt.

## Cohérence, interruptions et audit

Le fichier temporaire est contrôlé puis synchronisé sur disque. Un lien exclusif
publie l'objet immuable avant la transaction SQL. La transaction sérialisable
incrémente la révision et insère la métadonnée ensemble.
Après un échec connu, l'objet non référencé est retiré. Si l'état du commit ne
peut pas être vérifié, il est conservé par prudence. Une nouvelle tentative avec
la même clé retrouve la version déjà enregistrée.

Une interruption brutale peut laisser un temporaire ou un objet orphelin.
La synchronisation des répertoires est utilisée lorsque le système la permet ;
Windows ne fournit pas la même garantie fsync de répertoire. Base et disque ne
forment pas une transaction distribuée : conserver les sauvegardes conjointes.

Après application de la migration et génération du client, depuis backend :

npm run documents:audit

Cet audit vérifie références, tailles et SHA-256. Il signale les objets orphelins
et temporaires de plus de 24 heures, les fichiers manquants/altérés et les entrées
inconnues. La sortie contient uniquement des identifiants techniques, aucun nom
original ou contenu. Il ne supprime jamais les objets définitifs.

Pour nettoyer exclusivement les anciens temporaires :
1. Arrêter toutes les instances du backend et attendre la fin des envois.
2. Exécuter :
   npm run documents:audit -- --nettoyer-temporaires --serveur-arrete
3. Examiner le rapport. L'option affirme l'arrêt préalable ; elle ne l'effectue pas.

Pour un orphelin définitif, arrêter les écritures, sauvegarder base et stockage,
vérifier l'absence de référence dans cette même base, puis archiver/quarantainer
manuellement le fichier avant d'envisager son retrait. Ne pas supprimer
automatiquement un objet récent : un commit peut être en cours.
Un fichier manquant ou altéré exige une restauration contrôlée, pas un effacement
des métadonnées. Aucun outil de réparation destructrice n'est fourni.

## Sauvegarde et restauration conjointes

Une sauvegarde PostgreSQL seule ne contient pas les fichiers.

1. Arrêter tous les backend pouvant écrire et attendre les envois en cours.
2. Lancer l'audit, conserver son rapport et résoudre les anomalies.
3. Réaliser un pg_dump au format custom avec le mécanisme sécurisé déjà utilisé
   par le projet. Ne pas mettre de mot de passe dans les commandes ou journaux.
4. Copier intégralement objets/ dans la même sauvegarde datée, hors versionnement,
   avec le dump, un manifeste des empreintes, l'état des migrations et la
   configuration non secrète. Les temporaires incomplets ne sont pas des versions.
5. Protéger/chiffrer cette sauvegarde et limiter ses accès : elle contient des
   données administratives personnelles.
6. Redémarrer seulement une fois les deux copies terminées.

Vérifier la restauration dans une NOUVELLE base isolée et un NOUVEAU répertoire
privé : restaurer le dump et objets/ du même instant, configurer cette paire
ensemble, utiliser le client correspondant au schéma puis exécuter l'audit.
Le CLI d'audit est volontairement limité à cmh_academy_dev ; pour la vérification
isolée, utiliser createDocumentStorage({root: stockageIsole}).audit(prismaIsole)
dans le dispositif de test, après vérification de la destination.
Exiger zéro fichier manquant/altéré et tester un téléchargement ADMIN.
Ne jamais associer une base de test au stockage réel.
Toute restauration réelle se fait backend arrêté, sans fusion aveugle de deux
sauvegardes d'instants différents.

## Vérifications exécutées

- SQL migration, contraintes, préservation du suivi et rollback protégé :
  node scripts/test-documents-schema.mjs.
- Régressions SQL du catalogue et du dossier :
  npm run test:catalogue ; node scripts/test-dossiers-schema.mjs.
- Authentification, catalogue, inscriptions, dossiers, fichiers :
  npm run test:documents -- --browser
  (PostgreSQL et stockage temporaires isolés).
- Contrôles réels : PDF/JPEG/PNG, faux types/extensions, fichier vide, limite
  dépassée, multipart multiple/champs parasites, nom malveillant, 401/403,
  CSRF, mauvais dossier/catégorie, anciennes versions, rejeu et concurrence.
- Pannes injectées : stockage indisponible, rollback SQL, commit réussi avec
  réponse perdue ; interruption HTTP en plein transfert ; audit des temporaires,
  orphelins, objets absents et altérés ; configuration de limite à 128 octets.
- Navigateur isolé : connexion, dépôt PDF, remplacement PNG, note non enregistrée
  préservée, téléchargement réel, conflit entre deux onglets et reprise,
  sauvegarde indépendante du suivi, rechargement, clavier, mobile 390 × 844.

Rapports ignorés par le versionnement :
.catalogue-test/auth-WgFRh5/auth-results.json
.catalogue-test/auth-L3CsbG/auth-results.json (dernière suite, altération SHA-256 incluse)
.catalogue-test/auth-WgFRh5/documents-browser-results.json
.catalogue-test/auth-0hE9rq/documents-schema-results.json
.catalogue-test/auth-b16vR0/dossiers-schema-results.json
.catalogue-test/run-ScqbqO/resultats.json

Contrôles finaux : syntaxe Node de 36 fichiers, npm run lint et npm run build
dans frontend réussis. Lecture seule de cmh_academy_dev : sept migrations,
aucune table PieceJointe, zéro inscription ; nouvelle migration non appliquée.
La suite PostgreSQL émet un avertissement de dépréciation pg sur les requêtes
concurrentes du client existant ; aucun test n'échoue.

## Scénario manuel

Après l'application de la migration dans l'environnement choisi :
1. Se connecter comme ADMIN, ouvrir un dossier avec parcours documentaire actif.
2. Modifier une note sans enregistrer. Joindre un PDF à une catégorie.
3. Vérifier le succès, l'auteur/la date et la note intacte ; l'état manuel ne change pas.
4. Remplacer avec un PNG, puis télécharger chaque version.
5. Ouvrir le même élément dans deux onglets ; envoyer dans le premier puis dans
   le second. Vérifier le conflit, les saisies conservées et la reprise explicite.
6. Enregistrer le suivi ; recharger et contrôler états, notes et historique.
7. Essayer un faux PDF et un fichier trop grand ; vérifier l'erreur lisible.
8. Vérifier mobile/clavier et le refus d'accès en étant déconnecté.

Pour reproduire sans données réelles, utiliser test:documents -- --browser,
les fichiers browser-files/ et les identifiants éphémères du browser.json
dans le répertoire isolé annoncé. Terminer en créant son fichier stop-browser.

## Fichiers modifiés

Stockage/API : backend/lib/documents.js, backend/admin/fichiers.js,
backend/admin/dossiers.js, backend/app.js, backend/.env.example,
backend/package.json, backend/package-lock.json, .gitignore.

Modèle : backend/prisma/schema.prisma,
backend/prisma/migrations/20261109180000_pieces_jointes/migration.sql,
backend/prisma/rollbacks/20261109180000_pieces_jointes.sql.

Interface : frontend/src/admin/PiecesJointes.jsx, DossierAdministratif.jsx,
AdminWorkspace.jsx, api.js, admin.css.
Le garde de navigation ignore les liens de téléchargement pour préserver les
saisies sans afficher un avertissement de sortie lors du téléchargement.

Tests/exploitation : backend/scripts/audit-documents.mjs,
test-documents-schema.mjs, test-auth.mjs, test-catalogue.mjs,
test-dossiers-schema.mjs, lib/test-documents.mjs, et ce guide.
