# Dossier administratif individuel

Le dossier s'ouvre depuis Inscriptions, puis « Ouvrir le dossier administratif ».
L'URL est /admin/inscriptions/:id/dossier. Tous les statuts d'inscription donnent
accès à la synthèse, au financement et à l'historique.

## Référence et conservation

DossierAdministratif a pour clé primaire inscriptionId, également clé étrangère
vers Inscription. Les coordonnées, le type de demande et l'organisme sont lus sur
l'inscription. La formation et les séances sont lus via sa session.

Le booléen parcoursDocumentaire est copié une seule fois sur le dossier.
Pour une nouvelle préinscription, cette copie intervient dans la transaction de
dépôt. Pour les inscriptions existantes, la migration prend la valeur de la
formation au moment de son application. Cette copie constitue la configuration
conservée du dossier, indépendamment des changements ultérieurs de la formation.

Un dossier activé contient dix catégories persistées. Un dossier désactivé
conserve sa synthèse et son historique, avec une préparation documentaire
désactivée. Aucun réglage ultérieur de formation ne supprime ou ne crée d'éléments
dans un dossier déjà initialisé. Une évolution volontaire d'un dossier existant
nécessiterait un parcours explicite qui sera à définir séparément.

Les catégories sont entretien initial, positionnement, convention ou contrat,
règlement intérieur, programme, émargement, évaluations, satisfaction à chaud,
satisfaction à froid et attestation. Les états manuels sont À préparer, En attente,
Reçu, Vérifié et Non applicable. Les notes sont limitées à 500 caractères.

Le compteur « restant à traiter » comprend À préparer, En attente et Reçu.
Vérifié et Non applicable clôturent un élément pour ce seul suivi manuel.
L'écran rappelle explicitement qu'un état ne prouve aucune signature, présence ou
conformité. Aucun traitement métier ne déduit ces faits des états manuels.

## Écritures et sécurité

- La création d'un dossier et de ses éléments fait partie de la transaction de
  nouvelle préinscription. Le dépôt reste atomique.
- La migration initialise les inscriptions antérieures, quel que soit leur statut.
  Ses INSERT utilisent ON CONFLICT DO NOTHING.
- La route explicite d'initialisation traite aussi une inscription introduite
  directement en SQL. Elle peut être rejouée et ne modifie pas un dossier existant.
- Une consultation GET ne crée ni dossier, ni élément, ni historique.
- Chaque sauvegarde compare updatedAt et fait avancer cette version strictement.
  Les éléments et leur historique sont sauvegardés dans une transaction Serializable.
- Une modification d'état ou de note conserve avant/après, date et auteur ADMIN.
  Une sauvegarde sans changement ne produit aucun événement.
- Les changements concurrents donnent un conflit 409. La saisie reste affichée.
  Le lien Recharger utilise l'avertissement de sortie commun.
- Les clés étrangères utilisent RESTRICT pour préserver les références et l'audit.

Les trois routes sont sous /api/admin/inscriptions/:id/dossier. GET consulte le
dossier, POST sur /initialiser l'initialise, PUT sauvegarde les éléments. Les routes
héritent des contrôles de session active, rôle ADMIN et CSRF sur les écritures.
Les champs sont validés strictement et les réponses utilisent des sélections
explicites. La configuration, l'auteur et la date ne sont pas des champs éditables
du formulaire. Les notes sont affichées comme texte par React.

L'historique de l'écran réunit les événements d'inscription existants, un événement
d'initialisation système daté et les modifications documentaires attribuées à leur
administrateur. Les données restent dans les réponses administrateur.

## Migration préparée

Migration versionnée 20261109150000_dossiers_administratifs, avec trois tables et
deux enums. Elle conserve les inscriptions et initialise les dossiers dans la même
transaction. Son SQL est autonome et utilise explicitement UTC pour les dates
d'initialisation. Les anciennes migrations ne sont pas modifiées.

La migration a été appliquée uniquement sur des clusters de test isolés.
Son application à cmh_academy_dev reste réservée à l'étape suivante, avec la
procédure habituelle de destination, historique, sauvegarde et restauration de
contrôle avant Prisma Migrate deploy et génération du client.

Le retour arrière préparé refuse toute suppression dès qu'un dossier, un élément
ou un historique existe. Son refus a été testé avec des données. Le retour arrière
sur schéma vide puis la réapplication ont été exercés dans la régression catalogue.
Un retour arrière d'une base partagée devra passer par une migration compensatrice
revue et la conservation des données.

## Vérifications réellement exécutées

Depuis backend, avec PostgreSQL 18 installé localement, lancer les commandes suivantes.

    npm run test:dossiers -- --browser
    node scripts/test-dossiers-schema.mjs
    npm run test:catalogue

Les scripts créent une instance et une base neuves, vérifient port, répertoire et
destination avant écriture, puis ferment leur cluster. Le client Prisma de test
est généré dans le dossier isolé. Les comptes et données fictifs y restent.

Les essais SQL ont couvert cinq inscriptions antérieures, les quatre statuts,
l'activation et la désactivation, la conservation des lignes, la réinitialisation
répétée après changements de formation et la préservation d'états/notes existants.
Les contraintes d'unicité, longueur, enum et suppression, ainsi que le refus du
rollback avec données, ont été vérifiées. Prisma migrate diff confirme l'absence
de divergence entre le SQL appliqué et le schéma cible.

Les essais API ont couvert la consultation sans écriture, deux initialisations
simultanées, les dix catégories, les cinq états, les notes et les champs interdits,
l'audit daté et attribué, la sauvegarde sans effet, les versions périmées et deux
modifications concurrentes. Ils vérifient également tous les statuts, le parcours
désactivé conservé, la création automatique au dépôt et la confidentialité publique.
Les suites authentification, pôles, formateurs, formations, sessions,
préinscriptions et catalogue ont aussi passé.

Dans le navigateur isolé, ouverture depuis la liste, recherche, synthèse et
financement, modification des états/notes, compteur restant, garde de sortie,
sauvegarde et rechargement ont été vérifiés. Deux onglets ont produit un conflit
avec conservation de la note saisie. Le parcours désactivé d'une inscription
annulée a été consulté. À 390 × 844 pixels, les dix catégories restent accessibles
au clavier sans débordement horizontal. Le réglage mobile a été remis à zéro.

Syntaxe backend, lint et build frontend font partie des contrôles finaux.
Les preuves non versionnées se trouvent dans les dossiers suivants.

- .catalogue-test/auth-TQSmsd/auth-results.json
- .catalogue-test/auth-TQSmsd/dossiers-browser-results.json
- .catalogue-test/auth-TQSmsd/dossier-mobile.png
- .catalogue-test/auth-DB7HWy/dossiers-schema-results.json
- .catalogue-test/run-7t5b4C/resultats.json

## Scénario manuel sur la base isolée

1. Lancer npm run test:dossiers -- --browser depuis backend. Utiliser le port et
   le DOSSIER affichés. Les identifiants temporaires se trouvent dans browser.json
   à cet emplacement local ignoré du versionnement.
2. Se connecter puis ouvrir Inscriptions. Rechercher Zoé et ouvrir son dossier.
3. Vérifier la synthèse, le financement et les dix catégories. Choisir Reçu ou
   Vérifié, ajouter une note, tenter de quitter et choisir Rester sur la fiche.
4. Enregistrer puis recharger. Vérifier les valeurs et l'auteur/date dans
   l'historique. Reçu reste à traiter, Vérifié et Non applicable diminuent le compteur.
5. Ouvrir le même dossier dans deux onglets. Enregistrer dans le premier puis
   enregistrer une saisie différente dans le second. Vérifier le conflit, la
   saisie conservée et le garde de sortie lors du rechargement.
6. Rechercher annulee@dossier.invalid et consulter le dossier désactivé.
   Vérifier aussi sur mobile.
7. Pour arrêter le test, créer le fichier stop-browser dans le DOSSIER affiché.

## Fichiers modifiés ou ajoutés

- backend/prisma/schema.prisma
- backend/prisma/migrations/20261109150000_dossiers_administratifs/migration.sql
- backend/prisma/rollbacks/20261109150000_dossiers_administratifs.sql
- backend/lib/dossiers.js
- backend/admin/dossiers.js
- backend/admin/inscriptions.js
- backend/public/preinscriptions.js
- backend/app.js
- frontend/src/admin/DossierAdministratif.jsx
- frontend/src/admin/dossier-labels.js
- frontend/src/admin/Inscriptions.jsx
- frontend/src/admin/AdminWorkspace.jsx
- frontend/src/admin/admin.css
- backend/scripts/lib/test-dossiers.mjs
- backend/scripts/test-dossiers-schema.mjs
- backend/scripts/test-auth.mjs
- backend/scripts/test-catalogue.mjs
- backend/package.json
- backend/docs/dossiers-administratifs.md

Aucune dépendance supplémentaire.
