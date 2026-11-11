-- Retour arrière gardé hors de migrations/ pour ne pas être exécuté à la montée.
-- À transformer en migration compensatrice après revue (voir docs/catalogue.md).
-- Refuse de détruire un catalogue déjà renseigné. Aucun CASCADE de suppression.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE "public"."Formation", "public"."Pole", "public"."Formateur",
    "public"."FormationFormateur", "public"."Session", "public"."Seance",
    "public"."SessionAccesPrive" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."Pole")
        OR EXISTS (SELECT 1 FROM "public"."Formateur")
        OR EXISTS (SELECT 1 FROM "public"."FormationFormateur")
        OR EXISTS (SELECT 1 FROM "public"."Session")
        OR EXISTS (SELECT 1 FROM "public"."Seance")
        OR EXISTS (SELECT 1 FROM "public"."SessionAccesPrive")
        OR EXISTS (
            SELECT 1 FROM "public"."Formation"
            WHERE "slug" IS NOT NULL OR "poleId" IS NOT NULL
                OR "resume" <> '' OR "objectifs" <> '' OR "programme" <> ''
                OR "publicVise" <> '' OR "prerequis" <> ''
                OR "dureeMinutes" IS NOT NULL OR "format" IS NOT NULL
                OR "tarif" IS NOT NULL OR "devise" <> 'EUR'
                OR "financement" <> '' OR "parcoursDocumentaire"
        ) THEN
        RAISE EXCEPTION 'Retour arrière refusé : le nouveau catalogue contient des données. Préparer une restauration ou une migration conservant ces données.';
    END IF;
END $$;

DROP TABLE "public"."SessionAccesPrive";
DROP TABLE "public"."Seance";
DROP TABLE "public"."Session";
DROP TABLE "public"."FormationFormateur";

-- Les contraintes et index qui dépendent des colonnes supprimées disparaissent
-- avec ces colonnes. Les six colonnes historiques sont conservées à l'identique.
ALTER TABLE "public"."Formation"
    DROP COLUMN "slug",
    DROP COLUMN "resume",
    DROP COLUMN "objectifs",
    DROP COLUMN "programme",
    DROP COLUMN "publicVise",
    DROP COLUMN "prerequis",
    DROP COLUMN "dureeMinutes",
    DROP COLUMN "format",
    DROP COLUMN "tarif",
    DROP COLUMN "devise",
    DROP COLUMN "financement",
    DROP COLUMN "parcoursDocumentaire",
    DROP COLUMN "poleId";

DROP TABLE "public"."Formateur";
DROP TABLE "public"."Pole";
DROP TYPE "public"."FormatFormation";
COMMIT;
