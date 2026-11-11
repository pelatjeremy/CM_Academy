# Recette transversale isolée

Exécutée le 11 novembre 2026 sur les douze migrations, sans migration nouvelle,
sans déploiement et sans écriture sur cmh_academy_dev ou son stockage privé.

## Résultat

Les quatorze étapes passent sur un scénario unique. Une formation, un pôle, un
formateur, une session et quatre séances sont créés via les routes ADMIN.
La formation complète est publiée, la session rendue visible et les demandes
ouvertes. L'inscription professionnelle d'Éléonore Recette est confirmée et son
identifiant reste la référence du dossier, du rattachement, des documents,
du questionnaire, des présences et de l'attestation. Noé possède une inscription
distincte à la même session pour contrôler l'isolation.

| Étape | Résultat vérifié |
|---|---|
| 1 Organisme | Configuration fictive via ADMIN/CSRF |
| 2 Catalogue | Pôle, formateur, fiche complète, associations et tarif exact 280.50 EUR |
| 3 Dates | Quatre séances de 210 minutes, Europe/Paris, instants UTC |
| 4 Publication | Brouillon initial, publication explicite, visibilité et ouverture distinctes |
| 5 Demande | Dépôt professionnel public, financeur envisagé distinct de l'organisme formateur ; rejeu sans doublon |
| 6 Confirmation | Deux places confirmées ; rejeu sans nouvel événement de statut |
| 7 Dossier | Un dossier par inscription, dix éléments, parcours activé, initialisation idempotente |
| 8 Invitation | Deux nouveaux comptes STAGIAIRE activés ; lien réutilisé refusé ; rattachements explicites |
| 9 Documents | Deux PDF Programme, versions 1 et 2 ; rejeux sans troisième version ; seule la version 1 partagée |
| 10 Accès | Téléchargement de la version 1 par sa propriétaire, version 2 privée, autre stagiaire refusé, retrait effectif |
| 11 Questionnaire | Cinq types, modèle validé, attribution unique, obligations contrôlées, brouillon, soumission unique, lecture seule |
| 12 Présences | Avant début : refus ; ensuite trois présences complètes et une partielle de 90 minutes |
| 13 Attestation | Aperçu, émission explicite unique, partage par version, états documentaires intacts |
| 14 PDF | Identité, organisme, formation, dates, référence, 14 h programmées et 12 h suivies ; empreinte du téléchargement identique |

Les historiques attendus sont contrôlés : deux changements de statut par
inscription, deux invitations utilisées, deux rattachements, un changement
documentaire, quatre événements de présence et six décisions de partage.
Trois pièces seulement : les deux programmes et une attestation. Les répétitions
de dépôt, confirmation, attribution, soumission et émission n'ajoutent rien.
La note documentaire interne et l'état A_PREPARER de l'attestation sont conservés.

Après redémarrage du backend et recréation du client Prisma, les empreintes des
données sont identiques. Les sessions de connexion restent valides et le même
PDF reste téléchargeable. Un second redémarrage est aussi déclenché pendant le
parcours navigateur. L'audit du stockage ne relève aucun fichier manquant,
altéré, temporaire ancien ou orphelin ; aucun nettoyage automatique.

## Horloge maîtrisée et frontières d'isolation

`createApp({clock})` accepte une fonction interne facultative. Seuls le catalogue
public, l'acceptation des demandes, la saisie des présences et l'émission des
attestations l'utilisent. `server.js` ne fournit jamais ce paramètre : en lancement
normal, chaque service utilise la date réelle. Aucun endpoint, paramètre HTTP
ou variable d'environnement ne permet de changer l'heure de l'application.

Le scénario fixe deux instants métier : avant la première séance puis après la
dernière. Les quatre séances sont ancrées de J-5 à J-2 de l'exécution réelle,
à 08:00 UTC pour 3 h 30 chacune. Le test commence à J-6 et termine à l'instant
réel de départ plus une heure. Ces valeurs exactes figurent dans le rapport.

L'heure système n'est jamais modifiée. L'authentification, les expirations des
sessions et des invitations, les limites de tentatives et les horodatages SQL
d'audit gardent leur horloge réelle. Les dates d'audit représentent donc le
moment d'exécution du test, pas son temps métier simulé. Aucun trigger, contrôle
SQL, garde de rôle ou CSRF n'est désactivé. Les quatre triggers de présence sont
contrôlés actifs ; les séances étant déjà passées dans le temps réel, leur saisie
reste aussi autorisée par clock_timestamp() de PostgreSQL à l'étape finale.
L'application refuse bien la saisie au temps métier initial.

Le runner crée un cluster PostgreSQL neuf, avec rôle, mot de passe, port,
répertoire de données et base aléatoires. Il vérifie sa destination avant les
écritures, applique les douze migrations et génère son propre client Prisma.
Le stockage est sous son dossier .catalogue-test, jamais dans .private-documents.

Le navigateur utilise **127.0.0.2** et des ports éphémères : ses cookies sont
distincts de ceux du site local en 127.0.0.1. Le processus applicatif isolé ne
charge pas .env. La seule connexion à cmh_academy_dev est une transaction
READ ONLY, pour comparer les empreintes avant/après de toutes les tables métier,
de l'historique des migrations et des fichiers privés. AuthSession est exclue
de cette comparaison pour laisser fonctionner la maintenance des sessions du
serveur habituel. Aucun appel de modification n'est adressé au serveur local.

## Navigation réellement exercée

Dans le navigateur de recette :

1. Catalogue → fiche → Demander une place → formulaire professionnel → confirmation de réception.
2. Connexion ADMIN → Inscriptions → Éléonore → Confirmer → Dossier et dix catégories.
3. Après les étapes API restantes : rechargement du dossier, Formation → Sessions
   de cette formation → Gérer les présences, avec la séance partielle conservée.
4. Retour Inscriptions → Dossier → attestation de référence partagée et réponses
   nominatives soumises consultables.
5. Déconnexion → catalogue → Espace stagiaire → connexion Éléonore → Mes formations
   → même inscription → synthèse 14 h/12 h, questionnaire Envoyé et réponses en
   lecture seule → Retour à ma formation → PDF partagé téléchargé.
6. Déconnexion → connexion Noé : sa seule inscription apparaît. L'URL de
   l'inscription d'Éléonore affiche Formation introuvable. Déconnexion finale.

La configuration initiale, l'invitation/activation, les dépôts, les partages,
l'attribution/saisie/soumission du questionnaire, les présences et l'émission
sont réalisés et vérifiés par les API réelles sur cette même chaîne de données.
Ces opérations ne sont pas présentées comme toutes effectuées dans le navigateur.

Le PDF téléchargé au navigateur a été ouvert automatiquement par Acrobat.
Le seul document fictif correspondant a été fermé, puis la copie a été déplacée
vers le dossier isolé après comparaison SHA-256. Aucun autre document touché.

## Exécutions et preuves

- Scénario avec navigateur : `.catalogue-test/auth-Cu5bpx/recette-results.json`,
  quatorze étapes et contrôles de persistance/confidentialité/empreintes réussis.
- Deuxième exécution automatique autonome : `.catalogue-test/auth-QKYL62/recette-results.json`, réussie.
- Régression complète après injection de l'horloge :
  `.catalogue-test/auth-TYFXL4/auth-results.json`, 58 groupes réussis.
- PDF : `pdf-results.json` dans le dossier du scénario navigateur ; vérification
  du texte, des accents, de l'A4, de la pagination, de la référence, des durées
  et de l'absence de notes internes, email ou réponses individuelles.
- Les PDF brouillon et émis ont été rendus avec Poppler et inspectés visuellement.
  Chacun tient sur une page lisible. Copie navigateur :
  `attestation-telechargee-navigateur.pdf`, empreinte identique au PDF du stockage.
- Capture : `recette-presences.png`, espace stagiaire affichant 14 h et 12 h.
- `local-avant.json` et `local-apres.json` : empreintes métier et fichiers identiques.
- Syntaxe Node de 70 fichiers, syntaxe Python, lint et build React réussis.

Aucune anomalie fonctionnelle entre blocs n'a été constatée. Aucun schéma ni
donnée locale n'a été corrigé. L'ajout est un runner reproductible et une horloge
métier injectable. Le vérificateur PDF normalise les espaces et retours de ligne
pour reconnaître les titres qui se répartissent sur deux lignes. Un avertissement
préexistant de pg sur les requêtes simultanées d'un même client apparaît lors des
transactions ; il n'entraîne aucun échec avec la version installée.

## Reproduction automatique

Depuis backend, avec PostgreSQL 18 disponible au chemin habituel (ou CMH_PG_BIN) :

```powershell
npm run test:recette
npm run test:attestations
```

Chaque exécution affiche le dossier isolé et son rapport, sans identifiants ni
jeton. Elle ferme son cluster à la fin sans supprimer de base préexistante.
Les données restent dans ce seul répertoire ignoré par Git pour diagnostic.

Pour vérifier le PDF du dossier affiché, avec Python et pdfplumber disponibles :

```powershell
python scripts/verify-recette-pdf.py .catalogue-test/auth-XXXXXX
```

La version Python groupée avec Codex a été utilisée ici ; aucune dépendance de
production n'a été ajoutée. Poppler peut rendre ensuite les PDF en PNG.

## Reproduction avec navigateur

```powershell
npm run test:recette -- --browser
```

Le runner s'arrête d'abord après l'ouverture des demandes et affiche l'URL du
catalogue ainsi que le dossier de test. `browser.json` contient les identifiants
fictifs, à consulter localement sans les recopier dans les logs. Effectuer la
demande pour eleonore@recette.invalid, la confirmer éventuellement dans ADMIN,
puis créer le marqueur suivant dans le dossier affiché :

```powershell
New-Item -ItemType File .catalogue-test/auth-XXXXXX/demande-publique.continuer
```

Le runner poursuit les API réelles sur cette inscription, puis s'arrête à
`parcours-termine`. `scenario.json` contient les identifiants corrélés et la
référence PDF. Les comptes fictifs sont activés par le test ; leurs mots de passe
restent dans browser.json. Le navigateur peut alors consulter le dossier et les
espaces personnels. Pour laisser tourner le serveur et tester un redémarrage :

```powershell
New-Item -ItemType File .catalogue-test/auth-XXXXXX/parcours-termine.continuer
New-Item -ItemType File .catalogue-test/auth-XXXXXX/redemarrer
```

Attendre `redemarrage-verifie`, puis recharger le navigateur. Finir avec :

```powershell
New-Item -ItemType File .catalogue-test/auth-XXXXXX/stop-browser
```

Le marqueur d'arrêt fonctionne aussi pendant les pauses ; un scénario arrêté
avant sa fin est signalé incomplet. Ranger les éventuels téléchargements fictifs
dans ce même dossier isolé. Aucun compte réel ni donnée de démonstration locale.

## Fichiers de l'étape

- backend/scripts/recette-transversale.mjs et verify-recette-pdf.py ; package.json.
- backend/app.js ; public/catalogue.js ; public/preinscriptions.js ;
  admin/presences.js et admin/attestations.js : injection facultative d'horloge.
- Ce document. Aucun changement Prisma, migration, frontend ou dépendance.
