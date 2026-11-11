# Administration des sessions et séances

Depuis une fiche Formation enregistrée, utiliser « Sessions de cette formation »
ou « Créer une session pour cette formation ». Le menu Catalogue → Sessions
donne une liste globale paginée (20 éléments), recherchable sur titre de formation,
lieu et modalités générales, filtrable par formation. Les brouillons peuvent avoir
des sessions. Aucune inscription ni suppression de session n'est proposée.

## Modèle et règles

Le modèle existant est réutilisé : Formation → plusieurs Session → plusieurs
Seance. Une séance représente un rendez-vous daté, distinct d'un module pédagogique.
La durée annoncée appartient à Formation, la capacité et les modalités à Session,
les instants début/fin à Seance. Les contraintes et relations catalogue déjà
appliquées sont inchangées.

Saisie explicite en Europe/Paris, conversion serveur vers des instants UTC dans
les colonnes TIMESTAMPTZ(3). La bibliothèque
[@js-temporal/polyfill](https://github.com/js-temporal/temporal-polyfill) assure
la résolution des changements d'heure ; aucune conversion fondée sur le fuseau
de la machine du visiteur. Les connexions Prisma restent en UTC.

- Dates comprises entre 2000 et 2199, précision conservée jusqu'à la milliseconde.
- Une heure inexistante est refusée, sans décalage silencieux.
- Une heure ambiguë exige UTC+02:00 (première occurrence) ou UTC+01:00 (seconde).
- Fin strictement après début ; chevauchements interdits dans la même session.
  Deux séances contiguës sont autorisées. Ordre chronologique dans les réponses.
- Capacité facultative, entière et strictement positive lorsqu'elle est renseignée.
- Au plus 100 séances par enregistrement ; une session sans dates peut être préparée.
- Durée totale calculée sur les instants réels. Un écart avec la durée pédagogique
  produit un avertissement, jamais un blocage automatique. Quatre fois 3 h 30 = 14 h.

Le bouton « Vérifier les horaires » calcule la durée sur le serveur sans écrire
dans la base. Après une saisie, le calcul précédent est retiré pour ne pas afficher
une durée obsolète. Enregistrer recalcule également la durée.

Les modifications de session et de séances sont atomiques, en transaction
Serializable avec reprises limitées. Le retrait explicite d'une séance est appliqué
à l'enregistrement ; la session elle-même ne peut pas être supprimée. Les champs
acceptés sont définis par des schémas Zod stricts.

Chaque écriture utilise la version updatedAt du parent, avec comparaison atomique
et progression stricte. Les accès privés font avancer cette même version. Une
seconde modification depuis une fiche périmée reçoit 409 CONFLICT ; les champs
saisis restent affichés et la fiche doit être rechargée avant une nouvelle sauvegarde.
Le garde de sortie commun protège les saisies, y compris les accès privés non sauvés.
Les modifications directes en SQL qui ne font pas avancer updatedAt échappent à ce
contrôle applicatif : ne pas les employer pour administrer les séances.

## Confidentialité et routes

Toutes les routes ci-dessous héritent des protections existantes : session active,
rôle ADMIN, CSRF pour toute écriture (y compris la vérification POST), no-store.
L'anonyme reçoit 401, un membre 403. Aucun corps de requête ou accès privé n'est
journalisé par ces routes. Pas de dépendance d'authentification supplémentaire.

| Méthode | Route sous /api/admin | Usage |
| --- | --- | --- |
| GET | /sessions?q=&page=1&formationId=… | Liste sans accès privés |
| GET | /sessions/options | Formations, brouillons compris |
| GET | /sessions/:id | Détail avec séances, sans accès privés |
| POST | /sessions | Création |
| PUT | /sessions/:id | Modification atomique avec updatedAt |
| POST | /sessions/verifier-horaires | Validation/calcul sans sauvegarde |
| GET | /sessions/:id/acces-prive | Chargement confidentiel explicite |
| PUT | /sessions/:id/acces-prive | Sauvegarde confidentielle séparée avec updatedAt |

Le lien et les consignes sont stockés uniquement dans SessionAccesPrive. Le panneau
privé doit être ouvert explicitement ; sa sauvegarde est distincte et ne perd pas
les modifications pratiques encore en cours. Les modalités générales ne doivent
contenir ni lien de connexion, ni code, ni consigne confidentielle.
Les listes ne recherchent pas dans les champs privés. Le contrat public reste
`GET /api/formations` : uniquement les formations publiées, avec id, titre, description.

## Migration minimale et application locale

`20261025100000_consignes_sessions` ajoute `SessionAccesPrive.consignes`, texte non
nul vide par défaut. Le lien devient facultatif pour préparer les consignes avant
de connaître l'URL. Les anciens liens sont préservés et un lien non nul reste non vide.
Les trois migrations précédentes ne sont pas modifiées. Le schéma antérieur est
conservé dans `prisma/baselines/avant-sessions.prisma`.

Application effectuée le 25 octobre 2026 uniquement sur la destination vérifiée
`cmh_app`, boucle locale, port 5432, base `cmh_academy_dev`. Le script
`scripts/apply-sessions-local.mjs --apply` vérifie les trois migrations et leurs
empreintes, l'absence de divergence par rapport au schéma antérieur et la destination
réelle. Il sauvegarde en format custom, restaure dans un nouveau cluster indépendant
dont le répertoire est vérifié, compare les données/colonnes/historique, puis applique
`prisma migrate deploy` et régénère le client. Aucun reset/db push ni donnée de test.
Ce script est une procédure ponctuelle : il refuse un historique déjà migré.

Sauvegarde locale non versionnée :
`backend/.local-backups/sessions-20261025-28eHxD/avant-sessions.dump`.
Le fichier `resultats.json` adjacent confirme la restauration et les comparaisons.
Les tables métier, les utilisateurs et les sessions d'authentification ont été
comparés avant/après ; la formation existante et les autres données sont conservées.
Historique final : quatre migrations terminées, client généré et schéma sans divergence.
Le backend local a été redémarré après génération.

Le rollback proposé dans `prisma/rollbacks/20261025100000_consignes_sessions.sql`
refuse toute ligne contenant des consignes ou un lien NULL. Il ne supprime pas
silencieusement ces informations. En cas de retour arrière partagé, préparer une
migration compensatrice revue et un export des informations concernées ; ne pas
exécuter le SQL directement en laissant l'historique Prisma incohérent. Aucun rollback
de la base de développement n'a été exécuté.

## Vérifications réellement exécutées

Depuis backend, PostgreSQL 18 installé localement :

```powershell
npm run test:sessions
node scripts/test-sessions-schema.mjs
npm run test:catalogue
```

Ces commandes ne chargent pas le .env du projet : elles créent un cluster neuf,
une base dédiée et un client Prisma séparé, vérifient répertoire/port/destination
avant écriture, puis arrêtent ce cluster sans supprimer une base préexistante.
Les données fictives et comptes éphémères sont limités à ces bases.

Essais SQL/API réels réussis : quatre séances, UTC, modification/retrait, sessions
de brouillons, capacité, dates, chevauchement, contiguïté, références et identifiants
de séances étrangers, doublons, champs interdits, prévisualisation sans écriture,
heures inexistantes/ambiguës et offsets incorrects, durée non bloquante, confidentialité
des listes/détails/recherche/public, consignes seules et URL, 401/403, CSRF,
versions périmées et modifications simultanées (200/409), pagination, 404 et DELETE 405.
Régressions authentification, pôles, formateurs, formations et catalogue exécutées.
Migration et rollback SQL réels : ancien lien conservé, refus avec consignes ou lien
NULL, retour arrière en état compatible puis réapplication. Le premier essai du
harnais de rollback a révélé un problème de sortie de transaction refusée, corrigé
dans le harnais isolé ; le nouvel essai complet passe.

Parcours navigateur sur la seule base isolée, avec `npm run test:sessions -- --browser` :
connexion, création de quatre séances, modification et rechargement, consignes privées
rechargées, garde de sortie, deux fiches concurrentes avec saisie conservée, capacité
invalide, heure inexistante et heure ambiguë puis choix explicite, avertissement de
durée, clavier, déconnexion et catalogue public. Vue mobile 390 × 844 : pas de
débordement horizontal des huit champs horaires. Le réglage mobile a été remis à zéro.
Les contrôles navigateur sont pilotés, pas une suite autonome Playwright livrée.

Preuves locales non versionnées : `.catalogue-test/auth-jMbamR/auth-results.json`,
`browser-results.json`, `sessions-mobile.png` ; migration/rollback dans
`.catalogue-test/auth-YAbWwn/sessions-schema-results.json` ; régression catalogue
dans `.catalogue-test/run-ZlIzEq/resultats.json`.

Contrôles statiques/build : `npm run lint` et `npm run build` depuis frontend.
Après migration locale : API et proxy Vite 200, contrat public à trois champs,
une formation publiée conservée, accès admin anonyme refusé. Aucun test de création
de données sur cmh_academy_dev. Aucun déploiement.

## Guide manuel

1. Démarrer backend et frontend avec `npm run dev` dans chacun des deux dossiers.
   Ouvrir http://127.0.0.1:5173/admin/connexion et utiliser votre compte existant.
2. Ouvrir une formation puis ses sessions, ou Catalogue → Sessions. Rechercher,
   filtrer et parcourir les pages. Vérifier aussi une recherche sans résultat.
3. Pour les essais fictifs, utiliser exclusivement l'URL imprimée par
   `npm run test:sessions -- --browser` (base isolée). Créer une session, capacité 12,
   puis quatre séances hebdomadaires 09:00–12:30 sur une formation de 14 h.
4. Enregistrer : durée totale 14 h. Recharger, modifier une séance, vérifier
   l'avertissement non bloquant. Essayer capacité 0, fin égale au début ou chevauchement.
5. Essayer le 29/03/2026 à 02:30 (refus), puis le 25/10/2026 à 02:30
   (choix UTC+02:00 ou UTC+01:00 obligatoire).
6. Ouvrir les accès privés, enregistrer les consignes puis le lien séparément.
   Vérifier leur absence dans les listes et la réponse publique.
7. Ouvrir deux fiches identiques ; enregistrer dans la première puis la seconde :
   conflit, saisie conservée. Tester aussi quitter une fiche non enregistrée et rester.
8. Tester sur mobile et au clavier, se déconnecter, vérifier le refus d'accès admin
   et l'accès libre au catalogue. Pour arrêter le serveur isolé, créer un fichier
   `stop-browser` dans le DOSSIER affiché par le test.

## Fichiers de cette étape

- Backend : `admin/sessions.js`, `admin/paris-time.js`, `app.js`, `package.json`,
  `package-lock.json`.
- Schéma : `prisma/schema.prisma`, baseline `avant-sessions.prisma`, migration
  `20261025100000_consignes_sessions/migration.sql` et rollback correspondant.
- Frontend : `admin/SessionList.jsx`, `admin/SessionEditor.jsx`, `admin/session-time.js`,
  `admin/AdminWorkspace.jsx`, `admin/FormationEditor.jsx`, `admin/CatalogueResource.jsx`,
  `admin/resources.js`, `admin/admin.css`.
- Vérification/application : `scripts/lib/test-sessions.mjs`, `scripts/test-auth.mjs`,
  `scripts/lib/isolated-db.mjs`, `scripts/test-sessions-schema.mjs`,
  `scripts/test-catalogue.mjs`, `scripts/apply-sessions-local.mjs`.
- Documentation : ce guide et le README racine.
