# Application locale — 24 octobre 2026

**Migration `20261024150000_catalogue` appliquée avec succès** à
`cmh_academy_dev`, PostgreSQL 18.6 sur localhost:5432 (adresse effective ::1),
rôle cmh_app. Aucun déploiement ni ajout de données de démonstration.

## Sauvegarde vérifiée

Archive custom PostgreSQL, hors versionnement :

`backend/.local-backups/catalogue-20261024-NkFCrh/avant-catalogue.dump`

Vérification par `pg_restore --list`, puis restauration réelle avec
`--exit-on-error --no-owner --no-acl` dans un cluster neuf indépendant.
Les formations, colonnes et migrations restaurées étaient identiques à
l'original. Cette instance a ensuite été arrêtée ; aucune base préexistante
n'a été supprimée.

Le dossier privé contient `resultats.json` avec empreinte SHA-256 de l'archive,
empreinte des données historiques et étapes réalisées, ainsi que les diagnostics
masqués et le cluster de restauration arrêté. Il contient des données de
sauvegarde et des identifiants de test : ne pas le publier. Il est ignoré par Git.

## Contrôles effectués

- Avant application : une seule migration initiale terminée, checksum conforme,
  absence de divergence avec le schéma antérieur.
- Sauvegarde restaurée avant la montée ; base inchangée entre sauvegarde et DDL.
- Application par `prisma migrate deploy`, puis `prisma generate`, sans reset
  ni db push.
- Après application : deux migrations terminées, checksums conformes, ligne de
  migration initiale inchangée ; diff PostgreSQL/Prisma vide.
- Six tables créées : Pole, Formateur, FormationFormateur, Session, Seance,
  SessionAccesPrive ; contraintes CHECK et six FK attendues présentes.
- Formations identiques avant/après : zéro ligne. Aucun INSERT métier effectué.
- Ancien backend arrêté, puis `npm run dev` relancé avec le client régénéré et
  l'adaptateur UTC. Connexion applicative contrôlée : cmh_academy_dev, TimeZone UTC.
- HTTP 200 pour `/api/health/database` et `/api/formations`, directement sur
  Express et via Vite ; réponse `{ "formations": [] }`.
- React contrôlé dans le navigateur : serveur connecté, message « Aucune
  formation disponible pour le moment », aucune erreur console capturée.
- Contrat public conservé : filtre publiee=true, projection id/titre/description,
  aucune relation privée ou donnée d'accès exposée.

Le contrôle public local porte sur une liste vide. Le scénario avec fiches
publiées, brouillons et accès privés fictifs a été validé sur l'instance isolée,
sans ajout de données ici : voir `catalogue-tests.md`.

## Procédure conservée

`scripts/apply-catalogue-local.mjs` conserve les garde-fous utilisés. Il exige
`--apply` et l'état initial à une seule migration ; il n'est pas à relancer sur
la base déjà migrée. En cas d'échec, il conserve des diagnostics masqués sans
correction destructive automatique. Aucune dépendance ajoutée.
