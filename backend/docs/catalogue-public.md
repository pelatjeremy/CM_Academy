# Catalogue public et fiches formation

## Accès et données

Le catalogue est accessible à `/formations` ainsi que sur l'accueil. Les fiches sont
à `/formations/:slug` : liens directs, rechargement et retour au catalogue suivent
la navigation par URL déjà employée dans le projet. Un composant de structure
publique partage l'en-tête, le pied de page et le lien d'évitement.

Le titre du document reprend le titre de la formation chargée. Les textes sont
affichés par React comme du texte (retours à la ligne conservés), jamais injectés
comme HTML. Aucun lien de réservation, inscription ou paiement n'est proposé.

| Endpoint public | Contrat |
| --- | --- |
| GET /api/formations | Inchangé : `{formations:[{id,titre,description}]}`, publiées uniquement |
| GET /api/catalogue/formations | Cartes : id, titre, slug, résumé, description, format, durée, tarif exact, devise et pôle (titre/slug) |
| GET /api/formations/:slug | `{formation:…}` : présentation pédagogique, tarif/financement, pôle, biographies publiques et dates explicitement visibles |

Les nouveaux endpoints sélectionnent chaque champ explicitement et renvoient
`Cache-Control: no-store` pour éviter de conserver une fiche dépubliée en cache.
Inconnue ou non publiée : même réponse 404 « Formation introuvable. ».
Indisponibilité : réponse générique 503. Les pages React affichent chargement,
erreur avec Réessayer, et écran introuvable avec retour au catalogue. En développement,
Vite sert le document de la SPA en HTTP 200 ; c'est l'API de détail qui porte le 404.

Le détail contient titre, slug, résumé, description, objectifs, programme,
publicVise, prérequis, format, dureeMinutes, tarif, devise, financement ; pôle
(titre, slug, description), formateurs (nom, biographie), sessions (lieu et séances
début/fin uniquement). Les timestamps administratifs, capacités, associations internes,
états de publication, parcoursDocumentaire, données d'authentification, modalités
administratives et relation SessionAccesPrive sont exclus. Les autres formations
d'un même pôle ou formateur ne sont pas chargées : aucun brouillon via les relations.

Le montant Decimal PostgreSQL est sérialisé en chaîne à deux décimales. L'affichage
n'utilise pas Number/parseFloat pour le prix : NULL = « Tarif non renseigné »,
0.00 = « Gratuit », sinon montant exact avec devise. Aucune mention HT/TTC ou garantie
non prévue dans les données n'est ajoutée. Le financement renseigné est accompagné
d'un rappel explicite des conditions et de l'absence de prise en charge acquise.

Une formation historique publiée sans slug reste dans le catalogue, avec un texte
indiquant que sa fiche détaillée n'est pas encore disponible. Aucun slug n'est inventé
ni ajouté aux données existantes. Pour ouvrir sa fiche, renseigner un slug unique
dans l'administration.

## Visibilité des sessions

L'inspection a confirmé l'absence d'état de visibilité dans le modèle Session.
La migration minimale `20261025160000_visibilite_sessions` ajoute donc
`visiblePubliquement BOOLEAN NOT NULL DEFAULT false`. Les quatre migrations antérieures
ne sont pas modifiées. Aucun choix de publication n'est déduit du format, du lien
privé ou des dates. Aucune session existante ne devient publique automatiquement.

La case « Afficher cette session sur la fiche publique » est enregistrée avec les
informations de session, sous les protections ADMIN/CSRF et updatedAt existantes.
Elle exige au moins une séance. La liste admin indique si la session est en préparation,
visible ou masquée parce que sa formation est en brouillon.

Une session publique remplit simultanément ces conditions :

1. Sa formation est publiée.
2. Son choix de visibilité est activé explicitement.
3. Elle comporte au moins une séance (également vérifié à la lecture pour les
   éventuelles données introduites directement en SQL).

Une session préparée pour une formation en brouillon reste invisible. Le choix est
conservé lors d'une dépublication/republication du parent ; le texte de la case
précise cette condition. Il n'y a pas d'expiration automatique selon la date : Camille
peut masquer une session passée. L'écran porte donc le titre « Dates des sessions ».
Les sessions et leurs séances sont triées chronologiquement. Le stockage UTC existant
est conservé ; le rendu utilise explicitement Europe/Paris, avec date complète et
décalage UTC pour chaque début/fin, y compris lors du changement d'heure.

Le lieu est une information publique uniquement quand la session est visible ;
le formulaire le rappelle. Les liens, codes et consignes doivent être saisis dans
le panneau privé. Les modalités pratiques ne sont pas exposées dans cette étape.
Sans session visible, le message est exactement :
« Les prochaines dates seront annoncées prochainement ».

## Migration et sauvegarde locale

L'évolution a été expliquée avant application, puis testée sur un cluster neuf
indépendant. Le schéma antérieur est conservé dans
`prisma/baselines/avant-catalogue-public.prisma`.

Le 25 octobre 2026, `scripts/apply-catalogue-public-local.mjs --apply` a vérifié la
destination réelle : boucle locale, port 5432, base cmh_academy_dev, rôle cmh_app ;
les quatre migrations appliquées et leurs empreintes, et l'absence de divergence
avec le schéma antérieur. Le script a produit une sauvegarde custom, l'a restaurée
dans un nouveau cluster dont le répertoire et le port ont été vérifiés, puis a
comparé les données, colonnes et historique avant toute migration locale.

Sauvegarde non versionnée :
`backend/.local-backups/public-20261025-5ECO60/avant-catalogue-public.dump`.
Le `resultats.json` adjacent contient le compte rendu et l'empreinte du fichier.

Application par Prisma Migrate deploy, régénération du client et redémarrage du backend.
Historique final : cinq migrations terminées et schéma sans divergence. Comparaison
intégrale des données métier/utilisateurs/sessions d'authentification avant/après,
à l'exception de la nouvelle colonne dont toutes les valeurs sont false. La formation
existante et le reste des données sont conservés. Aucun reset, db push, seed, compte
ou donnée fictive dans cette base. Le script ponctuel refuse un historique déjà migré.

Le rollback `prisma/rollbacks/20261025160000_visibilite_sessions.sql` refuse de supprimer
le champ si une session est visible. Il a été testé sur la base isolée avec refus,
remise en état compatible, retour arrière et réapplication. Pour revenir en arrière
sur une base partagée, préparer une migration compensatrice revue et préserver les
choix de visibilité ; ne pas laisser un historique Prisma incohérent. Aucun rollback
local de développement n'a été exécuté.

## Tests réellement exécutés

Depuis backend :

```powershell
npm run test:public -- --browser
node scripts/test-public-schema.mjs
npm run test:catalogue
```

Les scripts ne chargent pas le .env du projet. Ils créent un cluster PostgreSQL neuf,
une base dédiée et un client Prisma séparé, vérifient la destination avant écriture,
puis arrêtent leur cluster. Aucune base préexistante n'est supprimée.

SQL/API réels : migration via Prisma, conservation d'une session historique et défaut
false, NOT NULL, rollback protégé/réapplication ; fiche publiée, brouillon et inconnu
404 identiques, listes de champs exactes pour chaque relation ; sessions masquées,
vides, visibles et parent en brouillon ; visibilité activée/masquée avec CSRF,
conflit de version, dates requises et dépublication du parent ; prix exacts, NULL et
zéro ; Paris été/hiver (deux occurrences de 02:30 avec offsets distincts) ; contrat
historique inchangé. Les suites Authentification, Pôles, Formateurs, Formations,
Sessions et contraintes SQL catalogue sont incluses et passent.

Navigateur sur la base isolée : catalogue → fiche → retour ; accès direct/rechargement,
titre du document, fiches gratuite et tarif absent, message sans dates ; brouillon
et slug inconnu introuvables ; HTML hostile affiché littéralement sans création de
balise img ; absence des marqueurs privés ; erreur 503 simulée uniquement par le
serveur de test pour le catalogue et le détail, puis Réessayer avec succès ; affichage
390 × 844 sans débordement et dix horaires rendus avec les offsets de Paris.
La visibilité a aussi été modifiée dans l'administration isolée et son effet vérifié
sur la fiche publique. Le viewport de test a été réinitialisé.

Contrôles statiques/build : lint et build frontend. Vérifications locales finales
en lecture seule : cinq migrations cohérentes ; ancien catalogue, nouveau catalogue
et détails publiés existants via Express et proxy Vite ; 401 admin anonyme et 404
slug inconnu. Les contrôles navigateur sont pilotés, sans suite navigateur autonome
livrée. Aucun déploiement ni configuration d'hébergement.

Preuves non versionnées :

- `.catalogue-test/auth-0tOzxo/auth-results.json` et `public-browser-results.json`.
- `.catalogue-test/auth-0tOzxo/catalogue-public-mobile.png` (données fictives isolées).
- `.catalogue-test/auth-SRzpGp/public-schema-results.json`.
- `.catalogue-test/run-uwZgXI/resultats.json`.

## Guide manuel

1. Démarrer backend et frontend avec `npm run dev` dans chacun des dossiers.
   Ouvrir http://127.0.0.1:5173/formations sans connexion. Vérifier les cartes,
   ouvrir une fiche, recharger l'URL et revenir au catalogue. Vérifier aussi l'accueil.
2. Dans l'administration, ouvrir une session réelle avec séances. Par défaut elle
   reste masquée. Cocher le choix de visibilité et enregistrer seulement si ses
   informations sont destinées au public. La formation doit être publiée.
3. Sur la fiche publique, vérifier lieu, ordre des séances et horaires Europe/Paris.
   Contrôler dans le réseau que les liens/consignes privés ne sont jamais présents.
4. Pour les essais fictifs, lancer `npm run test:public -- --browser` depuis backend
   et utiliser exclusivement le port et le DOSSIER imprimés par ce script. Les slugs
   de test sont `bien-etre-public-test`, `gratuit-public-test`,
   `tarif-absent-public-test` et `brouillon-public-test` (ce dernier doit être introuvable).
5. Tester un slug inconnu, mobile et clavier. Sur le serveur isolé, créer le fichier
   `simulate-public-error` dans le DOSSIER pour provoquer un 503 public ; retirer ce
   fichier puis cliquer Réessayer. Créer `stop-browser` dans ce DOSSIER pour arrêter
   les serveurs et le cluster de test.

## Fichiers modifiés ou ajoutés

- API : `backend/public/catalogue.js`, `backend/app.js`, `backend/admin/sessions.js`.
- Prisma : `backend/prisma/schema.prisma`, baseline `avant-catalogue-public.prisma`,
  migration `20261025160000_visibilite_sessions/migration.sql`, rollback correspondant.
- Public React : `frontend/src/App.jsx`, `frontend/src/App.css`,
  `frontend/src/components/Formations.jsx`, `frontend/src/public/PublicLayout.jsx`,
  `FormationDetail.jsx`, `usePublicResource.js`, `format.js`.
- Admin React : `frontend/src/admin/SessionEditor.jsx`, `SessionList.jsx`,
  `CatalogueResource.jsx` (état d'erreur accessible de la case).
- Tests/application : `backend/package.json`, `backend/scripts/test-auth.mjs`,
  `test-catalogue.mjs`, `test-public-schema.mjs`, `lib/test-public-catalogue.mjs`,
  `apply-catalogue-public-local.mjs`.
- Documentation : ce guide et `README.md`.

Aucune dépendance supplémentaire.
