# Premier espace stagiaire

Migration 20261109190000_espace_stagiaire appliquée le 9 novembre 2026 à
localhost:5432/cmh_academy_dev, après contrôle des huit migrations précédentes,
de leurs empreintes et de l'absence de divergence.
Neuf migrations sont terminées ; Prisma est régénéré et le backend redémarré.
Aucun déploiement, compte, inscription ou fichier fictif dans la base ou le stockage réels.

## Application locale et complément navigateur

Le nouveau parcours navigateur est intégralement vérifié sur la base isolée
.catalogue-test/auth-23jGrI : inscription sans compte, invitation ADMIN, choix
du mot de passe par l'utilisateur, activation, connexion, Mes formations et
déconnexion. Un second usage du même lien est refusé. Le secret n'est jamais
émis dans les journaux ; le mot de passe choisi n'a pas été communiqué à l'agent.
Rapports : auth-results.json et nouveau-compte-browser-results.json.

Sauvegarde conjointe vérifiée :
.local-backups/stagiaires-20261109-q8VarV/avant-stagiaires.dump et stockage-prive/.
Backend arrêté pendant la copie et la migration ; restauration sur un cluster
neuf et un stockage distinct, comparaison complète des données, colonnes,
contraintes, index, historique et empreintes de fichiers.
Le stockage préexistant est vide : sa restauration est vérifiée comme telle.
L'audit avant reprise ne détecte aucun fichier manquant, altéré ou orphelin ;
aucun nettoyage n'a été demandé.

Les premiers contrôles de restauration se sont arrêtés sans application locale :
PostgreSQL reformate le cast varchar[] vers text[] du CHECK MIME lors de
pg_restore. Le comparateur reconnaît désormais seulement les deux expressions
exactes équivalentes, sans modifier la contrainte. Les autres valeurs restent
comparées strictement. L'ordre de comparaison est indépendant de la collation.
Les diagnostics des tentatives interrompues sont conservés hors versionnement.

Contrôles locaux : connexion ADMIN réelle, Inscriptions vide, pages stagiaire,
lien absent/invalide refusé, API personnelle et téléchargements anonymes en 401,
CSRF en 403, catalogue et fiches sans données privées, audit intègre sans
nettoyage. L'expiration reste testée uniquement sur une invitation isolée.
Un changement de fragment sur une page d'activation déjà ouverte est maintenant
pris en charge : effacement immédiat du fragment, nouvelle vérification et
ignorance des anciennes réponses concurrentes. Ce cas est revérifié au navigateur.
Syntaxe Node de 49 fichiers, lint et build frontend réussis. Journal du backend
observé après redémarrage : aucune sortie de requête ni secret.

Conservation vérifiée : un compte ADMIN, zéro inscription, dossier, fichier,
invitation, rattachement ou décision de partage. Aucune association automatique.
Rapport local : .local-backups/stagiaires-20261109-q8VarV/controles-locaux.json.
Scripts de cette application : scripts/apply-stagiaires-local.mjs et
scripts/verify-stagiaires-local.mjs. La création fictive supplémentaire pour le
navigateur est limitée à scripts/lib/test-stagiaires.mjs et aux bases isolées.

## Modèle et choix d'accès

RoleUtilisateur ajoute STAGIAIRE sans changer ADMIN ou MEMBRE.
L'authentification reste commune : Argon2id, session opaque PostgreSQL,
rotation à la connexion, expiration/révocation, cookie HttpOnly/SameSite,
Secure en production, CSRF synchronisé et origine contrôlée.

InvitationStagiaire garde l'inscription, l'email normalisé visé, l'auteur,
la date de création, l'expiration, les dates de révocation/utilisation et
le compte ayant utilisé l'invitation. Seul SHA-256 du jeton aléatoire de
32 octets est stocké. Le secret n'est pas conservé dans l'historique.
Sa durée est 48 heures. Préparer une nouvelle invitation révoque les anciennes
non utilisées ; un index unique partiel garantit une invitation non révoquée/
non utilisée par inscription. Une invitation expirée est révoquée lors du remplacement.

RattachementStagiaire porte une clé primaire inscriptionId : un seul compte
par inscription ; un compte peut avoir plusieurs inscriptions. Il référence
l'invitation consommée et sa date, sans recopier les coordonnées.
La création de compte, la consommation du jeton et le rattachement sont dans
une même transaction sérialisable. Il n'existe ni rattachement automatique
par email, ni route permettant de fournir librement un utilisateur cible.
Connexion et préinscription ne font aucune association.

Une invitation vise l'adresse de l'inscription au moment de sa préparation.
Camille doit vérifier l'identité et le destinataire avant sa transmission.
Le lien est un secret donnant accès à une activation ; la possession d'un lien
pour un nouvel email constitue la preuve prévue à ce stade local.
Aucune vérification d'email par envoi n'est implémentée.

Pour un nouveau compte, le destinataire choisit un mot de passe de 12 à 128
caractères. Pour un compte STAGIAIRE actif existant, il confirme son mot de passe
actuel. Ce mot de passe n'est jamais remplacé par l'invitation.
Un compte ADMIN, MEMBRE ou inactif bloque la préparation/l'activation :
aucune conversion de rôle ou réactivation implicite.
Si un compte apparaît ou change pendant l'activation, une nouvelle tentative
est nécessaire. Les contraintes d'unicité et transactions empêchent doublons
et écrasements lors d'activations concurrentes.

Tous les statuts d'inscription restent consultables par leur propriétaire,
y compris attente/refus/annulation. La fiche liée peut être consultée même si
la formation n'est plus publiée : c'est une consultation authentifiée liée
à l'inscription, sans effet sur le catalogue public.

## Invitation et confidentialité

Depuis Inscriptions → détail de demande → Espace stagiaire :
« Préparer une invitation ». Le lien n'est affiché qu'à cet instant, pour copie.
La préparation ne rattache encore rien. Une réponse perdue nécessite une nouvelle
invitation, qui révoque la précédente ; le secret n'est pas récupérable en base.

Le jeton est dans le fragment /stagiaire/activation#… ; il n'arrive jamais
dans l'URL HTTP GET. React l'efface immédiatement de l'adresse et le garde
uniquement en mémoire. Un rechargement de cette page exige de rouvrir le lien.
Le HTML impose referrer=no-referrer ; aucune ressource tierce n'est ajoutée.
Le jeton est envoyé dans le corps JSON des POST protégés CSRF, jamais en query.
Les routes ne journalisent ni corps de requête, ni mot de passe, ni jeton.
Ne pas ajouter ultérieurement un journal des corps de requête sur ces routes.

Consulter et activer sont limités ensemble à 20 requêtes par IP sur 15 minutes.
Le contrôle CSRF et d'origine est repris de l'authentification existante.
L'activation ne connecte pas automatiquement : elle conduit au formulaire commun
de connexion stagiaire. Aucun jeton de session ne va dans le stockage Web.

## Documents

PieceJointe ajoute partageStagiaire=false et partageRevision=0.
Chaque version demeure privée, y compris un remplacement d'une version partagée.
Dans le dossier, chaque version possède « Partager cette version » ou
« Retirer le partage ». Le partage ne confirme ni signature, ni validité,
ni état documentaire. Notes et états restent indépendants.

PartagePieceJointe enregistre chaque changement effectif avec auteur et date.
La révision attendue empêche un écrasement concurrent ; une décision identique
ne crée pas d'événement supplémentaire. En cas de conflit, actualiser les
versions ou recharger pour revoir la décision courante.

Les téléchargements stagiaires recherchent ensemble fichier partagé,
inscription demandée ET utilisateur propriétaire courant.
Le retrait bloque toute requête de téléchargement suivante ; il ne peut pas
effacer une copie déjà téléchargée.
Le même service de téléchargement protégé est réutilisé par ADMIN et STAGIAIRE :
pièce jointe, nom sécurisé, MIME contrôlé, nosniff et no-store.
Le stockage, les notes, auteurs internes, historiques et accès privés de
visioconférence sont exclus des DTO stagiaires.
La sauvegarde conjointe fichiers/base reste celle du guide pieces-jointes.md.

## Routes

ADMIN (session, rôle et CSRF sur écritures) :
- GET /api/admin/inscriptions/:id/espace-stagiaire : rattachement et invitations sans secret.
- POST /api/admin/inscriptions/:id/espace-stagiaire/invitation : corps {} uniquement.
- PUT /api/admin/inscriptions/:id/dossier/elements/:categorie/fichiers/:fichierId/partage :
  partage booléen et revision entière attendue, aucun champ supplémentaire.

Activation (CSRF, origine, limitation) :
- POST /api/auth/invitations/consulter : token.
- POST /api/auth/invitations/activer : token et password.

STAGIAIRE uniquement (ADMIN reçoit 403, anonyme 401) :
- GET /api/stagiaire/inscriptions.
- GET /api/stagiaire/inscriptions/:id.
- GET /api/stagiaire/inscriptions/:id/fichiers/:fichierId/telecharger.
Un identifiant d'autrui ou un document non partagé renvoie 404.

Interface : /stagiaire/connexion, /stagiaire/activation, /stagiaire,
et /stagiaire/inscriptions/:id. Le catalogue contient le lien Espace stagiaire.
Les formulaires de connexion ADMIN/STAGIAIRE sont communs ; la session est
vérifiée au rechargement. Les pages proposent chargement, vide, erreur/réessai
et reconnexion, avec formats de date explicites Europe/Paris.

## Migration et retour arrière

Ne pas utiliser reset ou db push. Pour la future application, vérifier
localhost:5432/cmh_academy_dev, les huit migrations précédentes et leurs empreintes,
l'absence de divergence, sauvegarder PostgreSQL et les fichiers ensemble,
restaurer la paire sur une instance isolée, puis vérifier que seule cette
migration est attendue avant prisma migrate deploy et prisma generate.

Le SQL ajoute une valeur d'enum avant la transaction des tables/colonnes.
Le rollback versionné refuse toute invitation, rattachement, décision de partage,
révision de partage non nulle ou compte STAGIAIRE.
Même après un rollback autorisé, la valeur STAGIAIRE reste dans l'enum :
PostgreSQL ne la retire pas sans recréer le type. Elle demeure réservée,
inutilisée. La réapplication accepte cette valeur déjà présente.
Le rollback manuel ne modifie pas automatiquement l'historique Prisma ;
une réconciliation explicite serait nécessaire avant un nouveau deploy.
Aucune suppression destructive automatique ni cascade métier n'est ajoutée.

## Tests réellement exécutés

Depuis backend :
- node scripts/test-stagiaires-schema.mjs : données existantes conservées,
  anciennes versions privées, aucun rattachement initial, SQL/Prisma sans
  divergence, index partiel, contraintes, RESTRICT, rollback et réapplication.
- npm run test:stagiaires : vraie migration Prisma sur cluster neuf, stockage
  isolé ; régressions auth, pôles/formateurs, formations, sessions, catalogue
  public, préinscriptions, dossiers et fichiers ; nouveaux tests d'invitation,
  expiration/révocation/usage unique, activations simultanées, comptes existants,
  email seul sans rattachement, propriété entre deux stagiaires, CSRF/401/403,
  limitation, versions privées, partage/retrait/concurrence et téléchargement.
- node scripts/test-documents-schema.mjs ; node scripts/test-dossiers-schema.mjs ;
  npm run test:catalogue : régressions SQL réelles après ajout de la migration.
- Syntaxe Node (47 fichiers), frontend npm run lint et npm run build : réussis.

Rapports ignorés :
- .catalogue-test/auth-IZvtCY/stagiaires-schema-results.json
- .catalogue-test/auth-dfclhj/auth-results.json (dernière suite complète)
- .catalogue-test/auth-IjbEYo/auth-results.json et stagiaires-browser-results.json
- .catalogue-test/auth-2yjXqo/documents-schema-results.json
- .catalogue-test/auth-wcWFJy/dossiers-schema-results.json
- .catalogue-test/run-tqiRXy/resultats.json

Navigateur sur la base isolée : invitation ADMIN créée et secret lu sans émission
dans les journaux, activation d'un compte existant, connexion stagiaire,
liste/détail, heures Paris, rechargement, état sans document, partage de la seule
version 1 (version 2 privée), téléchargement PDF réel, refus /admin,
déconnexion et accès direct protégé. Mobile 390 px sans débordement horizontal.
La création du nouveau compte/mot de passe est testée par l'API ; le parcours
navigateur d'activation utilise un compte de test existant et son mot de passe.
Les captures ne montrent que des données fictives isolées, aucun jeton.
L'avertissement pg déjà existant sur les requêtes concurrentes du client apparaît
dans les suites, sans échec.

Contrôle initial de préparation en lecture seule de cmh_academy_dev : huit migrations, aucune
table InvitationStagiaire, zéro inscription et pièce jointe.

## Scénario manuel isolé

1. Depuis backend : npm run test:stagiaires -- --browser.
2. Ouvrir l'origine isolée annoncée et se connecter ADMIN avec les identifiants
   éphémères du browser.json dans le répertoire indiqué (ne pas les publier).
3. Ouvrir l'inscription navigateur@stagiaire-test.invalid, préparer l'invitation.
4. Copier le lien, ouvrir l'activation, confirmer le mot de passe du compte de
   test indiqué dans stagiaire-browser.json ; se connecter sur /stagiaire/connexion.
5. Vérifier Mes formations, le détail, le rechargement et les heures Paris.
6. Comme ADMIN, partager une seule version du programme du dossier Alice.
7. Comme Alice, vérifier qu'elle seule peut télécharger cette version ;
   aucune note, historique ou visioconférence privée n'est présent.
8. Retirer le partage comme ADMIN, puis vérifier le refus du téléchargement.
9. Vérifier /admin refusé au stagiaire et la déconnexion.
10. Pour un nouveau compte, préparer une invitation sur une inscription isolée
    sans compte existant et choisir soi-même un mot de passe de 12 caractères minimum.
11. Pour arrêter proprement le dispositif, créer stop-browser dans son répertoire.

Les bases et stockages isolés ne doivent jamais être remplacés par
cmh_academy_dev ou .private-documents dans ces essais.

## Fichiers de cette étape

Backend :
- prisma/schema.prisma
- prisma/migrations/20261109190000_espace_stagiaire/migration.sql
- prisma/rollbacks/20261109190000_espace_stagiaire.sql
- auth/index.js, auth/activation.js, admin/stagiaires.js, stagiaire.js
- lib/telechargement.js, lib/documents.js, admin/fichiers.js, app.js
- package.json (commande de test uniquement ; aucune dépendance ajoutée)
- scripts/lib/test-stagiaires.mjs, scripts/test-stagiaires-schema.mjs
- scripts/test-auth.mjs, scripts/lib/test-documents.mjs
- scripts/test-catalogue.mjs, test-documents-schema.mjs, test-dossiers-schema.mjs
- docs/espace-stagiaire.md

Frontend :
- index.html (politique de référent)
- src/App.jsx, src/components/Admin.jsx, src/public/PublicLayout.jsx
- src/stagiaire/Activation.jsx, src/stagiaire/EspaceStagiaire.jsx
- src/admin/InvitationStagiaire.jsx, PartageDocument.jsx, Inscriptions.jsx,
  PiecesJointes.jsx.
Les styles communs existants sont réutilisés.
