# Relevé manuel des présences

Migration 20261109210000_presences_manuelles appliquée le 9 novembre 2026 à
localhost:5432/cmh_academy_dev avec prisma migrate deploy, après vérification
des dix migrations précédentes, de leurs empreintes et de l'absence de divergence.
Onze migrations sont terminées, Prisma est régénéré et le backend redémarré.
Aucune donnée fictive locale, aucun déploiement et aucune dépendance ajoutée.

## Application locale vérifiée

Sauvegarde conjointe hors versionnement :
.local-backups/presences-20261109-eLxSGS/avant-presences.dump et stockage-prive/.
Le backend était arrêté pendant la sauvegarde et l'application.
La restauration sur un cluster neuf et un stockage distinct a été comparée à
la source : toutes les données, colonnes, contraintes, index, historique et
empreintes de fichiers. Le stockage préexistant était vide.
L'audit ne signale aucun fichier manquant, altéré, orphelin ou temporaire ancien ;
aucun nettoyage n'a été exécuté.

Volumes avant/après identiques : un compte, une formation, un pôle, un formateur,
une session et une séance ; zéro inscription, dossier, fichier, modèle et
questionnaire attribué. Les nouvelles tables Presence et ChangementPresence
contiennent zéro ligne. Aucun horaire ni statut d'inscription n'est modifié.

Contrôles locaux : connexion ADMIN réelle ; accès depuis Sessions au suivi
avec Aucune inscription confirmée ; nouvelle consultation/rechargement sans
création de relevé ; Inscriptions vide ; catalogue et fiches publiques accessibles.
Les empreintes de dix tables métier (dont séances, inscriptions, présences et
historique) sont identiques avant/après ces consultations.
Les routes anonymes de présences, dossiers et téléchargements renvoient 401 ;
les DTO publics excluent les présences et motifs. Quatre triggers sont activés,
cinq FK de présence sont RESTRICT. Syntaxe Node, lint et build réussis.
Les essais de saisie et les régressions fonctionnelles demeurent isolés.
La nouvelle exécution complète de test:presences est réussie : 52 contrôles
dans .catalogue-test/auth-c29LVo/auth-results.json, couvrant aussi les blocs
antérieurs. Le contrôle de syntaxe porte sur 63 fichiers backend.

Scripts d'exploitation : scripts/apply-presences-local.mjs --apply
(garde stricte des dix migrations antérieures et refus de réexécution),
scripts/verify-presences-local.mjs --avant puis sans option pour comparer les
empreintes. Rapports : resultats.json, lecture-avant.json et controles-locaux.json
dans le dossier de sauvegarde, sans coordonnées ni contenu documentaire.

## Règles retenues

Une Presence est identifiée par inscriptionId + seanceId (clé primaire composée).
La séance doit appartenir à la session de l'inscription.
La saisie et les corrections exigent une inscription CONFIRMEE et une séance
ayant commencé. Une inscription annulée conserve ses relevés, sa synthèse et
son historique en lecture seule. Aucun relevé n'est créé en consultant une page.

Les quatre états :
- Non renseigné : durée inconnue (NULL), y compris lorsqu'aucune ligne n'existe ;
- Présent : durée exacte complète de la séance ;
- Partiellement présent : minutes entières strictement positives et inférieures
  à la durée complète ; pour zéro choisir Absent, pour la totalité choisir Présent ;
- Absent : durée connue de zéro.

Un premier enregistrement Non renseigné ne crée pas de ligne inutile.
Revenir à Non renseigné après une saisie conserve la fiche et l'historique,
avec un motif de correction obligatoire. Une sauvegarde de valeurs inchangées
n'ajoute aucun événement et n'incrémente pas la révision.

Les durées sont conservées en millisecondes entières BIGINT, sans arrondir la
durée complète d'une séance qui comporterait des secondes ou millisecondes.
La saisie partielle est convertie de minutes entières en millisecondes exactes.
Les calculs reposent sur les instants UTC ; leur affichage utilise Europe/Paris.

## Horaires figés et annulation

Dès qu'une séance possède une fiche Presence, son début, sa fin, sa durée
et son rattachement à la session ne peuvent plus être modifiés.
Le retrait de cette séance est aussi refusé par les FK RESTRICT.
Ce verrou demeure après une correction à Non renseigné ou une annulation.
Il n'existe pas de route supprimant un relevé ou effaçant son historique.

Ce choix évite qu'une présence complète enregistrée pour 3 h 30 devienne
silencieusement une présence de 4 h après modification du calendrier.
Les instants sont aussi copiés sur la fiche et vérifiés à chaque écriture.
Conserver la séance historique ; une réorganisation nécessite une nouvelle
séance, sans déplacer rétroactivement les relevés existants.
Le lieu et les autres informations pratiques restent modifiables.

Le changement de session d'une inscription ayant des présences est également
refusé. L'annulation de l'inscription reste possible ; ses relevés ne disparaissent pas.
La page session distingue les inscriptions confirmées et les relevés historiques
des inscriptions non confirmées.

Les contrôles sont présents dans la route de session et dans PostgreSQL :
quatre triggers vérifient la cohérence de la saisie, écrivent l'audit et verrouillent
séance/inscription. Le trigger d'écriture verrouille les lignes inscription puis
séance pour coordonner annulation et modification horaire avec la saisie.
Les transactions sérialisables complètent ces contrôles lors d'une course.
Une première saisie concurrente avec une modification d'horaire fait aboutir
une seule opération ; aucun relevé ne réinterprète les anciens instants.

## Audit et conflits

Chaque changement effectif conserve auteur, date, ancien/nouvel état,
ancienne/nouvelle durée et motif dans ChangementPresence.
Les corrections exigent un motif court (500 caractères maximum).
L'audit est écrit par un trigger dans la même transaction que le relevé.

Chaque écriture présente la révision attendue (NULL pour une création),
ainsi que début et fin attendus. Un décalage de révision ou d'horaire provoque 409.
La clé primaire empêche toute fiche doublonnée lors de créations simultanées.
L'interface verrouille les doubles clics et demande confirmation avant sauvegarde.

En cas d'erreur ou de conflit, les saisies restent à l'écran.
Après conflit, l'enregistrement est bloqué ; le rechargement est volontaire et
la garde existante avertit si des modifications ne sont pas enregistrées.
Les autres formulaires de relevé ne sont pas réinitialisés par une sauvegarde.

## Synthèses et droits

La synthèse du dossier et celle de la fiche stagiaire présentent :
- somme des durées programmées de toutes les séances, futures comprises ;
- somme des présences connues (zéro reste identifiable comme une absence) ;
- nombre de séances sans durée connue ;
- durée pédagogique annoncée par la formation, distincte du calendrier.

Si aucune durée n'est connue, le total des présences vaut NULL et l'interface
affiche Aucune durée connue. Dès qu'une durée est renseignée, le total est
explicitement partiel tant que des séances restent à renseigner.

Présence renseignée manuellement est affiché sur les pages.
Ni signature, ni conformité, ni attestation, ni état documentaire n'est déduit.

Toutes les saisies, corrections et lectures administratives sont ADMIN.
La lecture stagiaire contrôle le rôle STAGIAIRE et le rattachement actuel à
l'inscription sur chaque requête. ADMIN ne peut pas utiliser cette route personnelle.
Un identifiant d'autrui donne 404. Les écritures reprennent CSRF et origine autorisée.
Les champs JSON sont explicitement autorisés, types et tailles contrôlés.

Les motifs et historiques détaillés ne sont sélectionnés que pour ADMIN.
Le DTO stagiaire exclut aussi auteurs et révisions administratives.
Aucune donnée de présence ne rejoint le catalogue public ou les logs applicatifs.

Routes :
- GET /api/admin/sessions/:id/presences
- GET /api/admin/inscriptions/:id/presences
- PUT /api/admin/inscriptions/:id/seances/:seanceId/presence
- GET /api/stagiaire/inscriptions/:id/presences

Interface :
- Sessions → Gérer les présences, disponible aussi depuis la fiche session ;
- /admin/catalogue/sessions/:id/presences ;
- synthèse dans le dossier et dans la fiche de formation personnelle.
La saisie future est désactivée ; recharger la page après le début de la séance.

## Migration

Le SQL crée un enum, deux tables et quatre fonctions/triggers, sans créer
de fiche pour les inscriptions ou séances existantes.
Les FK sont RESTRICT et les clés de recherche sont indexées.
Le retour arrière versionné refuse toute fiche ou événement existant.
Il est testé sur une base isolée remise explicitement dans l'état approprié ;
il retire les triggers puis tables/fonctions/enum sans toucher aux anciennes données.
Ne pas réconcilier automatiquement l'historique Prisma après un rollback manuel.

La procédure d'application locale vérifie la destination, dix migrations et
leurs empreintes, l'absence de divergence et la sauvegarde conjointe de PostgreSQL
avec son stockage privé, puis la restauration isolée avant prisma migrate deploy.
Ne pas utiliser reset ou db push.

## Tests réellement exécutés

SQL réel sur cluster neuf :
- migration sans divergence Prisma/SQL et conservation des inscriptions existantes ;
- aucune présence implicite ; quatre triggers présents ;
- mauvais rattachement, futur, inscription non confirmée et durées invalides refusés ;
- unicité, motif requis, audit atomique avec anciennes/nouvelles valeurs ;
- modification/suppression de séance refusées après présence ;
- changement de session refusé, annulation conservée ;
- rollback protégé, puis retour arrière et réapplication isolés.

API réelle avec stockage/base dédiés :
- états, saisie partielle, durées négatives/trop longues/égalant la totalité refusées,
  rejet des champs supplémentaires et minutes réservées au partiel ;
- lecture sans création, NULL distinct de zéro, totaux programmés/connus/restants ;
- motif obligatoire, auteur/date/valeurs antérieures, no-op sans historique doublonné ;
- deux créations concurrentes : une fiche et un conflit ;
- modifications de calendrier et retrait de séance avec relevés refusés ;
- correction vers inconnu conservant le verrou, annulation et lecture historique ;
- course première présence/changement horaire sans réinterprétation ;
- ADMIN/STAGIAIRE, CSRF, 401/403/404, isolation entre stagiaires et confidentialité ;
- aucun changement des éléments documentaires.

Navigateur isolé :
- séance passée et séance future désactivée ;
- partiel 90 minutes, confirmation, correction en Présent avec motif obligatoire ;
- garde de sortie, conflit entre deux onglets conservant état/motif puis reprise volontaire ;
- historique affichant auteur, date et valeurs antérieures ;
- modification horaire au clavier refusée sur la séance renseignée ;
- dossier : 4 h 30 programmées, 3 h 30 connues, une séance inconnue, pédagogie 14 h ;
- espace stagiaire en lecture seule, sans motif ni historique détaillé ;
- mobile 390 px sans débordement horizontal.

Régressions : authentification, pôles/formateurs, formations/sessions, catalogue,
préinscriptions, dossiers, fichiers, stagiaires et questionnaires.
Les régressions SQL catalogue, questionnaires, stagiaires, fichiers et dossiers
sont également réexécutées. Lint/build frontend et syntaxe Node réussis.
L'avertissement pg existant sur les requêtes concurrentes apparaît sans échec.

Rapports hors versionnement :
- .catalogue-test/auth-oJJEqg/presences-schema-results.json
- .catalogue-test/auth-NW4sa4/auth-results.json et presences-browser-results.json
- .catalogue-test/auth-ab4ZC2/auth-results.json (dernière suite complète et DTO stagiaire minimisé)
- .catalogue-test/run-HgPAgk/resultats.json
- .catalogue-test/auth-SQn6MN/questionnaires-schema-results.json
- .catalogue-test/auth-BenmNu/stagiaires-schema-results.json
- .catalogue-test/auth-Dr9atx/documents-schema-results.json
- .catalogue-test/auth-mPc7HM/dossiers-schema-results.json

Vérification initiale avant application, en lecture seule :
dix migrations, aucune table Presence, zéro inscription et zéro fichier.

## Scénario manuel reproductible

1. Depuis backend : npm run test:presences -- --browser.
2. Ouvrir l'origine isolée annoncée ; utiliser l'ADMIN temporaire de browser.json
   dans le répertoire indiqué, sans publier ses identifiants.
3. Ouvrir /admin/catalogue/sessions/{sessionId}/presences avec le sessionId du
   fichier presences-browser.json. La séance passée est de 210 minutes ;
   la seconde séance est future et désactivée.
4. Saisir Partiellement présent, 90 minutes, puis enregistrer avec confirmation.
5. Passer à Présent, essayer sans motif puis renseigner le motif et confirmer.
6. Ouvrir deux onglets avant une correction et sauvegarder dans le premier ;
   le second doit afficher un conflit avec ses saisies conservées.
7. Dans la fiche session, tenter de modifier les horaires : vérifier le refus,
   puis quitter sans enregistrer.
8. Ouvrir le dossier avec inscriptionId de presences-browser.json et vérifier
   les totaux connus/inconnus et l'absence de validation documentaire.
9. Se connecter avec le compte stagiaire du même fichier, ouvrir la formation :
   vérifier la consultation seule et l'absence de motif/historique.
10. Pour terminer, créer stop-browser dans le répertoire isolé annoncé.

Ne jamais remplacer les destinations isolées par cmh_academy_dev dans ces tests.

## Fichiers modifiés / ajoutés

Backend :
- prisma/schema.prisma
- prisma/migrations/20261109210000_presences_manuelles/migration.sql
- prisma/rollbacks/20261109210000_presences_manuelles.sql
- lib/presences.js, admin/presences.js, presences-stagiaire.js
- admin/sessions.js, app.js, package.json (commande de test uniquement)
- scripts/lib/test-presences.mjs, scripts/test-presences-schema.mjs
- scripts/test-auth.mjs, test-catalogue.mjs, test-questionnaires-schema.mjs,
  test-stagiaires-schema.mjs, test-documents-schema.mjs, test-dossiers-schema.mjs
- docs/presences-manuelles.md

Frontend :
- src/presences/presence-labels.js, PresenceHistorique.jsx, PresenceSynthese.jsx
- src/admin/SessionPresences.jsx, SessionList.jsx, SessionEditor.jsx,
  AdminWorkspace.jsx, DossierAdministratif.jsx
- src/stagiaire/EspaceStagiaire.jsx.
Les composants de confirmation, la garde de sortie, les appels CSRF, les dates
de Paris et les styles existants sont réutilisés.
