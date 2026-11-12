# Suivi des documents des stagiaires

Branche : `feat/suivi-documents-stagiaires`, créée depuis la démonstration validée
`feat/demo-camille` au commit `1264b85`. Le développement initial a été vérifié
uniquement en isolation ; l’intégration autorisée du 12 novembre est consignée ci-dessous.

## Réutilisation de l’existant

Le dossier `DossierAdministratif`, ses dix catégories `ElementDocumentaire`, les
versions `PieceJointe`, le partage explicite par version, les sessions de connexion,
CSRF, les téléchargements protégés et le stockage privé sont conservés.
Les catégories sont des emplacements configurables : leur libellé et consigne
peuvent être adaptés. Elles ne constituent pas une liste réglementaire obligatoire.
Aucune pièce n’est demandée ou obligatoire par défaut après migration.

La migration additive `20261112120000_suivi_documents` ajoute les règles par
formation et les instantanés par inscription. Modifier une règle de formation ne
réécrit pas les dossiers existants. Les changements de règles sont historisés avec
leur auteur/date et leurs valeurs avant/après. Désactiver une pièce conserve ses
fichiers et son historique. L’adaptation d’un dossier est une action explicite ADMIN.

Le cycle de vérification est conservé sur le même élément documentaire ; les états
administratifs manuels historiques, notes, présences, acquis et attestations restent
indépendants. Un dépôt configuré passe à `A_VERIFIER`. ADMIN peut passer la version
courante à `VALIDE` ou `A_CORRIGER` avec un motif obligatoire pour la correction.
Activer une demande portant déjà une version la rend vérifiable sans imposer un
nouveau dépôt ; aucune validation ancienne n’est déduite automatiquement.
La complétude compte uniquement les pièces demandées et obligatoires validées,
y compris celles fournies par l’organisme. Une pièce facultative ne bloque pas.

## Accès et stockage

- Administration : `/admin/suivi-documents`, détail `/admin/suivi-documents/:id`.
- Stagiaire : `/stagiaire/inscriptions/:id/documents`, retour à cette URL après connexion.
- Configuration de formation : sélectionner la formation dans le tableau, ouvrir
  « Configuration documentaire de la formation ». S’applique aux futurs dossiers.
- Un ancien dossier sans éléments peut être initialisé explicitement depuis son détail.
- Les pièces destinées au stagiaire sont séparées des documents fournis et partagés
  par l’organisme. Le partage par version reste explicite, privé par défaut.
- PDF, JPEG et PNG, limite configurée existante `DOCUMENT_MAX_FILE_BYTES`
  (10 Mo par défaut), contrôle serveur extension/MIME/signature/taille.
- Nouveaux dépôts : `objets/<inscriptionId>/<categorie>/<UUID>.blob` dans
  le même `DOCUMENT_STORAGE_DIR`. Les anciens objets restent lisibles sans déplacement.
  Aucun nom de personne dans les chemins ; aucun accès statique/public aux fichiers.
- ADMIN pour le suivi, les règles et les décisions ; STAGIAIRE propriétaire pour
  ses demandes, dépôts et téléchargements. Compte actif contrôlé à chaque requête.
  Une inscription annulée/refusée reste consultable selon les règles documentaires
  existantes ; tout nouveau dépôt stagiaire est interdit.
- Toutes les écritures utilisent les protections de rôle, origine et CSRF existantes.
  Les contrôles de propriété/règles/statut sont relus dans la transaction du dépôt.
- Identifiant de dépôt stable pour les reprises, empreinte et auteur comparés lors
  des rejeux ; révisions optimistes et transactions sérialisables avec reprise bornée.
  Décisions liées à la version et identifiant de requête pour les rejeux.
- Promotion exclusive après vérification, suppression compensatoire si aucun
  enregistrement ne référence l’objet ; conservation prudente si commit incertain.
  Audit commun étendu aux sous-dossiers : temporaires, orphelins, manquants, altérations.
  Les orphelins sont signalés pour examen, sans suppression automatique risquée.
- Notes internes, détails de configuration et identifiants des auteurs administratifs
  exclus du DTO stagiaire. Les API publiques existantes conservent leurs sélections.
  Aucun email envoyé ; seul le lien de la rubrique peut être copié manuellement.

## Tests reproductibles et isolés

Depuis `backend`, sans charger `.env` :

```powershell
npm run test:suivi-documents
npm run test:suivi-documents:browser
npm run test:elearning
```

Ces commandes créent un cluster PostgreSQL, un client Prisma et un stockage sous
`.catalogue-test/auth-*`, tous ignorés par Git, avec comptes et fichiers fictifs.
Elles vérifient la destination avant les écritures, appliquent toutes les migrations,
contrôlent la divergence Prisma/SQL, puis arrêtent leur instance. PostgreSQL 18 et
Chrome ou Edge locaux sont nécessaires. Elles ne réutilisent aucune base existante.
Le navigateur utilise 1440 px et 390 px, le clavier, une panne réseau simulée et
le parcours complet de correction puis validation. Captures et résultats restent
locaux dans le dossier de test, avec les seuls secrets éphémères des comptes fictifs.

Depuis `frontend` : `npm run lint` puis `npm run build`.

Pour garder l’environnement fictif ouvert pour une recette manuelle : depuis
`backend`, exécuter `node scripts/test-auth.mjs --suivi-documents --browser`.
Ouvrir l’URL `NAVIGATEUR` affichée ; lire les accès fictifs exclusivement dans
`browser.json` (ADMIN) et `documents-browser.json` (STAGIAIRE) du dossier affiché.
Ne jamais versionner ni transmettre ces fichiers. À la fin, créer un fichier vide
`stop-browser` dans ce même dossier pour arrêter proprement les serveurs isolés.

## Scénario manuel

1. ADMIN : ouvrir « Suivi des documents », filtrer « Suivi documentaire fictif »
   et rechercher « Alice ». Ouvrir la ligne, puis « Contrat signé ».
2. Ouvrir la configuration de cette pièce et la rendre obligatoire ; enregistrer.
   Demander une correction de la version à vérifier, motif « Merci de signer toutes
   les pages ». Copier le lien stagiaire.
3. Dans un autre profil navigateur, ouvrir ce lien avant connexion, se connecter
   avec le compte fictif STAGIAIRE ; vérifier le retour à « Mes documents »,
   la consigne, le motif et l’absence de notes internes.
4. Choisir un faux PDF ou un fichier trop volumineux : vérifier l’erreur et la
   conservation du choix. Transmettre ensuite un PDF/JPEG/PNG valide. Vérifier le
   nom, la date, l’état « À vérifier » et le téléchargement des anciennes versions.
5. ADMIN : actualiser le détail, télécharger la nouvelle version et la valider.
   Vérifier le compteur obligatoire et la complétude, puis l’auteur/date/version
   dans l’historique. Présence, acquis, attestation et statut d’inscription ne changent pas.
6. STAGIAIRE : actualiser, vérifier « Validé », remplacer la pièce et constater
   le retour à « À vérifier ». Refaire à 390 px et au clavier.
7. Tester avec le second stagiaire fictif : un identifiant d’inscription/fichier
   appartenant à Alice doit être refusé. Vérifier deux onglets concurrents : le
   second dépôt/décision reçoit un conflit et les saisies sont conservées.
## Fichiers modifiés ou ajoutés

- `README.md` : accès à cette documentation.
- `backend/prisma/schema.prisma` et
  `backend/prisma/migrations/20261112120000_suivi_documents/migration.sql` :
  règles, révisions, historiques et classement des fichiers.
- `backend/suivi-documents.js` : configuration, tableau, détail, complétude et décisions.
- `backend/admin/fichiers.js` : dépôt versionné partagé entre ADMIN et STAGIAIRE,
  contrôles transactionnels et reprise des transferts.
- `backend/lib/dossiers.js` : instantané des règles lors de l’initialisation.
- `backend/lib/documents.js` : classement privé et audit des sous-dossiers.
- `backend/lib/telechargement.js`, `backend/stagiaire.js`,
  `backend/admin/attestations.js` : compatibilité des téléchargements avec le classement.
- `backend/app.js` : branchement des routes protégées.
- `backend/package.json`, `backend/scripts/test-auth.mjs` : commandes et orchestration
  isolées, migration et parcours navigateur.
- `backend/scripts/lib/test-suivi-documents.mjs` : tests API du nouveau suivi.
- `backend/scripts/lib/test-documents-browser.mjs` : recette navigateur automatisée.
- `backend/scripts/lib/test-documents.mjs` : adaptation des vérifications de stockage
  existantes au classement par inscription.
- `frontend/src/admin/SuiviDocuments.jsx` : tableau, filtres et règles de formation.
- `frontend/src/documents/DocumentsInscription.jsx` : détail documentaire ADMIN/STAGIAIRE.
- `frontend/src/admin/AdminWorkspace.jsx`, `frontend/src/stagiaire/EspaceStagiaire.jsx`,
  `frontend/src/App.jsx` : entrées, rubriques et liens directs.
- `frontend/src/components/Admin.jsx` : destination après connexion.
- `frontend/src/admin/admin.css` : styles des nouveaux formulaires et tableau mobile.
- `backend/docs/suivi-documents-stagiaires.md` : fonctionnement et recette.
## Vérifications effectivement exécutées

- `npm run test:documents` : succès sur base/stockage isolés.
- `npm run test:elearning` : succès ; authentification, catalogue, inscriptions,
  dossiers, fichiers, espace stagiaire, questionnaires, présences, attestations et pédagogie.
- Les mêmes régressions ont également passé dans la commande combinée
  `npm run test:elearning -- --suivi-documents --documents-browser` ; sa partie
  navigateur a alors révélé un sélecteur de test ambigu, corrigé depuis.
- `npm run test:suivi-documents:browser` : succès final, y compris tous les tests
  API du suivi et le parcours navigateur ADMIN → STAGIAIRE → ADMIN, les liens
  après connexion, la reprise après transfert échoué et les vues bureau/390 px.
- Sur les bases isolées : quinze migrations appliquées, validation Prisma,
  génération du client isolé et comparaison SQL/Prisma sans divergence.
- `npm run lint` et `npm run build` dans `frontend` : succès après les derniers changements.
- `node --check` sur les 103 fichiers JavaScript/MJS backend : succès.
- `git diff --check` : succès.
- Captures du tableau et des vues stagiaire inspectées visuellement ; artefacts
  et données fictives conservés uniquement sous `.catalogue-test`, hors Git.

Les premières recettes ont permis de corriger la relecture transactionnelle du
nouveau dépôt, l’audit des sous-dossiers, le retour après connexion et la visibilité
immédiate du motif de correction. Les assertions finales passent. Les suites
existantes émettent un avertissement `pg` de dépréciation lié à leur contrôle de
concurrence sur la connexion SQL de test ; aucun échec associé.
## Intégration locale et préparation Railway — 12 novembre 2026

La migration locale a été appliquée par `apply-suivi-documents-local.mjs` après
sauvegarde conjointe et restauration isolée vérifiée. Quinze migrations sont
terminées, sans divergence : huit lignes métier de référence conservées,
aucune inscription et aucun fichier privé. Le contrôle navigateur local du tableau
vide a utilisé une session ADMIN technique éphémère, supprimée ensuite ; les
empreintes métier sont restées identiques. Aucun compte fictif créé localement.

La démonstration existante conserve ses services et volumes, sans augmentation de
ressources ni activation d’abonnement. Crédit d’essai restant vérifié avant mise
à jour. Une clé SSH de maintenance a été explicitement autorisée pour cette
intervention ; elle doit être révoquée à la fin.

La sauvegarde distante conjointe a été téléchargée sous pause applicative bornée,
avec reprise automatique de secours. Elle contient quatorze migrations, trois
comptes fictifs, deux inscriptions et trois fichiers privés totalisant 2 737 412
octets. PostgreSQL et fichiers ont été restaurés sur un cluster isolé : empreintes
identiques, aucune divergence, puis répétition de la quinzième migration et audit
sans anomalie. Les contenus SQL Git LF et les anciens contenus Windows CRLF ont
été comparés avec leur représentation de déploiement respective ; aucun historique
ni fichier de migration existant n’a été réécrit.

Ordre de publication : laisser le service épinglé au commit de démonstration
précédent pendant le push de la branche ; appliquer seulement la migration additive
avec `migrate-demo.mjs` après restauration vérifiée ; contrôler données/fichiers,
quinze migrations et absence de divergence ; épingler ensuite le service existant
au commit publié de `feat/suivi-documents-stagiaires`. Aucun merge dans `main`.

Scripts de maintenance complémentaires :

- `inspect-demo-documents.mjs` et `lib/railway-maintenance.mjs` : cibles explicites,
  métadonnées et empreintes seulement ; aucune extraction de chaîne de connexion.
- `backup-demo-documents.mjs` : dump dans PostgreSQL, copie SSH du stockage,
  restauration et répétition de migration en isolation.
- `migrate-demo-documents.mjs` : migration gardée par le rapport de restauration,
  contrôle exact des données existantes et des valeurs par défaut non demandées.
- `verify-suivi-documents-local.mjs` : lecture du tableau vide et contrôles locaux.
- `test-documents-deployed.mjs` : scénario fictif sur les trois comptes existants,
  quatre états, parcours réel navigateur, facultatif non bloquant, contrôle des
  droits et comparaison après redémarrage.

Ces scripts d’intervention sont volontairement liés à cette démonstration, à ses
identifiants et aux rapports privés de cette intervention. Ne pas les exécuter sur
une autre cible ni relancer les phases de migration après intégration. Les rapports,
dumps, PDF fictifs, captures, cookies et clés restent exclus de Git et de l’image.
La recette d’annulation vérifie le refus de dépôt et l’accès pédagogique retiré ;
la consultation des propres documents reste autorisée selon les règles existantes.
Les tests restaurent le compte et l’inscription fictifs concernés à leur état initial.

## Résultat de l’intégration autorisée

Migration `20261112120000_suivi_documents` appliquée seule localement et sur
`cmh_academy_demo` avec le mécanisme Prisma existant, sans reset, db push ni seed.
Quinze migrations terminées, aucune divergence ; valeurs nouvelles non demandées,
aucune validation et aucune règle créées automatiquement lors de la migration.

Sauvegardes privées vérifiées :

- Locale : `.local-backups/suivi-documents-20261112-uI4u6x`, PostgreSQL + stockage,
  restauration sur cluster neuf, données et empreintes identiques, audit propre.
- Distante : `.local-backups/demo-documents-20261112-VfDbv9`, PostgreSQL + stockage
  sous pause applicative bornée, restauration sur cluster neuf et répétition de la
  migration ; audit propre. Aucun secret de connexion extrait de Railway.

Ces dossiers sont sous `backend`, exclus de Git et de l’image. Le dump distant
et les trois objets initiaux sont sauvegardés ; leur présence et leurs empreintes
ont été vérifiées avant migration, après migration, puis après déploiement.

| Contrôle | Avant | Après migration | Après scénario fictif |
| --- | ---: | ---: | ---: |
| Migrations locales | 14 | 15 | 15 |
| Lignes métier locales | 8 | 8 | 8 |
| Inscriptions locales / fichiers privés locaux | 0 / 0 | 0 / 0 | 0 / 0 |
| Migrations de démonstration | 14 | 15 | 15 |
| Comptes / inscriptions de démonstration | 3 / 2 | 3 / 2 | 3 / 2 |
| Versions `PieceJointe` | 1 | 1 | 7 |
| Partages documentaires | 1 | 1 | 1 |
| Fichiers privés référencés | 3 | 3 | 9 |
| Octets du stockage privé | 2 737 412 | 2 737 412 | 2 745 920 |

Les six nouveaux fichiers sont des PDF entièrement fictifs de recette. Les
comptes, mots de passe, inscriptions, séances, présences, leçons, progression,
support PDF et vidéo préexistants sont conservés. Le compteur technique du PDF
historique avait été initialisé à zéro malgré une version 1 existante : il a été
réconcilié uniquement sur cette pièce fictive, sans remplacer le fichier ou changer
son partage. Le seed destiné aux futures installations isolées est corrigé ; il
n’a pas été relancé sur une base existante.

Commit applicatif publié et déployé : `61aebcc6fe7c775d63f7454754bcdb51218fbe00`,
branche `feat/suivi-documents-stagiaires`. Railway, service applicatif existant,
déploiement `2a279ac2-81d6-44d8-bd13-11911fa76c27`, état `SUCCESS`.
URL : https://cmh-academy-demo-demonstration.up.railway.app.
Le commit a été épinglé explicitement après migration ; le push n’a pas déclenché
de déploiement automatique. La validation à deux facteurs a été effectuée par
l’utilisateur dans Railway. Aucun merge dans `main`, aucune nouvelle ressource,
aucune augmentation de quota ni activation d’abonnement. Crédits d’essai utilisés.
Les derniers ajustements de recette, du seed isolé et de cette documentation sont
sauvegardés séparément ; ils ne nécessitent pas de reconstruire l’application.

Contrôles réellement passés sur l’URL HTTPS :

- Scénario conservant les quatre états ; Alice : 2/5 obligatoires validées,
  1 manquante, 1 à vérifier, 1 à corriger. Léo : obligatoire validée et facultative
  absente, dossier complet.
- Recherche, filtres formation/session/état et compteurs du tableau ADMIN.
- Documents fournis par l’organisme séparés des demandes au stagiaire.
- Lien direct avant connexion, connexion et retour à « Mes documents ».
- Dépôt, correction motivée, remplacement, validation : deux versions du contrat,
  téléchargement et historique auteur/date/version conservés.
- Téléchargements protégés, isolation de deux stagiaires, rôle ADMIN, refus anonyme,
  CSRF, compte désactivé ; annulation interdit dépôt et parcours. Compte et statut
  temporaires de test restaurés, aucun mot de passe changé.
- Mobile 390 px, clavier, catalogue, parcours, PDF, lecture MP4 réelle, déplacement
  à 8 secondes, HEAD/Range/416, absence de progression automatique.
- Redémarrage du seul service applicatif, sans reconstruction ni redémarrage de
  PostgreSQL : sessions, données, états, décisions, versions et empreintes
  inchangés, puis déconnexions normales testées. Audit des neuf objets sans anomalie.
- Clé SSH temporaire révoquée après les contrôles ; ses copies privées supprimées.

Contrôles locaux et isolés exécutés pendant l’intégration : tableau ADMIN vide et
mobile en lecture seule, absence d’écriture métier, `test:demo` (relancé après la
correction du compteur du seed), `test:format`, lint/build frontend et syntaxe des
110 fichiers JavaScript/MJS backend. Les suites documentaires et e-learning déjà
réussies au développement n’ont pas été rejouées sans modification de leur périmètre.
Rapports et captures de l’URL réelle : `.demo-environment/documents-deployed-results.json`,
`documents-deployed-after-restart-results.json`, `deployed-results.json` et
`deployed-after-restart-results.json`, hors Git.

Limites : appareils physiques iOS/Android, charge et audit de sécurité exhaustif
non effectués. La consultation des propres documents d’une inscription annulée
reste permise conformément à la règle documentaire existante ; le dépôt est interdit
et le parcours pédagogique inaccessible. L’environnement d’essai conserve ses
limites et sa date d’expiration ; aucun engagement payant n’a été ajouté.
Les volumes Railway alloués restent inchangés : PostgreSQL 256 Mo et stockage
applicatif privé 128 Mo, une réplique par service, sans nouvelle ressource.
