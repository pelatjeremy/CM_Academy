# Essais réels du catalogue — 24 octobre 2026

**Cycle complet réussi sur une instance PostgreSQL 18 isolée.** La base actuelle
n'a été ni utilisée ni modifiée pendant cette campagne. Aucune base préexistante
n'a été supprimée. Aucun déploiement.

## Isolation et reproduction

Depuis `backend` :

```powershell
npm run test:catalogue
```

Prérequis : Node.js 24, dépendances du projet installées et binaires PostgreSQL
18 dans `C:/Program Files/PostgreSQL/18/bin`. Définir `CMH_PG_BIN` pour un autre
emplacement. Aucun téléchargement ni dépendance supplémentaire.

`scripts/test-catalogue.mjs` ne charge pas `backend/.env`. Il retire les variables
de connexion héritées des processus enfants, initialise un cluster dans un
répertoire unique `.catalogue-test/`, puis le démarre sur un port libre en boucle
locale, avec un rôle et un mot de passe propres, en authentification SCRAM.
Avant CREATE DATABASE, puis avant les écritures et phases de migration, il
vérifie le répertoire réel du cluster, l'adresse, le port, le rôle et la base.
La nouvelle base a un nom aléatoire dont l'absence est vérifiée.

La configuration comprend un fichier `.env.test`, un fichier Prisma distinct et
un client cible généré séparément : le client actuel n'est pas remplacé.
L'instance et les processus Express de test sont arrêtés à la fin.

Sous cet environnement Windows, `pg_ctl start` échoue à créer son jeton restreint.
Le script lance directement le binaire installé `postgres.exe`, en fenêtre
cachée, sans changer de privilège. L'arrêt par `pg_ctl stop` fonctionne.

Les artefacts restent locaux, exclus par `.gitignore`. Ils contiennent des
identifiants **de test** : ne pas publier ces répertoires. Le résumé
`resultats.json` ne contient aucun secret. Dernière campagne réussie :
`backend/.catalogue-test/run-CbPz7Y/resultats.json`, base dédiée
`cmh_catalogue_test_3172f22f276e`, port local `54530`, instance arrêtée.
Un nouveau lancement crée un autre cluster ; il ne réutilise ni n'efface ceux
des campagnes précédentes.

## Vérifications statiques

Relecture du schéma, de la montée et du rollback : aucune correction de leur
structure nécessaire. `prisma validate` et les contrôles de syntaxe JavaScript
ont réussi.

- Identifiants/FK en TEXT ; cuid généré par Prisma.
- updatedAt géré par Prisma, sans défaut SQL ni trigger implicite.
- Suppressions métier en RESTRICT ; cascades limitées aux liaisons et accès privés.
- Unicité des slugs renseignés, plusieurs NULL autorisés pour la compatibilité.
- Clé composée FormationFormateur et index couvrant chaque FK, y compris les
  préfixes gauches des clés composées.
- Tarif DECIMAL(12,2), séances TIMESTAMPTZ(3) et fuseau de présentation séparé.
- Projection publique explicite limitée à id/titre/description et filtre publiee.

## Correction issue d'un essai réel

Un essai Prisma a stocké `2026-11-02T07:00:00Z` au lieu de
`2026-11-02T08:00:00Z` pour une séance prévue à 09 h à Paris. Le code local de
l'adaptateur installé (`mapArg` / `formatDateTime` dans @prisma/adapter-pg)
transmet les dates en UTC sans suffixe de fuseau ; une connexion non UTC les
réinterprète dans son fuseau.

Correction : `lib/prisma-adapter.js`, partagé par l'application et les tests,
fixe les connexions Prisma en UTC avec `-c timezone=UTC`. Aucun ALTER DATABASE,
ALTER ROLE ou changement global. Session.fuseauHoraire reste Europe/Paris.
La suite contrôle l'instant réellement stocké, sa relecture par Prisma et le
fuseau de connexion ; elle échouait avant cette correction.

Le backend habituel devra être redémarré pour prendre ce code en compte. La
campagne ne le redémarre pas et ne se connecte pas à sa base.

## Essais SQL et HTTP réellement exécutés

| Essai | Résultat |
| --- | --- |
| Initialisation | Schéma historique et deux anciennes formations fictives, publiée/brouillon |
| Montée avec Prisma Migrate | Réussite ; six valeurs historiques inchangées, nouveaux défauts compatibles |
| Créations Prisma | Pôle, deux formateurs, formation, deux sessions, quatre séances et accès privé |
| Identifiants et dates | TEXT/cuid valides ; updatedAt créé puis actualisé sur les six modèles concernés |
| SQL brut | Absence d'id ou updatedAt rejetée ; pas d'actualisation implicite de updatedAt |
| Montants | 1234.56 conservé exactement ; zéro accepté ; négatif et NaN rejetés |
| Durée/capacité | Zéro et négatif rejetés ; NULL accepté |
| Unicité | Doublons de slugs, association FormationFormateur et accès privé par session rejetés |
| Autres contraintes | Slug mal formé, devise minuscule, format inconnu, fuseau vide et lien privé vide rejetés |
| Dates | Fin égale/antérieure au début et fin infinie rejetées |
| Clés étrangères | Les six références inexistantes rejetées |
| RESTRICT | Suppression de pôle utilisé, formation avec sessions et session avec séances refusée |
| Cascades | Liaisons seules lors de suppression de formateur/formation sans sessions ; accès privé seul lors de suppression de session sans séances |
| Fuseau SQL et Prisma | Le 25 octobre 2026, 02:30+02 à 02:30+01 représente bien 60 minutes ; instants conservés via l'adaptateur corrigé |
| Index PostgreSQL | Index de toutes les FK présents |
| Vrai Express, client actuel puis cible | HTTP 200, deux formations publiées seulement, trois champs exacts, aucun accès/token privé fictif |
| Rollback avec données nouvelles | Refus P0001, transaction annulée, quatre séances conservées |
| Rollback avec tables nouvelles vides et champs Formation renseignés | Refus P0001 également |
| Retour arrière après remise en état | Réussite, six colonnes historiques et deux anciennes formations fictives préservées |
| Réapplication du SQL de montée | Réussite, six nouvelles tables recréées, anciennes formations fictives intactes |
| Fin | Instance arrêtée, aucune base préexistante supprimée |

Les essais de cascade utilisent des transactions annulées après contrôle.
Les refus du rollback sont suivis d'un ROLLBACK explicite avant relecture.
La remise en état ne supprime/réinitialise que les données fictives de cette
base nouvellement créée.

## Limites

- PostgreSQL 18 et versions installées de Prisma/pg ; pas d'essai de charge,
  de contention sur grosse table ou de restauration de sauvegarde.
- Montée initiale testée via Prisma Migrate ; rollback et réapplication finale
  testés directement comme scripts SQL sur la base jetable. Le parcours de
  compensation versionnée décrit dans catalogue.md n'a pas été exécuté.
  Ne pas transposer ce rollback manuel sur une base partagée : son historique
  doit rester cohérent grâce à une migration compensatrice.
- Les chevauchements, la somme des durées et la validation complète IANA du
  fuseau restent des validations futures. PostgreSQL accepte une date sans
  offset en utilisant le fuseau de connexion ; la saisie devra imposer un
  offset ou une conversion locale/IANA maîtrisée.
- DECIMAL(12,2) arrondit une entrée à plus de deux décimales : la future
  validation monétaire devra traiter la précision à la saisie.
- Tests HTTP backend uniquement, sans nouvelle campagne navigateur ; aucun
  écran React, administration, inscription, paiement, signature ou document ajouté.
